import test from 'node:test';
import assert from 'node:assert/strict';
import {pbkdf2Sync} from 'node:crypto';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {openDatabase, createHandler} from '../server/2026-10-12-aws-server.mjs';

const origin = 'https://sejongscape.test';
function setup(t) {
  const directory = mkdtempSync(resolve('2026-10-12-aws-test-'));
  for (const name of ['index','sumo','traffic','real']) writeFileSync(resolve(directory, name + '.html'), '<html><body>' + name + '</body></html>');
  const DB = openDatabase(':memory:');
  const hash = password => pbkdf2Sync(password, 'test-salt', 100000, 32, 'sha256').toString('hex');
  const env = {PUBLIC_ORIGIN:origin, DB, SITE_PASSWORD_HASH:hash('visitor-password'), SITE_PASSWORD_SALT:'test-salt', SITE_SESSION_KEY:'test-key', ADMIN_PASSWORD_HASH:hash('owner-password'), ADMIN_PASSWORD_SALT:'test-salt', SITE_OWNER_EMAIL:'owner@example.test'};
  const handler = createHandler(env, directory);
  t.after(() => {DB.close(); rmSync(directory, {recursive:true});});
  const request = (path, options = {}) => new Request(origin + path, options);
  const login = async (admin = false, password = admin ? 'owner-password' : 'visitor-password') => handler(request(admin ? '/OSM/login' : '/access/login', {method:'POST', headers:{origin}, body:new URLSearchParams({password})}), '192.0.2.1');
  return {handler, request, login, DB, env, directory};
}
const session = response => response.headers.get('set-cookie').split(';')[0];

test('visitor login protects all pages, sessions survive navigation, and tampering fails', async t => {
  const {handler, request, login} = setup(t);
  for (const path of ['/','/sumo','/real','/traffic']) assert.equal((await handler(request(path))).status, 303);
  assert.equal((await handler(request('/api/traffic'))).status, 401);
  const signedIn = await login();
  assert.match(signedIn.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Lax/);
  const cookie = session(signedIn);
  for (const path of ['/','/sumo','/real','/traffic']) assert.equal((await handler(request(path, {headers:{cookie}}))).status, 200);
  assert.equal((await handler(request('/', {headers:{cookie:cookie + 'invalid'}}))).status, 303);
  assert.equal((await handler(request('/server/index.js', {headers:{cookie}}))).status, 404);
  const realNow = Date.now;
  try { Date.now = () => realNow() + 9 * 3600000; assert.equal((await handler(request('/', {headers:{cookie}}))).status, 303); }
  finally { Date.now = realNow; }
});

test('admin needs a separate password, spoofed identity is rejected, and viewer cookies grant no admin access', async t => {
  const {handler, request, login} = setup(t);
  const viewer = session(await login());
  assert.equal((await handler(request('/OSM', {headers:{cookie:viewer, 'oai-authenticated-user-email':'owner@example.test', 'oai-authenticated-user-id':'owner'}}))).status, 303);
  assert.equal((await handler(request('/api/admin/visits', {headers:{cookie:viewer}}))).status, 401);
  assert.equal((await login(true, 'visitor-password')).headers.get('location'), '/OSM/login?error=wrong');
  const loggedIn = await login(true);
  assert.equal(loggedIn.headers.get('location'), '/OSM');
  const admin = session(loggedIn);
  assert.match(admin, /^__Host-sejong-admin=/);
  assert.equal((await handler(request('/OSM', {headers:{cookie:admin}}))).status, 200);
  assert.equal((await handler(request('/api/admin/visits', {headers:{cookie:admin}}))).status, 200);
  assert.equal((await handler(request('/api/me', {headers:{cookie:viewer}}))).status, 200);
  assert.equal((await (await handler(request('/api/me', {headers:{cookie:viewer}}))).json()).isOwner, false);
  assert.equal((await (await handler(request('/api/me', {headers:{cookie:viewer + '; ' + admin}}))).json()).isOwner, true);
});

test('visits deduplicate, record trusted peer only, and traffic falls back to stored observations', async t => {
  const {handler, request, login, DB} = setup(t);
  const cookie = session(await login());
  const visit = () => request('/api/visits', {method:'POST', headers:{cookie, origin, 'cf-connecting-ip':'203.0.113.9', 'x-real-ip':'203.0.113.8'}, body:JSON.stringify({path:'/sumo'})});
  assert.equal((await handler(visit(), '192.0.2.1')).status, 200);
  assert.equal((await handler(visit(), '192.0.2.1')).status, 200);
  assert.equal(DB.prepare('SELECT COUNT(*) AS n FROM visits').first().n, 1);
  assert.equal(DB.prepare('SELECT ip FROM visits').first().ip, '192.0.2.1');
  const traffic = await (await handler(request('/api/traffic', {headers:{cookie}}))).json();
  assert.equal(traffic.mode, 'saved'); assert.ok(traffic.items.length > 0);
  assert.equal((await handler(request('/api/visits', {method:'POST', headers:{cookie, origin:'https://evil.test'}, body:'{}'}))).status, 403);
});

test('cross-origin password submission is rejected and failures are rate-limited', async t => {
  const {handler, request, login} = setup(t);
  assert.equal((await handler(request('/access/login', {method:'POST', headers:{origin:'https://evil.test'}, body:'password=visitor-password'}))).status, 403);
  for (let i = 0; i < 10; i++) await login(false, 'wrong');
  assert.equal((await login()).headers.get('location'), '/access/login?error=limit');
});


test('old administrator URLs redirect to OSM and the login form posts to the new URL', async t => {
  const {handler,request}=setup(t);
  for(const path of ['/admin','/admin/']){
    const r=await handler(request(path));assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/OSM');
  }
  const oldLogin=await handler(request('/admin/login?error=wrong'));
  assert.equal(oldLogin.headers.get('location'),'/OSM/login?error=wrong');
  assert.equal((await handler(request('/admin/login',{method:'POST',headers:{origin},body:'password=test'}))).status,307);
  for(const path of ['/OSM','/OSM/'])assert.equal((await handler(request(path))).headers.get('location'),'/OSM/login');
  const page=await handler(request('/OSM/login'));assert.equal(page.status,200);
  assert.match(await page.text(),/action="\/OSM\/login"/);
  assert.equal((await handler(request('/OSM/login',{method:'POST',headers:{origin:'https://evil.test'},body:'password=test'}))).status,403);
});


test('rotating only administrator credentials revokes administrator sessions and retains visitor sessions', async t => {
 const {handler,request,login,env,directory}=setup(t);
 const visitor=session(await login()),admin=session(await login(true));
 const salt='new-test-salt';
 const next={...env,ADMIN_PASSWORD_SALT:salt,ADMIN_PASSWORD_HASH:pbkdf2Sync('new-owner-password',salt,100000,32,'sha256').toString('hex')};
 const rotated=createHandler(next,directory);
 assert.equal((await rotated(request('/OSM',{headers:{cookie:admin}}))).headers.get('location'),'/OSM/login');
 assert.equal((await rotated(request('/sumo',{headers:{cookie:visitor}}))).status,200);
 const response=await rotated(request('/OSM/login',{method:'POST',headers:{origin},body:new URLSearchParams({password:'new-owner-password'})}));
 assert.equal(response.headers.get('location'),'/OSM');
 assert.equal((await rotated(request('/OSM',{headers:{cookie:session(response)}}))).status,200);
});

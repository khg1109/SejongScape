// Run as root on the deployed server; never prints passwords or session cookies.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const base = 'https://54.180.18.109';
const secretFile=readFileSync('/etc/sejongscape/2026-10-12-sejongscape-passwords.txt','utf8');
const visitor=secretFile.match(/^Visitor password: (.+)$/m)[1];
const admin=secretFile.match(/^Admin password: (.+)$/m)[1];
const request=(path,options={})=>fetch(base+path,{redirect:'manual',...options});
const login=async(path,password)=>{
  const r=await request(path,{method:'POST',headers:{origin:base},body:new URLSearchParams({password})});
  assert.equal(r.status,303);
  const cookies=r.headers.getSetCookie();
  assert.equal(cookies.length,1);
  assert.match(cookies[0],/HttpOnly; Secure; SameSite=Lax/);
  return cookies[0].split(';')[0];
};
assert.equal((await request('/')).status,303);
assert.equal((await request('/api/traffic')).status,401);
const cookie=await login('/access/login',visitor);
for(const path of ['/','/sumo','/traffic','/real']) {
  const r=await request(path,{headers:{cookie}});
  assert.equal(r.status,200,path);
  assert.match(await r.text(),/<html/i);
  console.log('PASS page',path);
}
const html=await (await request('/',{headers:{cookie}})).text();
const bundle=html.match(/src="([^"]+\.js)"/)[1];
assert.equal((await request(bundle,{headers:{cookie}})).status,200);
assert.equal((await request(bundle)).status,303);
assert.equal((await request('/admin',{headers:{cookie,'oai-authenticated-user-email':'owner@example.com'}})).status,303);
const adminCookie=await login('/admin/login',admin);
assert.equal((await request('/admin',{headers:{cookie:adminCookie}})).status,200);
assert.equal((await request('/api/admin/visits',{headers:{cookie:adminCookie}})).status,200);
const traffic=await (await request('/api/traffic',{headers:{cookie}})).json();
assert.ok(traffic.items.length>0);
console.log('PASS traffic API; mode:',traffic.mode);
console.log('PASS HTTPS, password login, protected assets, separate administrator login');

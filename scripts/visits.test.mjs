import {createHmac} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import worker from '../server/index.js';
function setup(){const db=new DatabaseSync(':memory:');for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync('drizzle/'+file,'utf8'));const env={SITE_PASSWORD_HASH:'testhash',SITE_PASSWORD_SALT:'salt',SITE_SESSION_KEY:'session',SITE_OWNER_EMAIL:'owner@example.com',ASSETS:{fetch:async()=>new Response('map',{headers:{'Content-Type':'text/html'}})},DB:{prepare(sql){return{bind(...args){return{first:async()=>db.prepare(sql).get(...args),run:async()=>db.prepare(sql).run(...args),all:async()=>({results:db.prepare(sql).all(...args)})}}}},batch:async statements=>Promise.all(statements.map(s=>s.all()))}};return{env,db};}
const payload=String(Date.now()+3600000)+'.test';const cookie='__Host-sejong-access='+payload+'.'+createHmac('sha256','sessiontesthash').update(payload).digest('hex');
const visit=(path='/',email='visitor@example.com',origin='https://site.test')=>new Request('https://site.test/api/visits',{method:'POST',headers:{'cookie':cookie,'origin':origin,'Content-Type':'application/json',...(email?{'oai-authenticated-user-id':'visitor-id','oai-authenticated-user-email':email}:{})},body:JSON.stringify({path,email:'forged@example.com',visited_at:1})});
const req=(path,email='owner@example.com',id='owner-site-id')=>new Request('https://site.test'+path,{headers:email?{'cookie':cookie,'oai-authenticated-user-id':id,'oai-authenticated-user-email':email}: {}});
test('admin page starts ChatGPT sign-in and remains owner-only',async()=>{const{env}=setup();for(const path of ['/admin','/admin/']){const response=await worker.fetch(req(path,null),env);assert.equal(response.status,303);assert.equal(response.headers.get('location'),'/signin-with-chatgpt?return_to=%2Fadmin');assert.equal((await worker.fetch(req(path,'visitor@example.com','visitor-id'),env)).status,403);}assert.equal((await worker.fetch(req('/api/admin/visits',null),env)).status,401);assert.equal((await worker.fetch(req('/api/admin/visits','visitor@example.com','visitor-id'),env)).status,403);env.SITE_OWNER_EMAIL='';assert.equal((await worker.fetch(req('/admin'),env)).status,403);});
test('visits persist, deduplicate and only owner can list; assets and admin reads do not add visits',async()=>{const{env,db}=setup();await worker.fetch(visit('/'),env);await worker.fetch(visit('/'),env);await worker.fetch(visit('/real'),env);await worker.fetch(req('/data/sejong.json'),env);const r=await worker.fetch(req('/api/admin/visits'),env);assert.equal(r.status,200);const body=await r.json();assert.equal(body.stats.visits,2);assert.equal(body.stats.visitors,1);assert.equal(body.rows[0].email,'visitor@example.com');assert.match(r.headers.get('cache-control'),/no-store/);assert.equal(db.prepare('select count(*) as n from visits').get().n,2);});
test('query failures show unavailable rather than empty history',async()=>{const{env}=setup();env.DB.batch=async()=>{throw Error('offline')};assert.equal((await worker.fetch(req('/api/admin/visits'),env)).status,503);});


test('visit endpoint rejects anonymous, cross-origin and invalid paths; ignores client identity',async()=>{const{env,db}=setup();assert.equal((await (await worker.fetch(visit('/',null),env)).json()).recorded,true);assert.equal((await worker.fetch(visit('/','visitor@example.com','https://evil.test'),env)).status,403);assert.equal((await worker.fetch(visit('/admin'),env)).status,400);assert.equal((await worker.fetch(req('/api/visits'),env)).status,405);db.exec('DELETE FROM visits');assert.equal((await worker.fetch(visit('/'),env)).status,200);const row=db.prepare('select * from visits').get();assert.equal(row.email,'visitor@example.com');assert.ok(row.visited_at>1);});
test('write failure returns a retryable error',async()=>{const{env}=setup();env.DB.prepare=()=>{throw Error('offline')};assert.equal((await worker.fetch(visit('/'),env)).status,503);});

test('password-only visitor IP and server timestamp persist; client claims ignored; owner only',async()=>{
 const {env,db}=setup();const r=visit('/',null);r.headers.set('cf-connecting-ip','203.0.113.8');
 assert.equal((await worker.fetch(r,env)).status,200);
 const again=visit('/',null);again.headers.set('cf-connecting-ip','203.0.113.8');await worker.fetch(again,env);
 const row=db.prepare('select * from visits').get();assert.equal(row.ip,'203.0.113.8');assert.equal(row.email,'');assert.match(row.user_id,/^anonymous:/);assert.ok(row.visited_at>1);assert.equal(db.prepare('select count(*) as n from visits').get().n,1);
 const body=await (await worker.fetch(req('/api/admin/visits'),env)).json();assert.equal(body.stats.visits,1);assert.equal(body.stats.visitors,0);assert.equal(body.stats.ips,1);assert.equal(body.rows[0].ip,'203.0.113.8');
 assert.equal((await worker.fetch(new Request('https://site.test/api/admin/visits',{headers:{cookie}}),env)).status,401);
});

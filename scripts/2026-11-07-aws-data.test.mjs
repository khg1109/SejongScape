import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {gzipSync} from 'node:zlib';
import {AWS_ORIGIN,allowedAwsPath,loginAws,createAwsMiddleware} from '../server/2026-11-07-aws-data.mjs';
const path='/data/2026-10-16-trips/2026-10-16-manifest.json';
async function serve(t,options) {
  const middleware=createAwsMiddleware({root:process.cwd(),awsMode:true,session:'__Host-sejong-access=test-session',...options});
  const server=http.createServer((req,res)=>middleware(req,res,()=>{res.writeHead(418);res.end('local');}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  return 'http://127.0.0.1:'+server.address().port;
}
test('AWS forwarding is limited to documented data paths and the traffic read API',()=>{
  assert.ok(allowedAwsPath(path));assert.ok(allowedAwsPath('/api/traffic'));
  for(const value of ['/OSM','/access/login','//evil.test/data/a.json','https://evil.test/a.json','/data/2026-10-16-trips/../secrets.json','/data/2026-10-16-trips/%2e%2e/secret.json',path+'?token=secret','/data/private.json'])assert.equal(allowedAwsPath(value),false,value);
});
test('AWS login only accepts the expected successful redirect and signed-session cookie',async()=>{
  const cookie=await loginAws('test-only-password',async(url,options)=>{
    assert.equal(url,AWS_ORIGIN+'/access/login');assert.equal(options.redirect,'manual');
    assert.equal(options.headers.Origin,AWS_ORIGIN);assert.equal(options.body.get('password'),'test-only-password');
    return new Response(null,{status:303,headers:{Location:'/sumo','Set-Cookie':'__Host-sejong-access=test; Secure; HttpOnly'}});
  });assert.equal(cookie,'__Host-sejong-access=test');
  for(const headers of [{Location:'/access/login?error=wrong'},{Location:'https://evil.test/','Set-Cookie':'__Host-sejong-access=test'}])await assert.rejects(loginAws('test',async()=>new Response(null,{status:303,headers})));
});
test('proxy preserves AWS binary data, forwards session server-side, and strips upstream cookies',async t=>{
  const payload=gzipSync(Buffer.from('실제 자료 형식 보존'));
  const base=await serve(t,{fetcher:async(url,options)=>{
    assert.equal(url,AWS_ORIGIN+'/data/2026-10-16-dispersal/2026-10-16-trees.bin.gz');
    assert.equal(options.headers.Cookie,'__Host-sejong-access=test-session');assert.equal(options.redirect,'manual');
    return new Response(payload,{headers:{'Content-Type':'application/gzip','Set-Cookie':'private=value'}});
  }});
  const r=await fetch(base+'/data/2026-10-16-dispersal/2026-10-16-trees.bin.gz');
  assert.equal(r.status,200);assert.equal(r.headers.get('set-cookie'),null);assert.equal(r.headers.get('content-encoding'),null);
  assert.deepEqual(Buffer.from(await r.arrayBuffer()),payload);
});
test('cross-site and non-read requests cannot use the authenticated AWS session',async t=>{
  let calls=0;const base=await serve(t,{fetcher:async()=>{calls++;return Response.json({});}});
  for(const options of [{headers:{Origin:'https://evil.test'}},{headers:{'Sec-Fetch-Site':'cross-site'}},{method:'POST'}]){
    const r=await fetch(base+path,options);assert.ok([403,405].includes(r.status));
  }
  assert.equal(calls,0);
});
test('expired sessions and network errors become safe JSON errors rather than login HTML or leaked secrets',async t=>{
  const base=await serve(t,{fetcher:async()=>new Response(null,{status:303,headers:{Location:'/access/login'}})});
  const r=await fetch(base+path);assert.equal(r.status,401);assert.match(r.headers.get('content-type'),/json/);
  const failed=await serve(t,{fetcher:async()=>{throw Error('test-session https://private.test/key');}});
  const err=await fetch(failed+path);assert.equal(err.status,502);const body=await err.text();assert.ok(!body.includes('test-session'));assert.ok(!body.includes('private.test'));
});
test('missing private data in local mode returns 404 with setup guidance, while tracked data stays local',async t=>{
  const base=await serve(t,{awsMode:false,fetcher:async()=>{throw Error('must not call upstream');}});
  const missing=await fetch(base+path);assert.equal(missing.status,404);assert.match(await missing.text(),/npm run dev:aws/);
  const existing=await fetch(base+'/data/sejong.json');assert.equal(existing.status,418);
});

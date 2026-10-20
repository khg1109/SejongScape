// Execute on AWS as root. Secrets/cookies are never printed.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const base='https://sejongscape.com';
const request=(path,options={})=>fetch(base+path,{redirect:'manual',...options});
const secret=fs.readFileSync('/etc/sejongscape/2026-10-12-sejongscape-passwords.txt','utf8').match(/^Visitor password: (.+)$/m)[1];
assert.equal((await request('/sumo')).status,303);
const login=await request('/access/login',{method:'POST',headers:{origin:base},body:new URLSearchParams({password:secret})});assert.equal(login.status,303);const cookie=login.headers.getSetCookie()[0].split(';')[0];
const html=await (await request('/sumo',{headers:{cookie}})).text();
const bundle=html.match(/src="([^" ]+\/sumo-[^" ]+\.js)"/)[1];
const js=await (await request(bundle,{headers:{cookie}})).text();assert.ok(js.includes('CSV 통행 흐름'));assert.ok(js.includes('2026-10-16-trip-city.json'));
for(const path of ['/data/2026-10-16-trips/2026-10-16-manifest.json','/data/2026-10-16-trips/2026-10-16-hour-07.bin','/data/2026-10-16-trip-city.json',bundle]){
 assert.equal((await request(path)).status,303,'protected '+path);assert.equal((await request(path,{headers:{cookie}})).status,200,'read '+path);
}
const m=await (await request('/data/2026-10-16-trips/2026-10-16-manifest.json',{headers:{cookie}})).json();assert.equal(m.total,1111343);assert.deepEqual(m.modes,[1,2,3,4,97]);
for(const path of ['/','/traffic','/real'])assert.equal((await request(path,{headers:{cookie}})).status,200,path);
assert.equal((await request('/admin',{headers:{cookie}})).status,303);
console.log('PASS live HTTPS /sumo CSV 3D; 1,111,343 trips; protected data/assets; other pages and separate admin gate retained');

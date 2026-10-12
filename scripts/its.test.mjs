import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {normalize,trafficResponse,observationTime} from '../server/traffic.js';
import {trafficState,joinTraffic} from '../src/traffic-model.js';
const now=Date.parse('2026-09-16T07:20:00Z');
const sample={header:{resultCode:0},body:{totalCount:1,items:[{linkId:'4130006900',speed:'0',travelTime:'123',createdDate:'20260916161500'}]}};
function setup(){
 const db=new DatabaseSync(':memory:');
 for(const file of fs.readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())db.exec(fs.readFileSync('drizzle/'+file,'utf8'));
 const DB={prepare(sql){return {bind(...args){return {first:async()=>db.prepare(sql).get(...args),run:async()=>db.prepare(sql).run(...args)};}};}};
 return {db,env:{ITS_API_KEY:'private-test-key',DB}};
}
test('zero speed is real; missing values, stale and future timestamps never look current',()=>{
 const row=normalize(sample)[0];assert.equal(row.speed,0);assert.equal(row.observedAt,Date.parse('2026-09-16T07:15:00Z'));assert.equal(trafficState(row,now),'slow');assert.equal(trafficState(row,now+3600000),'stale');assert.equal(trafficState({...row,observedAt:now+600000},now),'stale');assert.equal(trafficState({...row,speed:null},now),'missing');assert.equal(observationTime('bad'),null);assert.throws(()=>normalize({header:{resultCode:1}}));const copy=structuredClone(sample);copy.body.items[0].speed='';assert.equal(normalize(copy)[0].speed,null);
});
test('shared refresh lease prevents concurrent visitors consuming upstream quota',async()=>{
 const{env}=setup();let calls=0;const fetcher=async()=>{calls++;await new Promise(r=>setTimeout(r,5));return Response.json(sample);};
 await Promise.all(Array.from({length:8},()=>trafficResponse(env,{now,fetcher})));assert.equal(calls,1);
 const body=await(await trafficResponse(env,{now:now+1000,fetcher})).json();assert.equal(body.mode,'api');assert.equal(body.items[0].speed,0);assert.equal(calls,1);assert.ok(!JSON.stringify(body).includes('private-test-key'));
});
test('failed upstream preserves timestamp and data, backs off for an hour',async()=>{
 const{env}=setup();await trafficResponse(env,{now,fetcher:async()=>Response.json(sample)});let calls=0;const fetcher=async()=>{calls++;throw Error('private-test-key');};
 const body=await(await trafficResponse(env,{now:now+300001,fetcher})).json();assert.equal(body.status,'unavailable');assert.equal(body.items[0].observedAt,Date.parse('2026-09-16T07:15:00Z'));await trafficResponse(env,{now:now+600000,fetcher});assert.equal(calls,1);assert.ok(!JSON.stringify(body).includes('private-test-key'));
});
test('missing key serves explicitly saved observations without upstream calls',async()=>{const{env}=setup();delete env.ITS_API_KEY;const body=await(await trafficResponse(env,{now,fetcher:()=>{throw Error('must not call')}})).json();assert.equal(body.mode,'saved');assert.equal(body.fetchedAt,null);});
test('geometry joins by exact link ID, never road name; unmatched links excluded',()=>{const geometry=JSON.parse(fs.readFileSync('public/data/its-links.json'));assert.equal(geometry.links.length,450);assert.equal(new Set(geometry.links.map(x=>x.id)).size,450);assert.equal(geometry.missing.length,14);assert.ok(geometry.links.every(x=>x.shape.length>=2&&x.shape.every(([lon,lat])=>lon>127&&lon<128&&lat>36&&lat<37)));const rows=joinTraffic({links:[{id:'a',name:'same'},{id:'b',name:'same'}]},[{id:'a',speed:20}]);assert.equal(rows[0].observation.speed,20);assert.equal(rows[1].observation,null);});

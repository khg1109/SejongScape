import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {decodeTrips,filterTrips,routeState,activeTrips,displaySample,prepareRoute,positionOnRoute,replayBounds} from '../src/2026-10-16-trip-model.js';
const read=url=>fs.readFileSync(new URL('../public'+url,import.meta.url));
const manifest=JSON.parse(read('/data/2026-10-16-trips/2026-10-16-manifest.json'));
const geo=JSON.parse(read(manifest.routesUrl));
const counts={hour:0,people:0},modes={},hashes={hour:0n,people:0n};let same=0,external=0,zero=0,example;
for(const [key,file] of Object.entries(manifest.files)){
 const buffer=read(file.url),rows=decodeTrips(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength));assert.equal(rows.length,file.records);
 const kind=key.startsWith('hour-')?'hour':'people';counts[kind]+=rows.length;
 for(const r of rows){
  const fingerprint=crypto.createHash('sha256').update(JSON.stringify(r)).digest();hashes[kind]+=fingerprint.readBigUInt64LE();
  if(kind==='hour'){assert.equal(Math.floor(r.start/60),Number(key.slice(5)));modes[r.mode]=(modes[r.mode]||0)+1;same+=r.origin===r.destination;external+=routeState(r,geo.anchors)==='external';zero+=r.start===r.end;if(r.id===1)example=r;}
  else assert.equal(Math.floor(r.id/10000),Number(key.slice(7)));
 }
 if(kind==='hour')assert.ok(Number.isFinite(replayBounds(rows,Number(key.slice(5)),null).end));
}
assert.equal(counts.hour,manifest.total);assert.equal(counts.people,manifest.total);assert.equal(hashes.hour,hashes.people);assert.deepEqual(modes,manifest.modeCounts);assert.equal(same,manifest.sameRegion);assert.equal(external,manifest.external);assert.equal(zero,manifest.zeroDuration);
assert.equal(Object.keys(geo.routes).length,22*21);
for(const [key,path] of Object.entries(geo.routes)){
 const [a,b]=key.split(':').map(Number);assert.deepEqual(path.points[0],geo.anchors[a].point);assert.deepEqual(path.points.at(-1),geo.anchors[b].point);assert.ok(path.meters>0);
 const p=prepareRoute(path);assert.deepEqual(positionOnRoute(p,0),p.points[0]);assert.deepEqual(positionOnRoute(p,1),p.points.at(-1));assert.ok(positionOnRoute(p,.5).every(Number.isFinite));
}
assert.equal(activeTrips([{start:10,end:20},{start:20,end:20}],20).length,0);
assert.equal(activeTrips([{start:10,end:20}],10).length,1);
assert.equal(filterTrips([example],{person:example.id,modes:[example.mode],origin:String(example.origin),destination:'',purpose:''}).length,1);
assert.equal(filterTrips([example],{person:null,modes:[],origin:'',destination:'',purpose:''}).length,0);
const sample=Array.from({length:1000},(_,id)=>({id,seq:1}));assert.equal(displaySample(sample).length,800);assert.deepEqual(displaySample(sample),displaySample([...sample].reverse()));
assert.throws(()=>decodeTrips(new ArrayBuffer(21)));
console.log(JSON.stringify({result:'PASS',records:counts,modeCounts:modes,routes:Object.keys(geo.routes).length,sameRegion:same,external,zeroDuration:zero},null,2));

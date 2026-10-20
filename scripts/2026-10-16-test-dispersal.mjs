import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {TripDay} from '../src/2026-10-16-trip-day-model.js';
import {TripDispersal} from '../src/2026-10-16-trip-dispersal.js';
import {contains} from '../src/map.js';
import {routePose} from '../src/2026-10-16-twin-geometry.js';
const root=new URL('../public/',import.meta.url),load=u=>fs.readFileSync(new URL(u.replace(/^\//,''),root));
const n=JSON.parse(load('/data/2026-10-16-dispersal/2026-10-16-network.json'));
const b=zlib.gunzipSync(load(n.treeUrl)),buffer=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
assert.equal(crypto.createHash('sha256').update(b).digest('hex'),n.treeSha256);
const parents=new Uint32Array(buffer),router=new TripDispersal(n,parents);
const inRegion=(p,r)=>n.boundaries[r].outer.some(ring=>contains(p,ring))&&!n.boundaries[r].inner.some(ring=>contains(p,ring));
for(const [r,pool] of n.pools.entries()){
 if(r===22){assert.equal(pool.length,0);continue;}
 assert.equal(pool.length,24);assert.equal(new Set(pool.map(i=>n.endpoints[i].point)).size,24);
 for(const i of pool)assert.ok(inRegion(n.points[n.endpoints[i].point],r),`endpoint ${i} inside ${n.regions[r]}`);
}
// Every directed predecessor chain is connected, acyclic and reaches its origin.
for(let source=0;source<n.endpoints.length;source++)for(let dest=0;dest<n.endpoints.length;dest++){
 if(source===dest)continue;
 const s=n.endpoints[source],d=n.endpoints[dest];let vertex=d.vertex,steps=0;
 if(s.region===d.region){
  const ids=n.localRoutes[`${source}:${dest}`];assert.ok(ids?.length);vertex=s.vertex;
  for(const id of ids){const [a,end,,points]=n.edges[id];assert.equal(a,vertex);vertex=end;
   for(const p of points)assert.ok(inRegion(n.points[p],s.region),'local route stays inside its region');
  }
  assert.equal(vertex,d.vertex);
 }else while(vertex!==s.vertex){
  const id=parents[source*n.vertices.length+vertex]-1;assert.ok(id>=0);const [a,end]=n.edges[id];assert.equal(end,vertex);vertex=a;assert.ok(++steps<n.vertices.length);
 }
}
const m=JSON.parse(load('/data/2026-10-16-trips/2026-10-16-manifest.json')),day=new TripDay(m);
for(const [k,f] of Object.entries(m.files))if(k.startsWith('hour-')){const b=load(f.url);day.add(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),f.records);}
router.assign(day);
let same=0,allSame=0,internal=0,external=0,continuity=0,example;const previous=new Map(),seen=new Set();
for(let seq=1;seq<router.stride;seq++)for(const {view:v} of day.chunks)for(let p=0;p<v.byteLength;p+=20){
 if(v.getUint8(p+4)!==seq)continue;
 const row={id:v.getUint32(p,true),seq,origin:v.getUint8(p+10),destination:v.getUint8(p+11),start:v.getUint16(p+12,true),end:v.getUint16(p+14,true)};
 if(row.origin===row.destination)allSame++;
 const pair=router.pair(row),key=row.id*router.stride+seq;assert.ok(!seen.has(key),'unique person / sequence');seen.add(key);
 if(row.origin===22||row.destination===22){assert.equal(pair,null);external++;}
 else {assert.ok(pair);internal++;assert.equal(n.endpoints[pair[0]].region,row.origin);assert.equal(n.endpoints[pair[1]].region,row.destination);assert.notEqual(pair[0],pair[1]);
  if(row.origin===row.destination){same++;if(!example&&row.start<row.end&&row.origin===0)example=row;}
 }
 const prev=previous.get(row.id);
 if(prev&&prev.destination===row.origin&&row.origin!==22){assert.equal(router.origins[key],prev.endpoint);continuity++;}
 previous.set(row.id,{destination:row.destination,endpoint:router.destinations[key]});
}
assert.equal(internal+external,m.total);assert.equal(allSame,m.sameRegion);assert.equal(external,m.external);
const rows=day.active(448,{modes:m.modes});router.beginFrame();let drawn=0,local=0;const start=performance.now();
for(const row of rows){const path=router.route(row);if(!path)continue;drawn++;if(path.local)local++;assert.ok(path.meters>0);
 const origin=routePose(path,0),dest=routePose(path,1);assert.ok(Math.hypot(origin.x-path.points[0][0],origin.z-path.points[0][1])<.001);assert.ok(Math.hypot(dest.x-path.points.at(-1)[0],dest.z-path.points.at(-1)[1])<.001);
}
router.endFrame();const routingMs=Math.round(performance.now()-start),before=router.pair(example);
const reversed=new TripDispersal(n,parents);reversed.assign({...day,chunks:[...day.chunks].reverse()});assert.deepEqual(reversed.pair(example),before);
const path=router.route(example);
const result={result:'PASS',total:m.total,internal,external,sameRegion:same,continuousLocations:continuity,regions:22,endpoints:n.endpoints.length,localRoutes:Object.keys(n.localRoutes).length,activeAt0728:rows.length,drawnAt0728:drawn,localAt0728:local,routingMs,example:{...example,from:path.from,to:path.to,meters:Math.round(path.meters)}};
console.log(JSON.stringify(result,null,2));

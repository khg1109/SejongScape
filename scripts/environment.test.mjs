import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { footprintFrame, libraryProfile } from '../src/architecture.js';
import { segmentDistance } from '../src/environment.js';
import { buildNetwork } from '../src/mobility-model.js';
const data=JSON.parse(fs.readFileSync(new URL('../public/data/sejong.json',import.meta.url)));
test('Landmark footprint frame preserves rotated footprint dimensions',()=>{
  const a=.4,c=Math.cos(a),s=Math.sin(a),points=[[-40,-20],[40,-20],[40,20],[-40,20],[-40,-20]].map(([x,z])=>[x*c-z*s+100,x*s+z*c-300]);
  const f=footprintFrame(points);assert.ok(Math.abs(f.width-80)<1e-8);assert.ok(Math.abs(f.depth-40)<1e-8);assert.ok(Math.abs(f.x-100)<1e-8);assert.ok(Math.abs(f.z+300)<1e-8);
});
test('Library canopy rises at both ends and keeps positive glass height',()=>{
  assert.ok(libraryProfile(0).top>libraryProfile(.5).top);assert.ok(libraryProfile(1).top>libraryProfile(.5).top);
  for(let i=0;i<=100;i++){const p=libraryProfile(i/100);assert.ok(p.top-p.bottom>5);}
});
test('Distance check clamps to endpoints instead of infinite road extensions',()=>{
  assert.equal(segmentDistance([20,0],[0,0],[10,0]).distance,10);assert.equal(segmentDistance([5,3],[0,0],[10,0]).distance,3);
});
test('Bus stops are attached to forward path distances and retain actual OSM ids',()=>{
  const net=buildNetwork(data,'bus'),ids=new Set(data.elements.filter(e=>e.type==='node'&&e.tags?.highway==='bus_stop').map(e=>e.id));
  const stops=net.edges.flatMap(e=>(e.stops||[]).map(s=>({s,e})));assert.ok(stops.length>0);
  for(const {s,e} of stops){assert.ok(ids.has(s.id));assert.ok(s.distance>=0&&s.distance<=e.length);}
});

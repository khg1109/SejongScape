import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { buildNetwork, permitted, sampleEdge, activityAt, activitySources, PERIODS, chooseNext, randomSource, signalAllows } from '../src/mobility-model.js';
import { createMobility } from '../src/mobility.js';

const data=JSON.parse(fs.readFileSync(new URL('../public/data/sejong.json',import.meta.url)));
test('Transport types use eligible roads only',()=>{
  assert.equal(permitted({highway:'footway'},'car'),false);
  assert.equal(permitted({highway:'busway'},'car'),false);
  assert.equal(permitted({highway:'busway'},'bus'),true);
  assert.equal(permitted({highway:'primary'},'person'),false);
  assert.equal(permitted({highway:'steps',bicycle:'yes'},'bike'),false);
  assert.equal(permitted({highway:'footway',access:'private'},'person'),false);
  assert.equal(permitted({highway:'footway',indoor:'yes'},'person'),false);
});
test('One-way geometry never emits a reverse motor edge',()=>{
  const fixture={center:[36,127],elements:[{nodes:[1,2],geometry:[{lat:36,lon:127},{lat:36,lon:127.001}],tags:{highway:'primary',oneway:'-1'}}]};
  const net=buildNetwork(fixture,'car');assert.equal(net.edges.length,1);assert.equal(net.edges[0].from.key,'2');
});
test('Routes remain connected through real graph nodes',()=>{
  const net=buildNetwork(data,'car'),rng=randomSource();let e=net.edges[20];
  for(let i=0;i<2000;i++){let next=chooseNext(e,rng);if(!next)break;assert.equal(e.to,next.from);e=next;}
  assert.ok(net.edges.length>100);
});
test('Right-hand lane offsets and sampling stay finite',()=>{
  const e={from:{point:[0,0]},dx:1,dz:0,length:100,y:.2};
  assert.deepEqual(sampleEdge(e,20,2),{x:20,z:2,y:.2,yaw:Math.PI/2});
});
test('Activity follows nearby facilities and time of day',()=>{
  const sources=[{kind:'office',x:0,z:0}];
  assert.ok(activityAt(0,0,sources,PERIODS.morning)>activityAt(0,0,sources,PERIODS.night));
  assert.ok(activityAt(0,0,sources,PERIODS.day)>activityAt(2000,2000,sources,PERIODS.day));
  assert.ok(activitySources(data).length>10);
});
test('Synthetic junction signals have alternating green and all-red intervals',()=>{
  const to={point:[0,0],neighbors:new Set([1,2,3]),signal:true};
  const east={dx:1,dz:0,to},north={dx:0,dz:1,to};
  assert.equal(signalAllows(east,10),true);assert.equal(signalAllows(north,10),false);
  assert.equal(signalAllows(east,20),false);assert.equal(signalAllows(north,20),false);
  assert.equal(signalAllows(north,30),true);
});
test('Scene moves, pauses exactly, and rebuilds population without leaking meshes',()=>{
  globalThis.matchMedia=()=>({matches:false});
  const scene=new THREE.Scene(),sim=createMobility(scene,data),group=scene.children[0],mesh=group.children[0];
  const meshCount=group.children.length, before=Array.from(mesh.instanceMatrix.array.slice(0,16));
  for(let i=0;i<100;i++)sim.update(.05);
  assert.notDeepEqual(Array.from(mesh.instanceMatrix.array.slice(0,16)),before);
  sim.setPaused(true);const paused=Array.from(mesh.instanceMatrix.array);sim.update(1);
  assert.deepEqual(Array.from(mesh.instanceMatrix.array),paused);
  const rush=sim.totals.person;sim.populate('night');assert.ok(sim.totals.person<rush);
  assert.equal(group.children.length,meshCount);
  for(const m of group.children)assert.ok(Array.from(m.instanceMatrix.array).every(Number.isFinite));
});

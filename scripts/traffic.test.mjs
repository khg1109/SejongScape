import test from 'node:test';
import assert from 'node:assert/strict';
import {signalState,walkAllows,buildNetwork} from '../src/mobility-model.js';
import {connectTraffic,createTraffic,mappedSignalRecords} from '../src/traffic.js';
import {project} from '../src/map.js';
import * as THREE from 'three';
import {readFile} from 'node:fs/promises';
test('Pedestrian entry and conflicting vehicle greens never overlap over multiple cycles',()=>{
 const node={point:[100,250],neighbors:new Set([1,2,3]),signal:true};
 for(let t=0;t<180;t+=.1){const a=signalState({to:node,dx:1,dz:0},t),b=signalState({to:node,dx:0,dz:1},t);assert.ok(!(a==='green'&&b==='green'));if(walkAllows(node,t)){assert.equal(a,'red');assert.equal(b,'red');}}
 node.pedestrianOccupied=true;assert.equal(signalState({to:node,dx:1,dz:0},0),'red');
 const uncontrolled={point:[0,0],neighbors:new Set([1,2,3])};assert.equal(signalState({to:uncontrolled,dx:1,dz:0},60),'green');
});
test('Actual map produces recorded signal markers with shared bus controllers and clean disposal',async()=>{
 const data=JSON.parse(await readFile('public/data/sejong.json','utf8')),networks=Object.fromEntries(['car','bus','person','bike'].map(k=>[k,buildNetwork(data,k)]));
 const scene=new THREE.Scene(),traffic=createTraffic(scene,data,networks);assert.ok(traffic.count>0);assert.ok(traffic.crossings>0);
 for(const e of networks.bus.edges.filter(e=>e.controller))assert.equal(e.controller,networks.car.nodes.get(e.controller.key));
 traffic.update(45);scene.traverse(m=>{if(m.geometry?.attributes.position)assert.ok([...m.geometry.attributes.position.array].every(Number.isFinite));});traffic.dispose();assert.equal(scene.children.length,0);
});
test('Unmapped junctions cannot generate signal objects or controllers',()=>{
 const data={center:[36,127],elements:[]},node={key:'123',point:[0,0],neighbors:new Set([1,2,3]),out:[{tags:{highway:'primary'}}]};
 const networks={car:{nodes:new Map([['123',node]]),edges:[]},bus:{edges:[]},person:{edges:[]},bike:{edges:[]}};
 assert.equal(connectTraffic(data,networks).junctions.length,0);
 const traffic=createTraffic(new THREE.Scene(),data,networks);assert.equal(traffic.count,0);traffic.dispose();
});
test('Each rendered signal anchor exactly matches a recorded coordinate, once per source ID',async()=>{
 const raw=JSON.parse(await readFile('public/data/traffic.json','utf8')),data={center:[36.501,127.269],elements:raw.elements};
 const networks={car:{nodes:new Map(),edges:[]},bus:{edges:[]},person:{edges:[]},bike:{edges:[]}};
 const traffic=createTraffic(new THREE.Scene(),data,networks),records=mappedSignalRecords(data);
 assert.equal(traffic.count,68);assert.equal(traffic.anchors.length,records.length);
 for(const a of traffic.anchors){const record=records.find(r=>r.id===a.id);assert.deepEqual([a.x,a.z],project(record,data.center));}
 traffic.dispose();
});

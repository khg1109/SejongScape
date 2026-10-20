import assert from 'node:assert/strict';
import {roadProfile,ribbon,routePose} from '../src/2026-10-16-twin-geometry.js';
import {prepareRoute} from '../src/2026-10-16-trip-model.js';

const route=prepareRoute({points:[[0,0],[100,0],[100,100]]});
assert.equal(routePose(route,.25).x,50);
assert.equal(routePose(route,.25).z,0);
assert.equal(routePose(route,0).x,0);
assert.equal(routePose(route,1).z,100);
assert.equal(routePose(route,2).z,100);
const east=routePose(route,.25,1.5);
assert.equal(east.z,1.5,'eastbound right lane is south in map coordinates');
const west=routePose(prepareRoute({points:[[100,0],[0,0]]}),.5,1.5);
assert.equal(west.z,-1.5,'opposite direction must use opposite side');
assert.equal(east.yaw,Math.PI/2);
assert.equal(roadProfile({highway:'primary',lanes:'4'}).lanes,4);
assert.equal(roadProfile({highway:'primary',width:'18'}).width,18);
assert.equal(roadProfile({highway:'footway'}).pedestrian,true);
assert.equal(roadProfile({oneway:'-1'}).oneway,true);
assert.equal(roadProfile({bridge:'yes'}).y,1.24);
assert.ok(ribbon([[0,0],[0,0],[100,0]],8).every(Number.isFinite));
const road=ribbon([[0,0],[100,0]],8);
assert.equal(Math.min(...road.filter((_,i)=>i%3===2)),-4);
assert.equal(Math.max(...road.filter((_,i)=>i%3===2)),4);
// Top-facing winding prevents roads disappearing when viewed from above.
const a=road.slice(0,3),b=road.slice(3,6),c=road.slice(6,9);
assert.ok((b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2])>0);
console.log('PASS twin geometry: source route progress, endpoints, opposing lanes, road widths, bridges and top-facing surfaces');

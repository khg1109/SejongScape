import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {project} from './map.js';
import {signalState,walkAllows,sampleEdge} from './mobility-model.js';

export function mappedSignalRecords(data){return [...new Map(data.elements.filter(e=>e.type==='node'&&e.tags?.highway==='traffic_signals'&&Number.isFinite(e.lat)&&Number.isFinite(e.lon)).map(e=>[String(e.id),e])).values()];}

export function connectTraffic(data,networks){
  const mapped=new Set(data.elements.filter(e=>e.tags?.highway==='traffic_signals').map(e=>String(e.id)));
  // Car and bus graphs have distinct nodes; use the car junction as the shared controller.
  const junctions=[...networks.car.nodes.values()].filter(n=>mapped.has(n.key));
  const byKey=new Map(junctions.map(n=>[n.key,n]));
  for(const n of junctions)n.signal=true;
  for(const kind of ['car','bus'])for(const e of networks[kind].edges){
    const shared=byKey.get(e.to.key);if(shared)e.controller=shared;
    e.stopDistance=Math.max(.1,e.length-Math.min(e.length*.4,e.width/2+3));
  }
  let crossings=0;
  for(const kind of ['person','bike'])for(const e of networks[kind].edges){
    if(e.tags.footway!=='crossing'&&e.tags.cycleway!=='crossing'&&e.tags.highway!=='crossing')continue;
    const p=sampleEdge(e,e.length/2);let best=60;
    for(const node of junctions){const d=Math.hypot(node.point[0]-p.x,node.point[1]-p.z);if(d<best){e.crossingController=node;best=d;}}
    if(e.crossingController)crossings++;
  }
  return {junctions,crossings};
}

export function createTraffic(scene,data,networks){
  const {junctions}=connectTraffic(data,networks),root=new THREE.Group();root.name='Traffic signals and crossings';scene.add(root);
  const dark=new THREE.MeshStandardMaterial({color:0x283335}),metal=new THREE.MeshStandardMaterial({color:0x727b79}),white=new THREE.MeshStandardMaterial({color:0xe6e5d8,roughness:.95});
  const buckets=new Map(),lights=[];const unit=new THREE.BoxGeometry(1,1,1),o=new THREE.Object3D();
  function box(x,y,z,w,h,d,mat,yaw=0){const g=unit.clone();g.scale(w,h,d);g.rotateY(yaw);g.translate(x,y,z);if(!buckets.has(mat))buckets.set(mat,[]);buckets.get(mat).push(g);}
  const seen=new Set(),anchors=[];
  for(const record of mappedSignalRecords(data)){
    const [x,z]=project(record,data.center);seen.add(String(record.id));anchors.push({id:record.id,x,z,lat:record.lat,lon:record.lon});
    const edge=networks.car.edges.find(e=>e.to.key===String(record.id));
    const yaw=edge?Math.atan2(edge.dx,edge.dz):0;
    // A map node is not a surveyed pole: draw a floating location symbol, with no invented pole or arm.
    box(x,4,z,1.4,.5,.3,dark,yaw);
    for(let k=0;k<3;k++)lights.push({x:x+Math.cos(yaw)*(k-1)*.4,y:4,z:z-Math.sin(yaw)*(k-1)*.4,yaw,edge,k});
  }
  const crossingKeys=new Set();
  const crossingPositions=[];
  for(const edge of networks.person.edges){
    if(edge.tags.footway!=='crossing'||edge.length>60)continue;
    const key=[edge.from.key,edge.to.key].sort().join(':');if(crossingKeys.has(key))continue;crossingKeys.add(key);
    const mid=sampleEdge(edge,edge.length/2);crossingPositions.push([mid.x,mid.z]);
    const yaw=Math.atan2(edge.dx,edge.dz);
    for(let s=.5;s<edge.length-.3;s+=1.1){const p=sampleEdge(edge,s);box(p.x,p.y+.065,p.z,3.2,.035,.55,white,yaw);}

  }
  for(const point of data.elements.filter(e=>e.type==='node'&&e.tags?.highway==='crossing'&&e.tags.crossing!=='unmarked')){
    const [x,z]=project(point,data.center);if(crossingPositions.some(p=>Math.hypot(p[0]-x,p[1]-z)<8))continue;
    let best=12,hit=null;
    for(const edge of networks.car.edges){const d=(x-edge.from.point[0])*edge.dx+(z-edge.from.point[1])*edge.dz;if(d<0||d>edge.length)continue;const p=sampleEdge(edge,d),dist=Math.hypot(p.x-x,p.z-z);if(dist<best){best=dist;hit={edge,p};}}
    if(!hit)continue;const {edge,p}=hit,yaw=Math.atan2(edge.dx,edge.dz);
    for(let s=-edge.width/2+.5;s<edge.width/2;s+=1.1)box(p.x-edge.dz*s,.29,p.z+edge.dx*s,.55,.035,3.2,white,yaw);
    crossingPositions.push([x,z]);crossingKeys.add(`node:${point.id}`);
  }
  for(const [mat,geos]of buckets){root.add(new THREE.Mesh(mergeGeometries(geos),mat));geos.forEach(g=>g.dispose());}
  const lampGeometry=new THREE.SphereGeometry(.14,8,6),lampMaterial=new THREE.MeshBasicMaterial({color:0xffffff}),lamps=new THREE.InstancedMesh(lampGeometry,lampMaterial,lights.length);
  lights.forEach((l,i)=>{o.position.set(l.x,l.y,l.z);o.scale.setScalar(l.ped?.65:1);o.updateMatrix();lamps.setMatrixAt(i,o.matrix);});root.add(lamps);
  let last=-1;
  function update(time){if(Math.floor(time*4)===last)return;last=Math.floor(time*4);lights.forEach((l,i)=>{const state=l.ped?(walkAllows(l.node,time)?1:0):l.edge?({red:0,yellow:1,green:2})[signalState(l.edge,time)]:-1;lamps.setColorAt(i,new THREE.Color(l.k===state?(l.k===0?0xff3025:l.ped||l.k===2?0x39ef83:0xffc329):0x172324));});if(lamps.instanceColor)lamps.instanceColor.needsUpdate=true;}
  update(0);
  return {update,dispose(){scene.remove(root);root.traverse(m=>{m.geometry?.dispose();if(m.isInstancedMesh)m.dispose();});[dark,metal,white,lampMaterial].forEach(m=>m.dispose());unit.dispose();},anchors,count:seen.size,crossings:crossingKeys.size,focus(){const p=anchors[0];return p?{x:p.x,y:0,z:p.z}:null;}};
}

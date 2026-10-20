import * as THREE from 'three';
import {project,contains} from './map.js';
import {roadProfile} from './2026-10-16-twin-geometry.js';
import {randomSource} from './mobility-model.js';
import {segmentDistance} from './environment.js';

// Spatially indexed landscape: OSM locations, with inferred planting density and furniture dimensions.
export function createTwinLandscape(parent,data){
 const root=new THREE.Group();root.name='Mapped landscape and street detail';parent.add(root);
 const trees=[],lamps=[],stops=[],greens=[],roads=[],grid=new Map(),occupied=new Set(),random=randomSource(1026);
 const pos=p=>project(p,data.center),gridKey=(x,z)=>`${Math.floor(x/80)},${Math.floor(z/80)}`;
 function index(shape,pad=0){const xs=shape.points.map(p=>p[0]),zs=shape.points.map(p=>p[1]);
  for(let x=Math.floor((Math.min(...xs)-pad)/80);x<=Math.floor((Math.max(...xs)+pad)/80);x++)for(let z=Math.floor((Math.min(...zs)-pad)/80);z<=Math.floor((Math.max(...zs)+pad)/80);z++){const k=`${x},${z}`;if(!grid.has(k))grid.set(k,[]);grid.get(k).push(shape);}
 }
 for(const e of data.elements){const t=e.tags||{},p=e.geometry?.map(pos);if(!p?.length)continue;
  if(t.building||t.natural==='water')index({points:p,kind:'area'});
  if(t.leisure==='park'||t.leisure==='garden'||t.natural==='wood'||['forest','grass','meadow'].includes(t.landuse))greens.push(p);
  if(t.highway&&t.tunnel!=='yes'&&!['construction','proposed'].includes(t.highway)){
   const profile=roadProfile(t);for(let i=1;i<p.length;i++){const a=p[i-1],b=p[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<.2)continue;const s={a,b,length,points:[a,b],kind:'road',width:profile.width,tags:t};roads.push(s);index(s,profile.width/2+2);}
  }
 }
 const blocked=(x,z)=>(grid.get(gridKey(x,z))||[]).some(s=>s.kind==='area'?contains([x,z],s.points):segmentDistance([x,z],s.a,s.b).distance<s.width/2+1.5);
 function tree(x,z,h=6,mapped=false){const k=`${Math.round(x/7)},${Math.round(z/7)}`;if(trees.length>=1500||occupied.has(k)||(!mapped&&blocked(x,z)))return;occupied.add(k);trees.push({x,z,h,shade:random()});}
 for(const e of data.elements)if(e.type==='node'){
  const p=pos(e),t=e.tags||{};if(t.natural==='tree')tree(...p,Number.parseFloat(t.height)||6,true);
  if(t.highway==='street_lamp')lamps.push(p);if(t.highway==='bus_stop')stops.push(p);
 }
 for(const p of greens){
  const xs=p.map(v=>v[0]),zs=p.map(v=>v[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
  const attempts=Math.min(350,Math.ceil((maxX-minX)*(maxZ-minZ)/450));
  for(let i=0;i<attempts&&trees.length<1100;i++){const x=minX+random()*(maxX-minX),z=minZ+random()*(maxZ-minZ);if(contains([x,z],p))tree(x,z,4.5+random()*3.5);}
 }
 for(const r of roads){if(!['primary','secondary','tertiary'].includes(r.tags.highway)||r.tags.bridge==='yes')continue;const dx=(r.b[0]-r.a[0])/r.length,dz=(r.b[1]-r.a[1])/r.length;
  for(let d=15;d<r.length&&trees.length<1500;d+=35)for(const side of [-1,1]){const offset=(r.width/2+3.5)*side;tree(r.a[0]+dx*d-dz*offset,r.a[1]+dz*d+dx*offset,5.5+random()*1.2);}
  for(let d=35;d<r.length&&lamps.length<220;d+=80){const offset=r.width/2+1.4,x=r.a[0]+dx*d-dz*offset,z=r.a[1]+dz*d+dx*offset;if(!blocked(x,z))lamps.push([x,z]);}
 }
 const dummy=new THREE.Object3D(),trunk=new THREE.MeshStandardMaterial({color:0x78634b,roughness:1}),leaf=new THREE.MeshStandardMaterial({color:0x66804b,roughness:1}),metal=new THREE.MeshStandardMaterial({color:0x626d70,metalness:.5,roughness:.55}),light=new THREE.MeshStandardMaterial({color:0xe5e1cf,emissive:0xffd390,emissiveIntensity:0});
 function instances(geometry,material,items,transform,colored=false){const mesh=new THREE.InstancedMesh(geometry,material,items.length);items.forEach((item,i)=>{dummy.position.set(0,0,0);dummy.scale.set(1,1,1);dummy.rotation.set(0,0,0);transform(dummy,item);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);if(colored)mesh.setColorAt(i,new THREE.Color().setHSL(.23+item.shade*.07,.22,.35+item.shade*.12));});mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);}
 instances(new THREE.CylinderGeometry(.13,.2,1,6),trunk,trees,(o,t)=>{o.position.set(t.x,t.h*.32,t.z);o.scale.y=t.h*.64;});
 instances(new THREE.IcosahedronGeometry(1,1),leaf,trees,(o,t)=>{o.position.set(t.x,t.h*.72,t.z);o.scale.set(t.h*.31,t.h*.43,t.h*.32);o.rotation.y=t.shade*6;},true);
 instances(new THREE.BoxGeometry(.12,7,.12),metal,lamps,(o,p)=>o.position.set(p[0],3.5,p[1]));
 instances(new THREE.BoxGeometry(1.2,.15,.5),light,lamps,(o,p)=>o.position.set(p[0],7,p[1]));
 instances(new THREE.BoxGeometry(.1,3,.1),metal,stops,(o,p)=>o.position.set(p[0],1.5,p[1]));
 instances(new THREE.BoxGeometry(.65,.7,.12),new THREE.MeshStandardMaterial({color:0x2a6968,roughness:.6}),stops,(o,p)=>o.position.set(p[0],2.7,p[1]));
 return {setNight(value){light.emissiveIntensity=value?2:0;},trees:trees.length};
}

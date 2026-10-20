import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {routePose} from './2026-10-16-twin-geometry.js';

// Every trip retains its source timing. These car forms do not classify mode codes.
export function createTwinVehicles(scene,capacity,colors) {
 const root=new THREE.Group();scene.add(root);
 function box(w,h,d,x,y,z){const g=new THREE.BoxGeometry(w,h,d);g.translate(x,y,z);return g;}
 const bodyGeometry=mergeGeometries([box(1.82,.64,4.35,0,.73,0),box(1.6,.5,2.35,0,1.28,-.25)]);
 // Keep the legend color readable even under building shadows and at night.
 const body=new THREE.InstancedMesh(bodyGeometry,new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false}),capacity);
 body.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(capacity*3).fill(1),3).setUsage(THREE.DynamicDrawUsage);body.count=0;body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);body.frustumCulled=false;body.castShadow=true;body.receiveShadow=false;root.add(body);
 const detailCapacity=4500,parts=[];
 function part(geometry,material){const mesh=new THREE.InstancedMesh(geometry,material,detailCapacity);mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.count=0;root.add(mesh);parts.push(mesh);return mesh;}
 const glass=new THREE.MeshStandardMaterial({color:0x526d80,metalness:.15,roughness:.45});
 part(mergeGeometries([box(.035,.27,1.7,-.815,1.27,-.25),box(.035,.27,1.7,.815,1.27,-.25),box(1.4,.27,.035,0,1.27,.94),box(1.4,.27,.035,0,1.27,-1.44)]),glass);
 const wheelGeometry=[];for(const x of [-.91,.91])for(const z of [-1.35,1.35]){const g=new THREE.CylinderGeometry(.34,.34,.2,10);g.rotateZ(Math.PI/2);g.translate(x,.36,z);wheelGeometry.push(g);}
 part(mergeGeometries(wheelGeometry),new THREE.MeshStandardMaterial({color:0x182127,roughness:.9}));
 part(mergeGeometries([box(.48,.15,.04,-.57,.8,2.19),box(.48,.15,.04,.57,.8,2.19)]),new THREE.MeshStandardMaterial({color:0xf4f3d4,emissive:0xffe4aa,emissiveIntensity:.7}));
 part(mergeGeometries([box(.48,.15,.04,-.57,.8,-2.19),box(.48,.15,.04,.57,.8,-2.19)]),new THREE.MeshStandardMaterial({color:0x8d1520,emissive:0xc71924,emissiveIntensity:.4}));
 const dummy=new THREE.Object3D(),palette=Object.fromEntries(Object.entries(colors).map(([k,v])=>[k,new THREE.Color(v)]));
 let revision=-1,lastTime=-1,lastView='',lastVersion=-1,lastState={near:false,detailed:0};
 return {root,update(routed,time,camera,target,positions,version,roadAt){
  const distance=camera.position.distanceTo(target),near=distance<6500;root.visible=near;
  const viewKey=`${near}:${Math.floor(camera.position.x/100)}:${Math.floor(camera.position.z/100)}`;
  if(time===lastTime&&version===lastVersion&&viewKey===lastView)return lastState;
  lastTime=time;lastVersion=version;lastView=viewKey;let detailed=0;
  for(let i=0;i<routed.length;i++){
   const {row,path}=routed[i],pose=routePose(path,(time-row.start)/(row.end-row.start)),profile=roadAt(pose.a,pose.b);
   const offset=profile?(profile.oneway?0:Math.min(profile.width/4,1.65)):0;
   pose.x-=pose.dz*offset;pose.z+=pose.dx*offset;const y=profile?.y||.26;
   positions[i*3]=pose.x;positions[i*3+1]=y+1;positions[i*3+2]=pose.z;
   if(!near)continue;
   dummy.position.set(pose.x,y,pose.z);dummy.rotation.set(0,pose.yaw,0);dummy.scale.setScalar(1);dummy.updateMatrix();body.setMatrixAt(i,dummy.matrix);
   if(revision!==version)body.setColorAt(i,palette[row.mode]||palette[97]);
   if(detailed<detailCapacity&&Math.hypot(pose.x-camera.position.x,pose.z-camera.position.z)<1700){for(const mesh of parts)mesh.setMatrixAt(detailed,dummy.matrix);detailed++;}
  }
  if(near){body.count=routed.length;body.instanceMatrix.needsUpdate=true;if(body.instanceColor)body.instanceColor.needsUpdate=true;for(const mesh of parts){mesh.count=detailed;mesh.instanceMatrix.needsUpdate=true;}revision=version;}
  lastState={near,detailed};return lastState;
 }};
}

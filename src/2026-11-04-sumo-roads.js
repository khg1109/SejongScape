import * as THREE from 'three';
import {roadSurface} from './2026-11-04-road-surface.js';
// Use the homepage surface builder, retaining the SUMO lane centre and width.
function strip(points,width,y,offset=0){
 const g=roadSurface(points,width,y,{offset});
 if(!g)return [];
 const vertices=Array.from(g.attributes.position.array);g.dispose();return vertices;
}
// Geometry exported from netconvert, in the same x/z coordinates as FCD vehicles.
export function createSumoRoads(scene,roadMaterial){
 let group=null;
 const material=roadMaterial??new THREE.MeshStandardMaterial({color:0x454d51,roughness:1});
 const white=new THREE.MeshBasicMaterial({color:0xcacdc2});
 const yellow=new THREE.MeshBasicMaterial({color:0xb5a87b});
 function replace(data){
  if(group){group.traverse(o=>o.geometry?.dispose());scene.remove(group);}
  group=new THREE.Group();group.name='SUMO lane geometry';scene.add(group);
  const raw={road:[],white:[],yellow:[]};
  for(const lane of data.lanes){
   const pts=lane.centerline,w=lane.width;
   raw.road.push(...strip(pts,w,.28));
   // SUMO index 0 is rightmost. Continuous edge lines share the pavement joins.
   if(lane.index===0)raw.white.push(...strip(pts,.12,.32,w/2-.08));
   if(lane.inner)raw[lane.oneway?'white':'yellow'].push(...strip(pts,lane.oneway?.12:.18,.325,-w/2+.06));
   else {
    // Carry dash phase through bends rather than restarting at each shape point.
    let travelled=0;
    for(let i=1;i<pts.length;i++){
     const a=pts[i-1],b=pts[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<.01)continue;
     for(let start=Math.floor(travelled/9)*9;start<travelled+len;start+=9){
      const lo=Math.max(0,start-travelled),hi=Math.min(len,start+4-travelled);if(hi<=lo)continue;
      const at=d=>[a[0]+(b[0]-a[0])*d/len,a[1]+(b[1]-a[1])*d/len];
      raw.white.push(...strip([at(lo),at(hi)],.11,.325,-w/2));
     }
     travelled+=len;
    }
   }
  }
  for(const points of data.junctions){
   if(points.length<3)continue;
   const g=new THREE.ShapeGeometry(new THREE.Shape(points.map(p=>new THREE.Vector2(p[0],-p[1]))));g.rotateX(-Math.PI/2);g.translate(0,.285,0);const triangles=g.toNonIndexed();raw.road.push(...triangles.attributes.position.array);triangles.dispose();g.dispose();
  }
  for(const [kind,positions] of Object.entries(raw)){
   const tiles=new Map();
   for(let i=0;i<positions.length;i+=9){const x=(positions[i]+positions[i+3]+positions[i+6])/3,z=(positions[i+2]+positions[i+5]+positions[i+8])/3,key=`${Math.floor(x/1000)}:${Math.floor(z/1000)}`;if(!tiles.has(key))tiles.set(key,[]);const target=tiles.get(key);for(let j=0;j<9;j++)target.push(positions[i+j]);}
   for(const vertices of tiles.values()){
    // Float32 rounding can reverse tiny junction triangles; keep their top visible.
    const positions=new Float32Array(vertices);
    for(let i=0;i<positions.length;i+=9){
     const cross=(positions[i+3]-positions[i])*(positions[i+8]-positions[i+2])-(positions[i+5]-positions[i+2])*(positions[i+6]-positions[i]);
     if(cross>0)for(let j=0;j<3;j++){const v=positions[i+3+j];positions[i+3+j]=positions[i+6+j];positions[i+6+j]=v;}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));if(kind==='road'){const uv=[];for(let i=0;i<positions.length;i+=3)uv.push(positions[i]*.25,positions[i+2]*.25);g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));}g.computeVertexNormals();g.computeBoundingSphere();const m=new THREE.Mesh(g,kind==='road'?material:kind==='white'?white:yellow);m.receiveShadow=kind==='road';group.add(m);}
  }
 }
 return {replace};
}

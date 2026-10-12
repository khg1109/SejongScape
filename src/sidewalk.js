import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {project} from './map.js';
import {surfaceTexture} from './environment.js';

export function isMappedSidewalk(item){const t=item.tags||{};return t.highway==='footway'&&t.footway==='sidewalk'&&t.tunnel!=='yes'&&t.indoor!=='yes'&&t.area!=='yes';}
export function sidewalkSegments(item,center){
  if(!isMappedSidewalk(item)||!item.geometry)return [];
  const specified=Number.parseFloat(item.tags.width),width=specified>0?specified:2.2,segments=[];
  const pts=item.geometry.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)).map(p=>project(p,center));
  for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length>.1)segments.push({a,b,startNode:item.nodes?.[i-1],endNode:item.nodes?.[i],length,width,estimated:!(specified>0),y:item.tags.bridge&&item.tags.bridge!=='no'?1.2:.2});}
  return segments;
}
export function createSidewalkRenderer(){
  const paving=new THREE.MeshStandardMaterial({color:0xe0cdb4,map:surfaceTexture('path'),roughness:.95}),curb=new THREE.MeshStandardMaterial({color:0xd5d7cd,roughness:1});
  function build(data){
    const group=new THREE.Group(),surfaces=[],edges=[];
    const crossingNodes=new Set(data.elements.filter(e=>e.tags?.footway==='crossing').flatMap(e=>e.nodes||[]));
    for(const item of data.elements)for(const {a,b,startNode,endNode,length,width,y}of sidewalkSegments(item,data.center)){
      const dx=(b[0]-a[0])/length,dz=(b[1]-a[1])/length,yaw=-Math.atan2(dz,dx),x=(a[0]+b[0])/2,z=(a[1]+b[1])/2;
      // The mapped centreline is retained; only width/thickness are styled when not surveyed.
      const surface=new THREE.BoxGeometry(length,.12,width);surface.rotateY(yaw);surface.translate(x,y+.07,z);
      const uv=surface.attributes.uv,p=surface.attributes.position;for(let i=0;i<uv.count;i++)uv.setXY(i,p.getX(i)*.3,p.getZ(i)*.3);surfaces.push(surface);
      const start=crossingNodes.has(startNode)?Math.min(2,length/2):0,end=crossingNodes.has(endNode)?Math.min(2,length/2):0,curbLength=length-start-end;
      if(curbLength>.1)for(const sign of [-1,1]){const g=new THREE.BoxGeometry(curbLength,.15,.12);g.rotateY(yaw);g.translate(x+dx*(start-end)/2-dz*(width/2-.06)*sign,y+.08,z+dz*(start-end)/2+dx*(width/2-.06)*sign);edges.push(g);}
    }
    for(const [gs,mat]of [[surfaces,paving],[edges,curb]])if(gs.length){const mesh=new THREE.Mesh(mergeGeometries(gs),mat);mesh.receiveShadow=true;group.add(mesh);gs.forEach(g=>g.dispose());}
    return group;
  }
  return {build};
}

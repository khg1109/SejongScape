import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { project, contains, stitchRings, buildingHeight } from './map.js';
import { roadWidth, randomSource } from './mobility-model.js';

export function segmentDistance(p,a,b) {
  const dx=b[0]-a[0],dz=b[1]-a[1],l=dx*dx+dz*dz;
  const t=l?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/l)):0;
  return {distance:Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dz*t),x:a[0]+dx*t,z:a[1]+dz*t,t};
}

export function createEnvironment(scene,data) {
  const root=new THREE.Group();root.name='Mapped landscape and street detail';scene.add(root);
  const rng=randomSource(3021),projected=p=>project(p,data.center),roads=[],polygons=[],waters=[],greens=[];
  const stats={mappedTrees:0,landscapeTrees:0,stops:0,crossings:0,lamps:0};
  for(const e of data.elements) {
    const t=e.tags||{};
    if(e.type==='relation'&&t.natural==='water'){
      const inner=stitchRings(e.members||[],'inner').map(r=>r.map(projected));
      stitchRings(e.members||[],'outer').forEach(r=>waters.push({outer:r.map(projected),inner}));
    }
    if(!e.geometry)continue;
    const p=e.geometry.map(projected);
    if(t.building)polygons.push(p);
    if(t.natural==='water')waters.push({outer:p,inner:[]});
    if(t.leisure==='park'||t.leisure==='garden'||['wood','scrub'].includes(t.natural)||['forest','grass'].includes(t.landuse))greens.push({points:p,tags:t});
    if(t.highway&&t.tunnel!=='yes'&&t.area!=='yes'&&!['construction','proposed','raceway'].includes(t.highway))for(let i=1;i<p.length;i++){
      const a=p[i-1],b=p[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<.3)continue;
      roads.push({a,b,length,width:roadWidth(t),tags:t,dx:(b[0]-a[0])/length,dz:(b[1]-a[1])/length,y:t.bridge&&t.bridge!=='no'?1.23:.23});
    }
  }
  const grid=new Map();
  roads.forEach(r=>{for(let x=Math.floor((Math.min(r.a[0],r.b[0])-15)/40);x<=Math.floor((Math.max(r.a[0],r.b[0])+15)/40);x++)for(let z=Math.floor((Math.min(r.a[1],r.b[1])-15)/40);z<=Math.floor((Math.max(r.a[1],r.b[1])+15)/40);z++){const k=`${x},${z}`;if(!grid.has(k))grid.set(k,[]);grid.get(k).push(r);}});
  const nearby=p=>grid.get(`${Math.floor(p[0]/40)},${Math.floor(p[1]/40)}`)||[];
  const wet=p=>waters.some(w=>contains(p,w.outer)&&!w.inner.some(h=>contains(p,h)));
  const solid=p=>polygons.some(r=>contains(p,r));
  const blocked=p=>wet(p)||solid(p)||nearby(p).some(r=>segmentDistance(p,r.a,r.b).distance<r.width/2+1.8);
  const buckets=new Map(),box=new THREE.BoxGeometry(1,1,1),trunkGeo=new THREE.CylinderGeometry(.75,1,1,7),crownGeo=new THREE.IcosahedronGeometry(1,2);
  const materials={trunk:new THREE.MeshStandardMaterial({color:0x75614a}),leaf:new THREE.MeshStandardMaterial({color:0x698348,roughness:.95}),steel:new THREE.MeshStandardMaterial({color:0x56676b,metalness:.45,roughness:.4}),concrete:new THREE.MeshStandardMaterial({color:0xc6c3b3,roughness:.85}),glass:new THREE.MeshStandardMaterial({color:0x719297,metalness:.4,roughness:.18}),wood:new THREE.MeshStandardMaterial({color:0x9a7f58,roughness:.85}),lamp:new THREE.MeshBasicMaterial({color:0xffddb0}),mark:new THREE.MeshBasicMaterial({color:0xe7e4cc})};
  function instance(key,geometry,material,x,y,z,sx,sy,sz,yaw=0,color=null){if(!buckets.has(key))buckets.set(key,{geometry,material,items:[]});buckets.get(key).items.push({x,y,z,sx,sy,sz,yaw,color});}
  function tree(x,z,height=6,y=0,mapped=false){
    instance('trunk',trunkGeo,materials.trunk,x,y+height*.32,z,.17,height*.64,.17);
    for(let i=0;i<3;i++)instance('crown',crownGeo,materials.leaf,x+(i-1)*height*.14,y+height*(.62+i*.1),z+Math.sin(i*4)*height*.14,height*.27,height*.3,height*.27,rng()*6,new THREE.Color().setHSL(.23+rng()*.07,.24+rng()*.13,.23+rng()*.12));
    if(mapped)stats.mappedTrees++;else stats.landscapeTrees++;
  }
  function lamp(x,z,yaw,height=7){instance('pole',box,materials.steel,x,height/2,z,.12,height,.12);instance('lamp-head',box,materials.lamp,x,height,z,1.25,.12,.5,yaw);stats.lamps++;}
  for(const e of data.elements)if(e.type==='node'&&e.tags?.natural==='tree') {const p=projected(e);if(!wet(p))tree(...p,Number.parseFloat(e.tags.height)||6,0,true);}
  const occupiedTrees=new Set();
  for(const g of greens){const p=g.points,xs=p.map(p=>p[0]),zs=p.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
    const dense=g.tags.natural==='wood'||g.tags.landuse==='forest';
    const attempts=Math.min(2200,Math.ceil((maxX-minX)*(maxZ-minZ)/(dense?140:950)));
    for(let i=0;i<attempts;i++){const x=minX+rng()*(maxX-minX),z=minZ+rng()*(maxZ-minZ),key=`${Math.round(x/6)},${Math.round(z/6)}`;if(!occupiedTrees.has(key)&&contains([x,z],p)&&!blocked([x,z])){tree(x,z,4+rng()*4);occupiedTrees.add(key);}}
  }
  const major=r=>['primary','secondary','tertiary','busway'].includes(r.tags.highway);
  // Additional road-side trees/lamps follow mapped roads; exact planting is inferred.
  for(const r of roads)if(major(r)&&r.y<1){
    for(let d=12;d<r.length;d+=24)for(const side of [-1,1]){
      const offset=(r.width/2+3)*side,x=r.a[0]+r.dx*d-r.dz*offset,z=r.a[1]+r.dz*d+r.dx*offset;
      const key=`${Math.round(x/6)},${Math.round(z/6)}`;
      if(!occupiedTrees.has(key)&&!blocked([x,z])){tree(x,z,5.5+rng()*1.5);occupiedTrees.add(key);}
    }
    for(let d=20;d<r.length;d+=55){const offset=r.width/2+1,x=r.a[0]+r.dx*d-r.dz*offset,z=r.a[1]+r.dz*d+r.dx*offset;if(!wet([x,z])&&!solid([x,z]))lamp(x,z,Math.atan2(r.dx,r.dz));}
  }
  // Roof planting is a schematic interpretation of the documented government roof garden.
  for(const e of data.elements)if(e.geometry&&e.tags?.building==='office'&&/\(\d+(?:-\d+)?동\)/.test(e.tags.name||'')){
    const p=e.geometry.map(projected),height=buildingHeight(e.tags).value;
    const xs=p.map(v=>v[0]),zs=p.map(v=>v[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
    for(let i=0;i<70;i++){const x=minX+rng()*(maxX-minX),z=minZ+rng()*(maxZ-minZ);if(contains([x,z],p))tree(x,z,1.5+rng(),height+.5);}
  }
  function nearestRoad(p){let best=null,distance=Infinity;for(const r of nearby(p)){if(!['primary','secondary','tertiary','residential','service','busway','tertiary_link'].includes(r.tags.highway))continue;const hit=segmentDistance(p,r.a,r.b);if(hit.distance<distance){distance=hit.distance;best={...r,hit};}}return best;}
  for(const e of data.elements)if(e.type==='node'){
    const t=e.tags||{},p=projected(e),r=nearestRoad(p);
    if(t.highway==='bus_stop'&&r){
      const yaw=Math.atan2(r.dx,r.dz),x=p[0],z=p[1];
      instance('stop-sign',box,materials.steel,x,1.6,z,.1,3.2,.1);instance('stop-board',box,materials.glass,x,2.7,z,.7,.75,.12,yaw);
      if(t.shelter==='yes'){
        instance('stop-roof',box,materials.steel,x,2.9,z,2.1,.18,5,yaw);
        for(const side of [-1,1])instance('stop-post',box,materials.steel,x+r.dx*2*side,1.4,z+r.dz*2*side,.12,2.8,.12);
        instance('stop-bench',box,materials.wood,x,.55,z,.6,.14,3,yaw);
      }
      stats.stops++;
    }
    if(t.highway==='crossing'&&r&&r.hit.distance<r.width/2+2&&t.crossing!=='unmarked'){
      const yaw=Math.atan2(r.dx,r.dz),width=r.width;
      // Active-region traffic rendering owns crossing stripes and their signals.
      stats.crossings++;
    }
    if(t.highway==='street_lamp')lamp(p[0],p[1],0);
    if(t.amenity==='bench')instance('bench',box,materials.wood,p[0],.5,p[1],1.7,.15,.5);
  }
  for(const [key,b] of buckets){
    const mesh=new THREE.InstancedMesh(b.geometry,b.material,b.items.length),o=new THREE.Object3D();
    b.items.forEach((v,i)=>{o.position.set(v.x,v.y,v.z);o.rotation.set(0,v.yaw,0);o.scale.set(v.sx,v.sy,v.sz);o.updateMatrix();mesh.setMatrixAt(i,o.matrix);if(v.color)mesh.setColorAt(i,v.color);});
    mesh.castShadow=!['crosswalk','lamp-head'].includes(key);mesh.receiveShadow=true;root.add(mesh);
  }
  return {stats,setNight(value){materials.lamp.color.set(value?0xffdba4:0xc4c7bd);},blocked};
}

export function surfaceTexture(kind) {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const c=canvas.getContext('2d'),rng=randomSource(899);
  c.fillStyle=kind==='grass'?'#8b986b':kind==='path'?'#b5b3a4':'#707579';c.fillRect(0,0,256,256);
  for(let i=0;i<16000;i++){c.fillStyle=`rgba(${rng()>.5?'255,255,255':'0,0,0'},${rng()*.13})`;c.fillRect(rng()*256,rng()*256,1,1);}
  if(kind==='path'){c.strokeStyle='#8b9287';c.lineWidth=.6;for(let i=0;i<256;i+=32){c.beginPath();c.moveTo(i,0);c.lineTo(i,256);c.moveTo(0,i);c.lineTo(256,i);c.stroke();}}
  const t=new THREE.CanvasTexture(canvas);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;return t;
}

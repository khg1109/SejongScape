import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {project,stitchRings,contains} from './map.js';
import {createBuildingDetails} from './building-detail.js';
import {createArchitecture} from './architecture.js';
import {surfaceTexture,segmentDistance} from './environment.js';
import {createSidewalkRenderer} from './sidewalk.js';
import {createTwinLandscape} from './2026-10-16-twin-landscape.js';
import {roadWidth} from './mobility-model.js';
import {roadSurface} from './2026-11-04-road-surface.js';
import {roadProfile,ribbon} from './2026-10-16-twin-geometry.js';

const landmarkNames=new Set(['국립세종도서관','대통령기록관']);
const key=(a,b)=>[`${Math.round(a[0])},${Math.round(a[1])}`,`${Math.round(b[0])},${Math.round(b[1])}`].sort().join('|');
export async function createTwinWorld(scene,renderer,options={}) {
 const response=await fetch('/data/city.json');if(!response.ok)throw Error('도시 외곽선 자료를 불러오지 못했습니다.');
 const index=await response.json(),baseResponse=await fetch('/data/sejong.json');if(!baseResponse.ok)throw Error('도심 지도 자료를 불러오지 못했습니다.');const base=await baseResponse.json(),root=new THREE.Group();scene.add(root);
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.9;
 renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.type=THREE.PCFShadowMap;
 const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment(),environment=pmrem.fromScene(room,.05);scene.environment=environment.texture;scene.environmentIntensity=.45;room.dispose();pmrem.dispose();
 const hemi=new THREE.HemisphereLight(0xc5dfff,0x788365,1.8),sun=new THREE.DirectionalLight(0xffedcb,2.4);scene.add(hemi,sun,sun.target);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.normalBias=.35;sun.shadow.bias=-.00015;
 const groundTexture=surfaceTexture('grass');groundTexture.repeat.set(1400,1400);groundTexture.anisotropy=8;
 const groundMat=new THREE.MeshStandardMaterial({color:0xc5c8b3,map:groundTexture,roughness:1});
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(180000,180000),groundMat);ground.rotation.x=-Math.PI/2;ground.position.set(0,-.2,-15000);ground.receiveShadow=true;root.add(ground);
 const asphalt=surfaceTexture('asphalt'),paving=surfaceTexture('path');asphalt.anisotropy=paving.anisotropy=8;
 const mats={
  road:options.roadMaterial??new THREE.MeshStandardMaterial({color:0x7b858b,map:asphalt,roughness:.93}),
  path:new THREE.MeshStandardMaterial({color:0xd6cebb,map:paving,roughness:1}),
  curb:new THREE.MeshStandardMaterial({color:0xa7a99e,roughness:.95}),
  water:new THREE.MeshStandardMaterial({color:0x498e9a,metalness:.35,roughness:.24}),
  green:new THREE.MeshStandardMaterial({color:0x78946c,roughness:1}),
  field:new THREE.MeshStandardMaterial({color:0xadb080,roughness:1}),
  urban:new THREE.MeshStandardMaterial({color:0xc6c4b6,roughness:1}),
  white:new THREE.MeshStandardMaterial({color:0xe5dfc7,roughness:.9}),
  yellow:new THREE.MeshStandardMaterial({color:0xeac762,roughness:.9})
 };
 const details=createBuildingDetails(),architecture=createArchitecture(),sidewalks=createSidewalkRenderer(),loaded=new Map(),cache=new Map(),roadProfiles=new Map();
 const status=document.createElement('div');status.className='twin-map-status';status.setAttribute('role','status');status.textContent='건물 외곽선과 도로를 불러오는 중';document.querySelector('#app').append(status);
 let night=false,busy=false,lastKey='',retryAt=0,focus=[0,0],detailCount=0,lastShadowKey='';
 const overviewIds=new Set(index.overview.map(e=>`${e.type}/${e.id}`));
 const pos=p=>project(p,index.center);
 const shapeOf=points=>new THREE.Shape(points.map(p=>new THREE.Vector2(p[0],-p[1])));
 function build(elements,coarse=false){
  const group=new THREE.Group(),buckets={},buildingItems=[],segments=[];
  function add(kind,g){const flat=g.index?g.toNonIndexed():g;flat.deleteAttribute('uv');const a=flat.attributes.position,uv=[],scale=kind==='road'&&options.roadMaterial?.map ? .25:1/12;for(let i=0;i<a.count;i++)uv.push(a.getX(i)*scale,a.getZ(i)*scale);flat.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));(buckets[kind]??=[]).push(flat);if(flat!==g)g.dispose();}
  function surface(points,kind,y,holes=[]){if(points.length<4)return;const shape=shapeOf(points);shape.holes=holes.map(p=>new THREE.Path(p.map(q=>new THREE.Vector2(q[0],-q[1]))));const g=new THREE.ShapeGeometry(shape);g.rotateX(-Math.PI/2);g.translate(0,y,0);add(kind,g);}
  const raw={road:[],path:[],curb:[],white:[],yellow:[]};
  for(const e of elements){
   const t=e.tags||{};
   if(!coarse&&overviewIds.has(`${e.type}/${e.id}`)&&!t.highway)continue;
   if(e.members&&t.natural==='water'){const outer=stitchRings(e.members,'outer').map(r=>r.map(pos)),inner=stitchRings(e.members,'inner').map(r=>r.map(pos));for(const r of outer)surface(r,'water',.08,inner.filter(h=>contains(h[0],r)));continue;}
   const pts=e.geometry?.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)).map(pos);if(!pts||pts.length<2)continue;
   if(t.building){
    if(!coarse&&pts.length>=4){if(landmarkNames.has(t.name)||(t.building==='office'&&/\(\d+(?:-\d+)?동\)/.test(t.name||'')))group.add(architecture.make(e,pts));else buildingItems.push({item:e,points:pts});}
    continue;
   }
   if(t.natural==='water')surface(pts,'water',.08);
   else if(['farmland','farmyard','orchard'].includes(t.landuse))surface(pts,'field',.01);
   else if(['forest','grass','meadow','recreation_ground','village_green'].includes(t.landuse)||['wood','scrub'].includes(t.natural)||['park','garden','pitch'].includes(t.leisure))surface(pts,'green',.035);
   else if(['residential','commercial','industrial','retail'].includes(t.landuse))surface(pts,'urban',0);
   else if(t.amenity==='parking')surface(pts,'road',.11);
   if(!t.highway||t.tunnel==='yes'||['proposed','construction','bus_stop','crossing','traffic_signals'].includes(t.highway))continue;
   if(options.sumoWayIds?.has(e.id))continue;
   const p=roadProfile(t);
   if(options.mainRoadStyle){p.width=roadWidth(t);p.lanes=Number.parseInt(t.lanes)||Math.max(2,Math.round(p.width/3.4));}
   const y=coarse?.14:p.y,kind=p.pedestrian?'path':'road';
   if(options.mainRoadStyle){const surface=roadSurface(pts,p.width,y,{caps:true});if(surface)add(kind,surface);}
   else raw[kind].push(...ribbon(pts,p.width,y));
   if(coarse)continue;
   for(let i=1;i<pts.length;i++){
    const a=pts[i-1],b=pts[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<.1)continue;
    roadProfiles.set(key(a,b),p);segments.push({a,b,profile:p,tags:t});
    if(p.pedestrian||p.width<5)continue;
    // Markings illustrate mapped or inferred lanes; they are not surveyed paint geometry.
    for(const side of [-1,1])raw.white.push(...ribbon([a,b],.13,y+.035,side*(p.width/2-.3)));
    if(!p.oneway)raw.yellow.push(...ribbon([a,b],.16,y+.045));
    for(let lane=1;lane<p.lanes;lane++){
     const offset=-p.width/2+p.width*lane/p.lanes;if(!p.oneway&&Math.abs(offset)<.3)continue;
     for(let d=0;d<len;d+=10){const end=Math.min(d+4,len);raw.white.push(...ribbon([[a[0]+(b[0]-a[0])*d/len,a[1]+(b[1]-a[1])*d/len],[a[0]+(b[0]-a[0])*end/len,a[1]+(b[1]-a[1])*end/len]],.12,y+.04,offset));}
    }
   }
  }
  if(!coarse){
   for(const e of elements){if(e.type!=='node'||e.tags?.highway!=='crossing'||e.tags.crossing==='unmarked')continue;const p=pos(e);let best=null,distance=18;
    for(const s of segments){if(s.profile.pedestrian)continue;const hit=segmentDistance(p,s.a,s.b);if(hit.distance<distance){distance=hit.distance;best={...s,hit};}}
    if(!best)continue;const {a,b,profile,hit}=best,dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),nx=-dz/len,nz=dx/len;
    for(let q=-profile.width/2+.4;q<profile.width/2;q+=.9){const x=hit.x+nx*q,z=hit.z+nz*q;raw.white.push(...ribbon([[x-dx/len*1.6,z-dz/len*1.6],[x+dx/len*1.6,z+dz/len*1.6]],.45,profile.y+.06));}
   }
  }
  for(const[k,vertices]of Object.entries(raw)){if(!vertices.length)continue;const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.computeVertexNormals();add(k,g);}
  for(const[k,geometries]of Object.entries(buckets)){const g=mergeGeometries(geometries);for(const source of geometries)source.dispose();if(g){const mesh=new THREE.Mesh(g,mats[k]);mesh.receiveShadow=k!=='water';group.add(mesh);}}
  if(buildingItems.length)group.add(details.build(buildingItems));
  if(!coarse)group.add(sidewalks.build({center:index.center,elements}));
  group.userData.buildings=buildingItems.length;return group;
 }
 const coarse=build(index.overview,true);root.add(coarse);
 // The original city dataset owns the central district; it is deliberately absent from the surrounding tile files.
 const core=build(base.elements);root.add(core);const coreLandscape=createTwinLandscape(core,base);core.userData.landscape=coreLandscape;coreLandscape.setNight(false);
 const dots=[];for(let i=0;i<index.buildingPoints.length;i+=2)dots.push(index.buildingPoints[i],1,index.buildingPoints[i+1]);
 const dotsGeometry=new THREE.BufferGeometry();dotsGeometry.setAttribute('position',new THREE.Float32BufferAttribute(dots,3));const footprints=new THREE.Points(dotsGeometry,new THREE.PointsMaterial({color:0x9a9d91,size:13,sizeAttenuation:true}));root.add(footprints);
 function dispose(group){group.traverse(o=>{if(o.name==='Mapped landscape and street detail'){const materials=new Set();o.traverse(child=>{if(child.material)materials.add(child.material);});materials.forEach(m=>m.dispose());}o.geometry?.dispose();});root.remove(group);}
 async function refresh(x,z){
  busy=true;const wanted=index.tiles.filter(t=>Math.hypot(t.x-x,t.z-z)<3200).sort((a,b)=>Math.hypot(a.x-x,a.z-z)-Math.hypot(b.x-x,b.z-z)).slice(0,9),keys=new Set(wanted.map(t=>t.key));
  for(const[k,g]of loaded)if(!keys.has(k)){dispose(g);loaded.delete(k);}
  let failure=false;status.textContent='주변 건물·차선·녹지를 자세히 불러오는 중…';
  for(const tile of wanted){
   if(loaded.has(tile.key))continue;
   try{
    let data=cache.get(tile.key);if(!data){const r=await fetch(tile.file);if(!r.ok)throw Error('지도 타일 응답 '+r.status);data=await r.json();cache.set(tile.key,data);if(cache.size>20)cache.delete(cache.keys().next().value);}
    const group=build(data.elements);root.add(group);loaded.set(tile.key,group);renderer.shadowMap.needsUpdate=true;
    // Landscape only within the loaded tile. Planting and street furniture details are schematic.
    const scenery=data.elements.filter(e=>{if(e.type==='node')return true;if(!e.geometry?.length)return false;const p=pos(e.geometry[0]);return Math.hypot(p[0]-tile.x,p[1]-tile.z)<950;});
    const landscape=createTwinLandscape(group,{center:index.center,elements:scenery});landscape.setNight(night);group.userData.landscape=landscape;
   }catch(error){console.error(error);failure=true;}
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  detailCount=[...loaded.values()].reduce((sum,g)=>sum+g.userData.buildings,core.userData.buildings);
  status.textContent=failure?'일부 지도 로딩 실패 · 다시 시도 중':`주변 건물 ${detailCount.toLocaleString()}개 · ${loaded.size}개 구역 · OSM 외곽선`;
  if(failure){lastKey='';retryAt=performance.now()+10000;}busy=false;
 }
 function theme(value){renderer.shadowMap.needsUpdate=true;night=value;coreLandscape.setNight(night);details.setNight(night);architecture.setNight(night);for(const g of loaded.values())g.userData.landscape?.setNight(night);
  scene.background=new THREE.Color(night?0x122536:0xc4dce6);scene.fog=new THREE.FogExp2(night?0x122536:0xc4dce6,night?.000038:.000022);scene.environmentIntensity=night?.22:.45;
  hemi.intensity=night?1.15:1.8;sun.intensity=night?.65:2.4;sun.color.set(night?0x9bb9e5:0xffedcb);groundMat.color.set(night?0x67776b:0xc5c8b3);renderer.toneMappingExposure=night?.85:.9;
 }
 theme(false);
 return {index,get revision(){return roadProfiles.size;},setNight:theme,roadAt:(a,b)=>roadProfiles.get(key(a,b)),update(camera,target,playing=false){
  focus=[target.x,target.z];const distance=camera.position.distanceTo(target);footprints.visible=distance>6500;
  const k=`${Math.floor(focus[0]/800)}:${Math.floor(focus[1]/800)}`;
  if(!busy&&k!==lastKey&&performance.now()>retryAt&&distance<18000){lastKey=k;refresh(...focus);}
  const shadowKey=`${Math.round(target.x/15)}:${Math.round(target.z/15)}:${Math.round(distance/25)}`;if(playing||shadowKey!==lastShadowKey){renderer.shadowMap.needsUpdate=true;lastShadowKey=shadowKey;}
  const radius=Math.min(1600,Math.max(250,distance*.7));sun.position.set(target.x-1800,2600,target.z+1200);sun.target.position.set(target.x,0,target.z);sun.shadow.camera.left=-radius;sun.shadow.camera.right=radius;sun.shadow.camera.top=radius;sun.shadow.camera.bottom=-radius;sun.shadow.camera.near=500;sun.shadow.camera.far=6000;sun.shadow.camera.updateProjectionMatrix();sun.castShadow=distance<6000;
 }};
}

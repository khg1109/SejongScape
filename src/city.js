import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {project,buildingHeight,stitchRings,contains} from './map.js';
import {roadWidth} from './mobility-model.js';
import {createBuildingDetails} from './building-detail.js';
import {createSidewalkRenderer,isMappedSidewalk} from './sidewalk.js';
import {roadSurface} from './2026-11-04-road-surface.js';

export function nearestTiles(index,x,z,radius=3800){
  return index.filter(t=>Math.hypot(t.x-x,t.z-z)<radius).sort((a,b)=>Math.hypot(a.x-x,a.z-z)-Math.hypot(b.x-x,b.z-z));
}

export async function createCity(scene,onLocal,baseIds=new Set(),roadMaterial){
  const response=await fetch('/data/city.json');if(!response.ok)throw Error('도시 지도 불러오기 실패');
  const index=await response.json(),root=new THREE.Group();scene.add(root);
  const buildingDetails=createBuildingDetails();
  const sidewalks=createSidewalkRenderer();
  const mats={building:new THREE.MeshStandardMaterial({color:0xb8beb8,roughness:.85}),road:roadMaterial??new THREE.MeshStandardMaterial({color:0x596873,roughness:.95}),water:new THREE.MeshStandardMaterial({color:0x3d8994,roughness:.3}),green:new THREE.MeshStandardMaterial({color:0x708667}),field:new THREE.MeshStandardMaterial({color:0x999a71})};
  const loaded=new Map(),pending=new Set(),cache=new Map();let requested=[],lastKey='',night=true,revision=0,busy=false;
  const overviewIds=new Set(index.overview.map(e=>`${e.type}/${e.id}`));
  const pos=p=>project(p,index.center);
  function shape(points){return new THREE.Shape(points.map(p=>new THREE.Vector2(p[0],-p[1])));}
  function build(elements,coarse=false){
    // The base scene owns these features, including its more detailed road surface.
    elements=elements.filter(e=>!baseIds.has(`${e.type}/${e.id}`));
    const group=new THREE.Group(),detailed=[],buckets={building:[],road:[],path:[],water:[],green:[],field:[]};
    mats.path??=new THREE.MeshStandardMaterial({color:0xcbbca3,roughness:1});
    function polygon(points,kind,height=.05,holes=[]){
      if(points.length<4)return;const s=shape(points);s.holes=holes.map(h=>new THREE.Path(h.map(p=>new THREE.Vector2(p[0],-p[1]))));
      const g=kind==='building'?new THREE.ExtrudeGeometry(s,{depth:height,bevelEnabled:false}):new THREE.ShapeGeometry(s);
      g.rotateX(-Math.PI/2);if(kind!=='building')g.translate(0,height,0);
      const flat=g.index?g.toNonIndexed():g;flat.deleteAttribute('uv');buckets[kind].push(flat);if(flat!==g)g.dispose();
    }
    for(const e of elements){const t=e.tags||{};if(!coarse&&overviewIds.has(`${e.type}/${e.id}`))continue;
      if(t.natural==='water'&&e.members){const outer=stitchRings(e.members,'outer').map(r=>r.map(pos)),inner=stitchRings(e.members,'inner').map(r=>r.map(pos));outer.forEach(r=>polygon(r,'water',.1,inner.filter(h=>contains(h[0],r))));continue;}
      const pts=e.geometry?.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)).map(pos);if(!pts||pts.length<2)continue;
      if(t.building&&!coarse)detailed.push({item:e,points:pts});
      else if(t.natural==='water')polygon(pts,'water',.1);
      else if(['farmland','farmyard','orchard','forest','grass','meadow','recreation_ground'].includes(t.landuse)||['park','garden','pitch'].includes(t.leisure))polygon(pts,['farmland','farmyard','orchard'].includes(t.landuse)?'field':'green',.03);
      else if(t.highway&&t.tunnel!=='yes'&&!['proposed','construction'].includes(t.highway)){
        if(isMappedSidewalk(e))continue;
        const y=t.bridge&&t.bridge!=='no'?1.2:.2;
        const g=roadSurface(pts,roadWidth(t),y,{caps:true});
        if(g){(['footway','path','pedestrian','steps','cycleway'].includes(t.highway)?buckets.path:buckets.road).push(g);}
      }
    }
    for(const [kind,gs]of Object.entries(buckets)){if(!gs.length)continue;const merged=mergeGeometries(gs);gs.forEach(g=>g.dispose());if(!merged)continue;const mesh=new THREE.Mesh(merged,mats[kind]);mesh.receiveShadow=true;mesh.castShadow=kind==='building';group.add(mesh);}
    if(detailed.length)group.add(buildingDetails.build(detailed));
    if(!coarse)group.add(sidewalks.build({center:index.center,elements}));
    return group;
  }
  const coarse=build(index.overview,true);root.add(coarse);
  const dots=[];for(let i=0;i<(index.buildingPoints||[]).length;i+=2)dots.push(index.buildingPoints[i],2,index.buildingPoints[i+1]);
  const dotsGeo=new THREE.BufferGeometry();dotsGeo.setAttribute('position',new THREE.Float32BufferAttribute(dots,3));
  root.add(new THREE.Points(dotsGeo,new THREE.PointsMaterial({color:0xc4cbc0,size:16,sizeAttenuation:true})));
  const lineMat=new THREE.LineBasicMaterial({color:0xb8dca4,transparent:true,opacity:.7});
  for(const ring of stitchRings(index.boundary.members||[],'outer')){const g=new THREE.BufferGeometry().setFromPoints(ring.map(p=>{const[x,z]=pos(p);return new THREE.Vector3(x,3,z);}));root.add(new THREE.Line(g,lineMat));}
  const state=document.createElement('div');state.id='region-status';state.setAttribute('role','status');document.querySelector('#app').append(state);
  function dispose(group){group.traverse(o=>o.geometry?.dispose());root.remove(group);}
  async function refresh(x,z){
    busy=true;state.textContent='주변 지역의 건물과 길을 불러오는 중…';
    const current=++revision;let failed=false;
    requested=nearestTiles(index.tiles,x,z);const wanted=new Set(requested.map(t=>t.key));
    for(const[key,g]of loaded)if(!wanted.has(key)){dispose(g);loaded.delete(key);}
    for(const tile of requested){
      if(loaded.has(tile.key)||pending.has(tile.key))continue;pending.add(tile.key);
      try{
        let data=cache.get(tile.key);if(!data){const r=await fetch(tile.file);if(!r.ok)throw Error(`지도 ${r.status}`);data=await r.json();cache.set(tile.key,data);if(cache.size>24)cache.delete(cache.keys().next().value);}
        if(!requested.some(t=>t.key===tile.key))continue;
        const group=build(data.elements);root.add(group);loaded.set(tile.key,group);
      }catch(error){console.error(error);failed=true;}
      finally{pending.delete(tile.key);}
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    if(current!==revision){busy=false;return;}
    const local=requested.filter(t=>loaded.has(t.key)&&cache.has(t.key)).flatMap(t=>cache.get(t.key).elements);
    onLocal(local,x,z);
    state.textContent=failed?'일부 지역 지도 불러오기 실패 · 지역을 다시 선택해 주세요.':`세종시 전체 지도 · 주변 ${loaded.size}개 구역 표시`;
    busy=false;
  }
  return {index,update(x,z){const key=`${Math.floor(x/1000)}_${Math.floor(z/1000)}`;if(!busy&&key!==lastKey){lastKey=key;refresh(x,z).catch(error=>{busy=false;console.error(error);state.textContent='지역 표시 중 오류가 발생했습니다. 새로고침해 주세요.';});}},setNight(value){night=value;buildingDetails.setNight(value);mats.building.color.set(night?0x7d9292:0xc7c8bd);},};
}

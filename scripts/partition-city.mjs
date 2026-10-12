import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {project} from '../src/map.js';
const raw=JSON.parse(await readFile('scripts/.cache/city-source.json','utf8'));
const core=JSON.parse(await readFile('public/data/sejong.json','utf8'));
const center=core.center,size=2000,tiles=new Map(),overview=[],buildingPoints=[];
const coreIds=new Set(core.elements.map(e=>`${e.type}/${e.id}`));
const boundary=raw.elements.find(e=>e.tags?.boundary==='administrative'&&e.tags.name==='세종특별자치시');
const bounds=boundary.bounds;
if(!bounds)throw Error('Boundary bounds missing');
let buildings=0,roads=0;
for(const e of raw.elements){
  if(e===boundary)continue;
  if(e.tags?.building)buildings++;
  if(e.tags?.highway&&e.geometry)roads++;
  const geometry=e.geometry||e.members?.flatMap(m=>m.geometry||[])||(Number.isFinite(e.lat)?[e]:[]);
  if(!geometry.length)continue;
  const points=geometry.filter(p=>Number.isFinite(p.lat));if(!points.length)continue;
  const mid=points.reduce((p,v)=>({lat:p.lat+v.lat/points.length,lon:p.lon+v.lon/points.length}),{lat:0,lon:0});
  const [x,z]=project(mid,center),key=`${Math.floor(x/size)}_${Math.floor(z/size)}`;
  if(e.tags?.building)buildingPoints.push(Math.round(x),Math.round(z));
  if(!coreIds.has(`${e.type}/${e.id}`)){
    if(!tiles.has(key))tiles.set(key,[]);tiles.get(key).push(e);
  }
  if(e.tags?.natural==='water'||['forest','farmland','meadow'].includes(e.tags?.landuse)||['motorway','trunk','primary','secondary'].includes(e.tags?.highway))overview.push(e);
}
await mkdir('public/data/tiles',{recursive:true});
const index=[];
for(const [key,elements]of tiles){
  const [x,z]=key.split('_').map(Number);const file=`/data/tiles/${key}.json`;
  await writeFile(`public${file}`,JSON.stringify({center,elements}));
  index.push({key,x:(x+.5)*size,z:(z+.5)*size,file,count:elements.length});
}
await writeFile('public/data/city.json',JSON.stringify({center,bounds,boundary,overview,buildingPoints,tiles:index,size,buildings,roads,fetchedAt:new Date().toISOString(),source:'OpenStreetMap / Overpass API',license:'ODbL-1.0'}));
console.log(JSON.stringify({bounds,tiles:index.length,buildings,roads,features:raw.elements.length}));

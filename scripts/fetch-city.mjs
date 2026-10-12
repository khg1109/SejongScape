import { mkdir, writeFile } from 'node:fs/promises';
const query='[out:json][timeout:240];rel["boundary"="administrative"]["name"="세종특별자치시"];out body geom;map_to_area->.city;(way[building](area.city);way[highway](area.city);way[natural=water](area.city);relation[natural=water](area.city);way[landuse](area.city);way[leisure~"^(park|garden|pitch)$"](area.city);node[place](area.city);node[highway=bus_stop](area.city););out body geom;';
const response=await fetch('https://overpass-api.de/api/interpreter',{headers:{'User-Agent':'SejongScape-local-prototype/0.2'},method:'POST',body:new URLSearchParams({data:query}),signal:AbortSignal.timeout(300000)});
if(!response.ok)throw Error(`Overpass ${response.status}: ${(await response.text()).slice(0,2000)}`);
const data=await response.json();if(data.remark)throw Error(data.remark);
if(!data.elements.some(e=>e.tags?.name==='세종특별자치시'&&e.tags?.boundary))throw Error('City boundary missing');
await mkdir('scripts/.cache',{recursive:true});
await writeFile('scripts/.cache/city-source.json',JSON.stringify(data));
console.log('City features:',data.elements.length);


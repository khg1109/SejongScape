import {writeFile} from 'node:fs/promises';
const query='[out:json][timeout:90];area["boundary"="administrative"]["name"="세종특별자치시"]->.city;node[highway~"^(traffic_signals|crossing)$"](area.city);out body;';
const r=await fetch('https://overpass-api.de/api/interpreter',{headers:{'User-Agent':'SejongScape-local-prototype/0.3'},method:'POST',body:new URLSearchParams({data:query}),signal:AbortSignal.timeout(120000)});
if(!r.ok)throw Error(`Overpass ${r.status}`);const d=await r.json();if(d.remark||!d.elements?.length)throw Error(d.remark||'No traffic features');
await writeFile('public/data/traffic.json',JSON.stringify({...d,fetchedAt:new Date().toISOString(),source:'OpenStreetMap / Overpass API',license:'ODbL-1.0'}));console.log('Mapped traffic points',d.elements.length);

// Compare every exported input with the established CSV viewer's endpoint assignment.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {TripDispersal} from '../src/2026-10-16-trip-dispersal.js';
const source=new URL('../public/data/2026-10-16-trips/',import.meta.url);
const network=JSON.parse(fs.readFileSync(new URL('../public/data/2026-10-16-dispersal/2026-10-16-network.json',import.meta.url)));
const chunks=fs.readdirSync(source).filter(n=>n.includes('-hour-')).sort().map(n=>{const b=fs.readFileSync(new URL(n,source));return {view:new DataView(b.buffer,b.byteOffset,b.byteLength)};});
let maxPerson=0,total=0;
for(const {view:v} of chunks)for(let p=0;p<v.byteLength;p+=20){maxPerson=Math.max(maxPerson,v.getUint32(p,true));total++;}
const d=new TripDispersal(network,{length:network.endpoints.length*network.vertices.length});
d.assign({chunks,manifest:{maxPerson}});
const rows=[];
for(const {view:v} of chunks)for(let p=0;p<v.byteLength;p+=20){const pair=d.pair({id:v.getUint32(p,true),seq:v.getUint8(p+4)});if(pair)rows.push([v.getUint16(p+12,true)*60,v.getUint16(p+14,true)*60,...pair,v.getUint8(p+16),v.getUint8(p+10),v.getUint8(p+11),v.getUint8(p+17)]);}
rows.sort((a,b)=>{for(const k of [0,2,3,1,4,5,6,7])if(a[k]!==b[k])return a[k]-b[k];return 0;});
const raw=fs.readFileSync(new URL('../public/data/2026-11-04-full-sumo/2026-11-04-trips.bin',import.meta.url));
assert.equal(total,1111343);assert.equal(rows.length,876907);assert.equal(raw.length,rows.length*16);
for(let i=0;i<rows.length;i++){const p=i*16;assert.deepEqual(rows[i],[raw.readUInt32LE(p),raw.readUInt32LE(p+4),raw.readUInt16LE(p+8),raw.readUInt16LE(p+10),...raw.subarray(p+12,p+16)]);}
console.log(`PASS: all ${rows.length} assigned trips match the CSV viewer; ${total-rows.length} unlocatable records are accounted for.`);

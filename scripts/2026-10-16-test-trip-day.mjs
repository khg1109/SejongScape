import fs from 'node:fs';
import assert from 'node:assert/strict';
import {TripDay,dayClock} from '../src/2026-10-16-trip-day-model.js';
const root=new URL('../public/',import.meta.url),load=url=>fs.readFileSync(new URL(url.replace(/^\//,''),root));
const m=JSON.parse(load('/data/2026-10-16-trips/2026-10-16-manifest.json')),c=JSON.parse(load('/data/2026-10-16-trip-city.json')),day=new TripDay(m);
for(const [k,f] of Object.entries(m.files))if(k.startsWith('hour-')){const b=load(f.url);day.add(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),f.records);}
assert.equal(day.count,m.total);
const peakMinute=c.activeByMinute.indexOf(c.peakActive),times=[0,369,370,420,448,480,720,peakMinute,1080,1439,1440];
for(const minute of times){const rows=day.active(minute,{modes:m.modes});assert.equal(rows.length,c.activeByMinute[minute],`minute ${minute}`);assert.ok(rows.every(r=>r.start<=minute&&minute<r.end));}
const rows=day.active(480,{modes:m.modes});assert.ok(rows.some(r=>r.start<480),'Previous-hour departures remain visible after hour boundary');
const person=day.person(1);assert.equal(person.length,2);assert.equal(person[0].start,448);assert.equal(person[0].end,480);assert.equal(person[0].mode,2);assert.equal(person[1].mode,3);
assert.equal(day.active(448,{modes:[2],person:1}).length,1);assert.equal(day.active(480,{modes:m.modes,person:1}).length,0);assert.equal(day.active(448,{modes:[]}).length,0);
assert.equal(dayClock(448.5),'07:28:30');assert.equal(dayClock(1440),'24:00:00');assert.throws(()=>day.add(new ArrayBuffer(21),1));
console.log(JSON.stringify({result:'PASS',records:day.count,timesChecked:times,peak:c.peakActive,peakMinute,person1:person.map(r=>({seq:r.seq,start:r.start,end:r.end,mode:r.mode}))},null,2));

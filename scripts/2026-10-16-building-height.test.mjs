import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildingHeight,buildingLevels,project} from '../src/map.js';
import {detailGeometry} from '../src/building-detail.js';
const data=JSON.parse(fs.readFileSync(new URL('../public/data/tiles/2_0.json',import.meta.url)));
const affected=data.elements.find(e=>e.id===1237746323);
test('Real 902동 record cannot be interpreted as 902 floors',()=>{
 assert.equal(affected.tags['building:levels'],'902동');
 assert.equal(buildingLevels(affected.tags),null);
 assert.deepEqual(buildingHeight(affected.tags),{value:64,estimated:true});
 const g=detailGeometry(affected,affected.geometry.map(p=>project(p,[36.499,127.3175])));
 assert.equal(g.height,64);assert.equal(g.levels,20);
 for(const part of [g.walls,g.roof,...g.details,...g.windows]){
  part.computeBoundingBox();assert.ok(part.boundingBox.max.y<66);assert.ok([...part.attributes.position.array].every(Number.isFinite));part.dispose();
 }
});
test('Whole numeric floor values retained; identifiers, lists and nonfinite values rejected',()=>{
 for(const raw of ['49',' 15 ','2.5',3])assert.equal(buildingLevels({'building:levels':raw}),Number(raw));
 for(const raw of ['902동','15층','2;3','Infinity','NaN','','-1','0',Infinity,null,[],true])assert.equal(buildingLevels({'building:levels':raw}),null,String(raw));
 assert.deepEqual(buildingHeight({height:'48','building:levels':'902동'}),{value:48,estimated:false});
 assert.equal(buildingHeight({height:'Infinity',building:'house'}).value,6.4);
 assert.equal(buildingHeight({'building:levels':'49'}).value,156.8);
});
test('Audit every current map building: valid values preserved, bad floor tags reported',()=>{
 const index=JSON.parse(fs.readFileSync(new URL('../public/data/city.json',import.meta.url)));
 const files=['/data/sejong.json',...index.tiles.map(t=>t.file)];const seen=new Set(),changed=[];let max=0;
 for(const f of files)for(const e of JSON.parse(fs.readFileSync(new URL('../public'+f,import.meta.url))).elements){
  if(!e.tags?.building||seen.has(e.id))continue;seen.add(e.id);
  const t=e.tags,h=buildingHeight(t),oldExplicit=parseFloat(t.height),oldFloors=parseFloat(t['building:levels']);
  assert.ok(Number.isFinite(h.value)&&h.value>0);
  if(Number.isFinite(oldExplicit)&&oldExplicit>0)assert.equal(h.value,oldExplicit);
  else if(buildingLevels(t))assert.equal(h.value,oldFloors*3.2);
  else if(oldFloors>0)changed.push(e.id);
  max=Math.max(max,h.value);
 }
 assert.deepEqual(changed,[1237746323]);
 console.log(JSON.stringify({buildings:seen.size,correctedIds:changed,maxHeight:max}));
});

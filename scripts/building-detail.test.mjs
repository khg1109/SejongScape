import test from 'node:test';
import assert from 'node:assert/strict';
import {detailGeometry,buildingStyle} from '../src/building-detail.js';
const ring=[[0,0],[30,0],[30,16],[0,16],[0,0]];
test('Facade uses recorded floor count and height with finite metre-scale geometry',()=>{
  const r=detailGeometry({id:1,tags:{building:'apartments',height:'48','building:levels':'15'}},ring);
  assert.equal(r.height,48);assert.equal(r.levels,15);
  for(const g of [r.walls,r.roof,...r.details]){assert.ok([...g.attributes.position.array].every(Number.isFinite));g.dispose();}
});
test('Building use distinguishes housing, shops and industrial sheds',()=>{
  assert.equal(buildingStyle({building:'house'}),'house');
  assert.equal(buildingStyle({building:'warehouse'}),'industrial');
  assert.equal(buildingStyle({building:'yes',shop:'convenience'}),'retail');
  assert.equal(detailGeometry({tags:{building:'house'}},ring).height,6.4);
});
test('Open footprints close the final wall and preserve mapped outline',()=>{
  const r=detailGeometry({id:2,tags:{building:'office'}},ring.slice(0,-1));
  assert.equal(r.walls.attributes.position.count,24);
  r.walls.computeBoundingBox();assert.equal(r.walls.boundingBox.max.x,30);assert.equal(r.walls.boundingBox.max.z,16);
});

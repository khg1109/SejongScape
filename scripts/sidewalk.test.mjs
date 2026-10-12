import test from 'node:test';
import assert from 'node:assert/strict';
import {isMappedSidewalk,sidewalkSegments} from '../src/sidewalk.js';
test('Road-only sidewalk tags and crossing paths do not fabricate sidewalk coordinates',()=>{
 assert.equal(isMappedSidewalk({tags:{highway:'primary',sidewalk:'both'}}),false);
 assert.equal(isMappedSidewalk({tags:{highway:'footway',footway:'crossing'}}),false);
 assert.equal(isMappedSidewalk({tags:{highway:'footway',footway:'sidewalk'}}),true);
});
test('Mapped sidewalk position and stated width are retained',()=>{
 const item={tags:{highway:'footway',footway:'sidewalk',width:'3.5'},geometry:[{lat:36,lon:127},{lat:36,lon:127.001}]};
 const [s]=sidewalkSegments(item,[36,127]);assert.deepEqual(s.a,[0,-0]);assert.equal(s.width,3.5);assert.equal(s.estimated,false);assert.ok(s.length>80);
 delete item.tags.width;assert.equal(sidewalkSegments(item,[36,127])[0].estimated,true);
});

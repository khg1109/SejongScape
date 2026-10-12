import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectScenario} from '../src/sumo-scenario.js';

test('assignment reports all five dependencies, 25h duration and non-observed meso caveats',()=>{
 const r=inspectScenario({'net-file':'sejong_koti.net.xml','route-files':'sejong_od.rou.xml,sejong_persons.rou.xml','additional-files':'sejong_koti.poly.xml,sejong.taz.xml',begin:'0',end:'90000','step-length':'1',mesosim:'true','ignore-route-errors':'true','time-to-teleport':'300','pedestrian.model':'striping'},['sejong_od.rou.xml']);
 assert.equal(r.files.length,5);assert.equal(r.missing.length,4);assert.equal(r.duration,90000);assert.equal(r.meso,true);assert.equal(r.warnings.length,4);
});
test('a basename does not falsely satisfy a dependency in another directory',()=>{
 const r=inspectScenario({'net-file':'network/net.xml','route-files':'routes.xml',end:'600'},['net.xml','routes.xml']);
 assert.equal(r.missing.length,1);assert.equal(r.missing[0].path,'network/net.xml');
});
test('invalid timing and absent input settings remain visible',()=>{
 const r=inspectScenario({begin:'nan',end:'0','step-length':'-1','time-to-teleport':'-1'});
 assert.equal(r.duration,null);assert.equal(r.warnings.length,4);
});
test('complete file selection is only a presence check and micro has no meso warning',()=>{
 const r=inspectScenario({'net-file':'net.xml','route-files':'a.xml, b.xml',begin:'10',end:'610','time-to-teleport':'-1'},['net.xml','a.xml','b.xml']);
 assert.equal(r.missing.length,0);assert.equal(r.duration,600);assert.equal(r.meso,false);assert.equal(r.warnings.length,0);
});

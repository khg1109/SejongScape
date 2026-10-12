import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {nearestTiles} from '../src/city.js';
import {project} from '../src/map.js';
const index=JSON.parse(await readFile('public/data/city.json','utf8'));
test('City index covers northern, southern, western and eastern Sejong',()=>{
  assert.ok(index.bounds.minlat<36.41&&index.bounds.maxlat>36.73);
  assert.ok(index.bounds.minlon<127.13&&index.bounds.maxlon>127.41);
  assert.ok(index.buildings>26000&&index.roads>23000);
});
test('All city tiles exist and contain finite geographic data',async()=>{
  for(const tile of index.tiles){const data=JSON.parse(await readFile(`public${tile.file}`,'utf8'));assert.ok(data.elements.length);assert.deepEqual(data.center,index.center);}
});
test('Both Jochiwon and Sojeong have buildings in nearby streamed tiles',async()=>{
  for(const point of [{lat:36.601,lon:127.298},{lat:36.722,lon:127.158}]){
    const [x,z]=project(point,index.center),tiles=nearestTiles(index.tiles,x,z);assert.ok(tiles.length>0&&tiles.length<20);
    let count=0;for(const t of tiles){const d=JSON.parse(await readFile(`public${t.file}`,'utf8'));count+=d.elements.filter(e=>e.tags?.building).length;}
    assert.ok(count>30);
  }
});

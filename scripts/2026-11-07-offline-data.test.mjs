import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {mkdtemp, mkdir, writeFile, readFile, access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {decodeBundle,restoreOfflineData} from './2026-11-07-offline-data.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
function bundle(files) {
 const packed=gzipSync(JSON.stringify({files:files.map(([path,text])=>({path,base64:Buffer.from(text).toString('base64')}))}));
 return {packed,manifest:{sha256:hash(packed),files:files.map(([path,text])=>({path,size:Buffer.byteLength(text),sha256:hash(text)})),parts:[{file:'2026-11-07-part-000.bin',size:packed.length,sha256:hash(packed)}]}};
}
test('bundle verifies both compressed archive and each decoded file',()=>{
 const b=bundle([['2026-10-16-trip-city.json','{}']]);
 assert.equal(decodeBundle(b.packed,b.manifest)[0].bytes.toString(),'{}');
 assert.throws(()=>decodeBundle(Buffer.from('changed'),b.manifest));
 b.manifest.files[0].sha256='bad';assert.throws(()=>decodeBundle(b.packed,b.manifest));
});
test('bundle rejects traversal, unexpected private files and duplicates',()=>{
 for(const name of ['../secret.json','2026-10-16-trips/../../secret.json','secret.json']){
  const b=bundle([[name,'{}']]);assert.throws(()=>decodeBundle(b.packed,b.manifest));
 }
 const b=bundle([['2026-10-16-trip-city.json','{}'],['2026-10-16-trip-city.json','{}']]);
 assert.throws(()=>decodeBundle(b.packed,b.manifest));
});
async function fixture(b){
 const base=resolve('scripts/.cache');await mkdir(base,{recursive:true});
 const root=await mkdtemp(resolve(base,'2026-11-07-offline-test-'));
 const dir=resolve(root,'public/data/2026-11-07-offline');await mkdir(dir,{recursive:true});
 await writeFile(resolve(dir,'2026-11-07-manifest.json'),JSON.stringify(b.manifest));
 await writeFile(resolve(dir,'2026-11-07-part-000.bin'),b.packed);return root;
}
test('restoration works without network and is idempotent',async()=>{
 const b=bundle([['2026-10-16-trip-city.json','{}']]),root=await fixture(b);
 const original=globalThis.fetch;globalThis.fetch=()=>{throw Error('Network forbidden');};
 try {
  assert.deepEqual(await restoreOfflineData(root),{files:1,restored:1});
  assert.deepEqual(await restoreOfflineData(root),{files:1,restored:0});
  assert.equal(await readFile(resolve(root,'public/data/2026-10-16-trip-city.json'),'utf8'),'{}');
 } finally {globalThis.fetch=original;}
});
test('conflicting local data prevents all writes and is preserved',async()=>{
 const b=bundle([['2026-11-07-aggregate-demand.json','[]'],['2026-10-16-trip-city.json','{}']]),root=await fixture(b);
 const path=resolve(root,'public/data/2026-10-16-trip-city.json');await writeFile(path,'original');
 await assert.rejects(restoreOfflineData(root),/기존 자료/);
 assert.equal(await readFile(path,'utf8'),'original');
 await assert.rejects(access(resolve(root,'public/data/2026-11-07-aggregate-demand.json')));
});

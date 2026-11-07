import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash,createCipheriv,randomBytes} from 'node:crypto';
import {brotliCompressSync} from 'node:zlib';
import {restoreActualData,validDataPath} from './2026-11-07-actual-data.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
async function fixture(path='2026-10-16-trips/2026-10-16-hour-07.bin'){
 const parent=resolve('scripts/.cache');await mkdir(parent,{recursive:true});
 const root=await mkdtemp(resolve(parent,'2026-11-07-actual-test-'));
 const folder=resolve(root,'public/data/2026-11-07-aws-encrypted');await mkdir(folder,{recursive:true});
 const key=randomBytes(32),id=randomBytes(16).toString('hex'),iv=randomBytes(12),bytes=Buffer.from('original binary fixture\0\xff','latin1');
 const entry={path,size:bytes.length,sha256:hash(bytes)},header=Buffer.from(JSON.stringify(entry)),size=Buffer.alloc(4);size.writeUInt32LE(header.length);
 const plain=brotliCompressSync(Buffer.concat([Buffer.from('SEJONG-AWS-1\n'),size,header,bytes,Buffer.alloc(4)]));
 const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(id+':0'));
 const encrypted=Buffer.concat([cipher.update(plain),cipher.final()]),file='2026-11-07-part-000.bin';
 const manifest={version:1,format:'sejong-aws-brotli-aes256gcm-v1',id,fileCount:1,unpackedBytes:bytes.length,
 parts:[{file,size:encrypted.length,sha256:hash(encrypted),iv:iv.toString('hex'),tag:cipher.getAuthTag().toString('hex')}]};
 await writeFile(resolve(folder,file),encrypted);await writeFile(resolve(folder,'2026-11-07-manifest.json'),JSON.stringify(manifest));
 return {root,folder,key,manifest,bytes,path};
}
test('encrypted snapshot restores exact bytes without network and reuses a verified cache without a key',async()=>{
 const f=await fixture(),old=globalThis.fetch;globalThis.fetch=()=>{throw Error('Network forbidden');};
 try{
  const result=await restoreActualData({projectRoot:f.root,keyLoader:async()=>f.key.toString('hex')});
  assert.equal(result.restored,true);assert.deepEqual(await readFile(resolve(result.root,f.path)),f.bytes);
  const cached=await restoreActualData({projectRoot:f.root,keyLoader:async()=>{throw Error('Must not request key');}});
  assert.equal(cached.restored,false);
 }finally{globalThis.fetch=old;}
});
test('wrong key cannot publish a restored directory or leave unauthenticated plaintext',async()=>{
 const f=await fixture();await assert.rejects(restoreActualData({projectRoot:f.root,keyLoader:async()=>randomBytes(32).toString('hex')}),/인증/);
 assert.deepEqual(await readdir(resolve(f.root,'scripts/.cache/2026-11-07-actual-data')),[]);
});
test('ciphertext modification fails even when the attacker changes its public checksum',async()=>{
 const f=await fixture(),file=resolve(f.folder,f.manifest.parts[0].file),bytes=await readFile(file);bytes[0]^=1;
 await writeFile(file,bytes);f.manifest.parts[0].sha256=hash(bytes);
 await writeFile(resolve(f.folder,'2026-11-07-manifest.json'),JSON.stringify(f.manifest));
 await assert.rejects(restoreActualData({projectRoot:f.root,keyLoader:async()=>f.key.toString('hex')}),/인증/);
});
test('authenticated archive paths cannot escape the new staging directory',async()=>{
 for(const path of ['../private.txt','a/../../private.txt','/absolute/file','a/.hidden','a\\secret'])assert.equal(validDataPath(path),false);
 const f=await fixture('../private.txt');await assert.rejects(restoreActualData({projectRoot:f.root,keyLoader:async()=>f.key.toString('hex')}),/허용되지/);
});
test('modified existing cache is detected and never overwritten',async()=>{
 const f=await fixture();const result=await restoreActualData({projectRoot:f.root,keyLoader:async()=>f.key.toString('hex')});
 const file=resolve(result.root,f.path);await writeFile(file,'user changes');
 await assert.rejects(restoreActualData({projectRoot:f.root,keyLoader:async()=>f.key.toString('hex')}),/검증/);
 assert.equal(await readFile(file,'utf8'),'user changes');
});

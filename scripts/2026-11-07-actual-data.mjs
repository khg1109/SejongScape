import {createReadStream} from 'node:fs';
import {readFile,writeFile,mkdir,open,rename,rm} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,createDecipheriv,randomBytes} from 'node:crypto';
import {createBrotliDecompress} from 'node:zlib';
import {Readable} from 'node:stream';

export const actualProjectRoot=fileURLToPath(new URL('../',import.meta.url));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const magic=Buffer.from('SEJONG-AWS-1\n');
export function validDataPath(path){
 return typeof path==='string' && path.length<300 && /^[a-zA-Z0-9_.\/-]+$/.test(path)
  && path.split('/').every(part=>part && !part.startsWith('.'));
}
async function fileDigest(path){const hash=createHash('sha256');for await(const bytes of createReadStream(path))hash.update(bytes);return hash.digest('hex');}
async function verifyFiles(root,files){
 let next=0;
 await Promise.all(Array.from({length:4},async()=>{
  while(next<files.length){const file=files[next++];
   if(!validDataPath(file.path)||await fileDigest(resolve(root,file.path))!==file.sha256)throw Error('복원 자료 검증에 실패했습니다. 기존 파일을 덮어쓰지 않습니다. 새 폴더에서 다시 복원하세요.');
  }
 }));
}
export async function promptDataKey(){
 if(process.env.SEJONGSCAPE_DATA_KEY_FILE){
  const path=process.env.SEJONGSCAPE_DATA_KEY_FILE;delete process.env.SEJONGSCAPE_DATA_KEY_FILE;
  return (await readFile(path,'utf8')).trim();
 }
 if(!process.stdin.isTTY||!process.stdout.isTTY)throw Error('복원 키가 필요합니다. 터미널에서 npm run dev를 실행하거나 SEJONGSCAPE_DATA_KEY_FILE에 별도 키 파일 경로를 지정하세요.');
 process.stdout.write('실제 데이터 복원 키 (별도 전달된 64자리, 입력 숨김): ');
 const wasRaw=process.stdin.isRaw;process.stdin.setRawMode(true);process.stdin.resume();
 return new Promise((resolveKey,reject)=>{
  let value='';
  const finish=error=>{process.stdin.off('data',receive);process.stdin.setRawMode(Boolean(wasRaw));process.stdin.pause();process.stdout.write('\n');error?reject(error):resolveKey(value.trim());};
  const receive=chunk=>{for(const c of chunk.toString()){
   if(c==='\u0003')return finish(Error('복원을 취소했습니다.'));
   if(c==='\r'||c==='\n')return finish();
   if(c==='\u007f'||c==='\b')value=value.slice(0,-1);else if(c>=' '&&value.length<128)value+=c;
  }};
  process.stdin.on('data',receive);
 });
}
class Reader {
 constructor(stream){this.iterator=stream[Symbol.asyncIterator]();this.buffer=Buffer.alloc(0);}
 async read(size,allowEnd=false){
  while(this.buffer.length<size){const next=await this.iterator.next();if(next.done){if(allowEnd&&!this.buffer.length)return null;throw Error('복원 데이터가 중간에 끝났습니다.');}this.buffer=Buffer.concat([this.buffer,next.value]);}
  const value=this.buffer.subarray(0,size);this.buffer=this.buffer.subarray(size);return value;
 }
}
export async function restoreActualData({projectRoot=actualProjectRoot,keyLoader=promptDataKey}={}){
 const bundle=resolve(projectRoot,'public/data/2026-11-07-aws-encrypted');
 const rawManifest=await readFile(resolve(bundle,'2026-11-07-manifest.json'));
 const manifest=JSON.parse(rawManifest),manifestHash=digest(rawManifest);
 if(manifest.format!=='sejong-aws-brotli-aes256gcm-v1'||!/^[a-f0-9]{32}$/.test(manifest.id)||!Array.isArray(manifest.parts)||manifest.parts.length>10000)throw Error('지원하지 않는 실제 데이터 묶음입니다.');
 const cacheRoot=resolve(projectRoot,'scripts/.cache/2026-11-07-actual-data'),target=resolve(cacheRoot,manifest.id);
 let marker;
 try{marker=JSON.parse(await readFile(resolve(target,'complete.json'),'utf8'));}
 catch(error){if(error.code!=='ENOENT')throw error;}
 if(marker){
  if(marker.manifestHash!==manifestHash||marker.files.length!==manifest.fileCount)throw Error('기존 복원 자료의 버전이 다릅니다. 새 폴더에서 실행하세요.');
  await verifyFiles(resolve(target,'data'),marker.files);
  return {root:resolve(target,'data'),files:marker.files,restored:false};
 }
 let text=await keyLoader();
 if(!/^[a-fA-F0-9]{64}$/.test(text))throw Error('복원 키는 별도로 전달된 64자리 16진수입니다.');
 const key=Buffer.from(text,'hex');text='';
 await mkdir(cacheRoot,{recursive:true,mode:0o700});
 const stage=resolve(cacheRoot,manifest.id+'-loading-'+randomBytes(8).toString('hex'));
 await mkdir(resolve(stage,'data'),{recursive:true,mode:0o700});
 const files=[],names=new Set();let total=0;
 async function* decrypted(){
  for(let index=0;index<manifest.parts.length;index++){
   const part=manifest.parts[index];
   if(!/^2026-11-07-part-\d{3,5}\.bin$/.test(part.file)||!Number.isSafeInteger(part.size)||part.size>32*1024*1024||!/^[a-f0-9]{24}$/.test(part.iv)||!/^[a-f0-9]{32}$/.test(part.tag))throw Error('잘못된 암호화 데이터 조각입니다.');
   const bytes=await readFile(resolve(bundle,part.file));
   if(bytes.length!==part.size||digest(bytes)!==part.sha256)throw Error('다운로드한 암호화 파일이 불완전합니다. GitHub 파일을 다시 받으세요.');
   const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(part.iv,'hex'));decipher.setAAD(Buffer.from(manifest.id+':'+index));decipher.setAuthTag(Buffer.from(part.tag,'hex'));
   let plain;
   try{plain=Buffer.concat([decipher.update(bytes),decipher.final()]);}catch{throw Error('복원 키가 맞지 않거나 암호화 파일 인증에 실패했습니다.');}
   yield plain;
  }
 }
 const input=Readable.from(decrypted()),decompressor=createBrotliDecompress();
 input.on('error',error=>decompressor.destroy(error));input.pipe(decompressor);
 try{
  const reader=new Reader(decompressor);
  if(!(await reader.read(magic.length)).equals(magic))throw Error('올바른 실제 데이터 형식이 아닙니다.');
  while(true){
   const length=(await reader.read(4)).readUInt32LE();if(!length)break;
   if(length>16384)throw Error('잘못된 데이터 헤더입니다.');
   const entry=JSON.parse((await reader.read(length)).toString());
   if(!validDataPath(entry.path)||names.has(entry.path)||!Number.isSafeInteger(entry.size)||entry.size<0||entry.size>512*1024*1024||!/^[a-f0-9]{64}$/.test(entry.sha256))throw Error('허용되지 않는 데이터 파일입니다.');
   names.add(entry.path);
   const path=resolve(stage,'data',entry.path);if(!path.startsWith(resolve(stage,'data')+sep))throw Error('잘못된 데이터 경로입니다.');
   await mkdir(dirname(path),{recursive:true,mode:0o700});const file=await open(path,'wx',0o600),hash=createHash('sha256');
   try{let remaining=entry.size;while(remaining){const bytes=await reader.read(Math.min(remaining,1024*1024));hash.update(bytes);await file.writeFile(bytes);remaining-=bytes.length;}}finally{await file.close();}
   if(hash.digest('hex')!==entry.sha256)throw Error('AWS 원본과 복원 자료의 해시가 다릅니다.');
   files.push(entry);total+=entry.size;
  }
  if(await reader.read(1,true)!==null||files.length!==manifest.fileCount||total!==manifest.unpackedBytes)throw Error('복원 데이터 개수 또는 크기가 다릅니다.');
  await writeFile(resolve(stage,'complete.json'),JSON.stringify({manifestHash,files}),{flag:'wx',mode:0o600});
  await rename(stage,target);
  return {root:resolve(target,'data'),files,restored:true};
 }catch(error){
  input.destroy();decompressor.destroy();
  // Only this invocation's new temporary directory is removed, never existing data.
  await rm(stage,{recursive:true,force:true});throw error;
 }finally{key.fill(0);}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const index=process.argv.indexOf('--key-file');if(index>=0)process.env.SEJONGSCAPE_DATA_KEY_FILE=process.argv[index+1];
 try{const result=await restoreActualData();console.log('AWS 실제 자료 준비 완료:',result.files.length,'개 파일. 이후 AWS 연결은 필요하지 않습니다.');}
 catch(error){console.error(error.message);process.exitCode=1;}
}

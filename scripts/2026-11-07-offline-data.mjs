import {readFile, mkdir, writeFile, access} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';

const root = fileURLToPath(new URL('../', import.meta.url));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const allowed = /^(2026-10-16-trips\/2026-10-16-[\w.-]+|2026-10-16-dispersal\/2026-10-16-[\w.-]+|2026-10-16-trip-city.json|2026-11-07-aggregate-demand.json|2026-11-05-sumo-demand50\/(?:2026-11-04-(?:base|open|close)\/)?2026-11-04-[\w.-]+)$/;

export function decodeBundle(compressed, manifest) {
  if (digest(compressed) !== manifest.sha256) throw Error('공개 데이터 묶음의 SHA256 검증에 실패했습니다.');
  const payload = JSON.parse(gunzipSync(compressed, {maxOutputLength: 512*1024*1024}));
  const names = new Set();
  if (!Array.isArray(payload.files) || payload.files.length !== manifest.files.length) throw Error('공개 데이터 파일 목록이 다릅니다.');
  const expected = new Map(manifest.files.map(file => [file.path, file]));
  return payload.files.map(file => {
    if (!allowed.test(file.path) || file.path.includes('..') || names.has(file.path)) throw Error('허용되지 않는 데이터 경로입니다.');
    names.add(file.path);
    const bytes = Buffer.from(file.base64, 'base64'), entry=expected.get(file.path);
    if (!entry || bytes.length !== entry.size || digest(bytes) !== entry.sha256) throw Error('공개 데이터 파일 검증에 실패했습니다.');
    return {path:file.path, bytes};
  });
}

export async function restoreOfflineData(projectRoot=root) {
  const bundle=resolve(projectRoot,'public/data/2026-11-07-offline');
  const manifest=JSON.parse(await readFile(resolve(bundle,'2026-11-07-manifest.json'),'utf8'));
  const parts=[];
  for (const part of manifest.parts) {
    if (!/^2026-11-07-part-\d{3}\.bin$/.test(part.file)) throw Error('잘못된 공개 데이터 조각 경로입니다.');
    const bytes=await readFile(resolve(bundle,part.file));
    if (bytes.length!==part.size || digest(bytes)!==part.sha256) throw Error('공개 데이터 다운로드가 불완전합니다. GitHub 최신 파일을 다시 받으세요.');
    parts.push(bytes);
  }
  const files=decodeBundle(Buffer.concat(parts),manifest), pending=[];
  // Validate every existing file before writing anything; never replace private/local data.
  for (const file of files) {
    const path=resolve(projectRoot,'public/data',file.path);
    try {
      const prior=await readFile(path);
      if (!prior.equals(file.bytes)) throw Error('기존 자료와 공개 데이터가 다릅니다. 새 폴더에 GitHub 코드를 받거나 기존 자료는 npm run dev:local로 실행하세요.');
    } catch(error) {
      if (error.code!=='ENOENT') throw error;
      pending.push({path,bytes:file.bytes});
    }
  }
  for (const file of pending) {
    await mkdir(dirname(file.path),{recursive:true});
    await writeFile(file.path,file.bytes,{flag:'wx'});
  }
  return {files:files.length,restored:pending.length};
}

if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try { console.log('공개 로컬 데이터 준비 완료:',await restoreOfflineData()); }
  catch(error) { console.error(error.message); process.exitCode=1; }
}

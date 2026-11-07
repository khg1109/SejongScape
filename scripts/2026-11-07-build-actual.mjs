import {cp,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {build} from 'vite';
import {restoreActualData,actualProjectRoot} from './2026-11-07-actual-data.mjs';

const data=await restoreActualData();
await build({root:actualProjectRoot});
await mkdir(resolve(actualProjectRoot,'dist/client/data'),{recursive:true});
// Only the newly generated build receives these private local files.
await cp(data.root,resolve(actualProjectRoot,'dist/client/data'),{recursive:true});
await writeFile(resolve(actualProjectRoot,'dist/2026-11-07-PRIVATE-DATA.txt'),
 'This local build contains decrypted research data. Keep it private; only encrypted bundles belong in the public repository.\n');
console.log('AWS 실제 자료를 포함한 로컬 빌드 완료. dist에는 복호화된 비공개 자료가 있으므로 공개 저장소에 올리지 마세요.');

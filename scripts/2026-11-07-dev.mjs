import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {restoreActualData} from './2026-11-07-actual-data.mjs';
import {restoreOfflineData} from './2026-11-07-offline-data.mjs';
import {loginAws} from '../server/2026-11-07-aws-data.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const local = args.includes('--local');
const demo = args.includes('--demo');
const awsMode = args.includes('--aws');
async function readPassword() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw Error('터미널에서 npm run dev:aws를 실행해 사이트 비밀번호를 입력하세요. 자동 실행은 SEJONGSCAPE_AWS_PASSWORD 환경변수를 사용합니다.');
  process.stdout.write('AWS 사이트 접속 비밀번호 (화면에 표시되지 않음): ');
  const wasRaw = process.stdin.isRaw;
  process.stdin.setRawMode(true); process.stdin.resume();
  return new Promise((resolvePassword,reject) => {
    let value = '';
    const finish = (error) => {
      process.stdin.off('data', receive); process.stdin.setRawMode(Boolean(wasRaw)); process.stdin.pause();
      process.stdout.write('\n'); if(error) reject(error); else resolvePassword(value);
    };
    const receive = chunk => {
      for(const ch of chunk.toString('utf8')) {
        if(ch === '\u0003') return finish(Error('실행을 취소했습니다.'));
        if(ch === '\r' || ch === '\n') return finish();
        if(ch === '\u007f' || ch === '\b') value = value.slice(0,-1);
        else if(ch >= ' ' && value.length < 128) value += ch;
      }
    };
    process.stdin.on('data',receive);
  });
}
try {
  const version = process.versions.node.split('.').map(Number);
  if (version[0] < 22 || (version[0] === 22 && version[1] < 13)) throw Error('Node.js 22.13 이상이 필요합니다 (node:sqlite 사용).');
  if (demo) {
    const result = await restoreOfflineData(root);
    console.log('공개용 가상 통행 데이터 준비 완료:', result.files, '개 파일 (AWS 연결 없음)');
  }
  if (!awsMode && !local && !demo) {
    const data = await restoreActualData();
    process.env.SEJONGSCAPE_ACTUAL_DATA_ROOT = data.root;
  }
  if (awsMode) {
    console.log('AWS와 같은 데이터로 실행합니다. 인터넷 연결과 sejongscape.com 사이트 접속 비밀번호가 필요합니다.');
    let password = process.env.SEJONGSCAPE_AWS_PASSWORD || await readPassword();
    delete process.env.SEJONGSCAPE_AWS_PASSWORD;
    process.env.SEJONGSCAPE_AWS_SESSION = await loginAws(password); password = '';
    process.env.SEJONGSCAPE_DATA_MODE = 'aws';
    console.log('AWS 인증 완료. 데이터는 필요한 때에만 불러오며 비밀번호·데이터 파일을 저장하지 않습니다.');
  } else if (!local && !demo) {
    process.env.SEJONGSCAPE_DATA_MODE = 'actual'; delete process.env.SEJONGSCAPE_AWS_SESSION;
    console.log('AWS 운영 원본과 같은 실제 자료를 로컬에서 실행합니다. AWS 연결 없음.');
  } else {
    process.env.SEJONGSCAPE_DATA_MODE = 'local'; delete process.env.SEJONGSCAPE_AWS_SESSION;
    console.log('로컬 데이터로 실행합니다. AWS 운영 자료를 사용하려면 npm run dev:aws를 실행하세요.');
  }
  const portArg = args.indexOf('--port');
  const port = portArg >= 0 ? Number(args[portArg+1]) : 5173;
  if(!Number.isInteger(port) || port<1024 || port>65535) throw Error('올바른 로컬 포트 번호가 필요합니다.');
  const {createServer} = await import('vite');
  const server = await createServer({root,server:{host:'127.0.0.1',port,strictPort:true}});
  await server.listen(); server.printUrls();
  const close = () => { delete process.env.SEJONGSCAPE_AWS_SESSION; server.close().then(()=>process.exit(0)); };
  process.once('SIGINT',close); process.once('SIGTERM',close);
} catch (error) {
  delete process.env.SEJONGSCAPE_AWS_SESSION;
  // Vite errors never include the environment; authentication errors are sanitized above.
  console.error(error.code === 'EADDRINUSE' ? '포트가 사용 중입니다. --port 5174 등 다른 포트로 실행하세요.' : error.message);
  process.exitCode = 1;
}

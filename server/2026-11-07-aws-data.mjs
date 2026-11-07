import {existsSync} from 'node:fs';
import {resolve, sep} from 'node:path';
import {Readable} from 'node:stream';

export const AWS_ORIGIN = 'https://sejongscape.com';
const roots = [
  '/data/city.json', '/data/sejong.json', '/data/traffic.json', '/data/its-links.json', '/data/sumo-pilot.json',
  '/data/tiles/', '/data/2026-10-16-trips/', '/data/2026-10-16-dispersal/',
  '/data/2026-10-16-trip-city.json', '/data/2026-11-03-road-lab.json',
  '/data/2026-11-03-csv-fleet/', '/data/2026-11-04-full-sumo/',
  '/data/2026-11-04-lane-sumo/', '/data/2026-11-05-sourced-sumo/',
  '/data/2026-11-05-sumo-demand50/', '/data/2026-11-05-sumo-demand70/',
  '/data/2026-11-05-sejong-city-its-links.json',
];
export function allowedAwsPath(raw) {
  // No arbitrary destination, query, traversal, credentials, or administrative route.
  if (!raw || !raw.startsWith('/') || /[%\\?#]/.test(raw) || raw.includes('//')) return false;
  if (raw.split('/').some(part => part === '.' || part === '..')) return false;
  if (raw === '/api/traffic') return true;
  return /\.(json|bin|gz)$/.test(raw) && roots.some(root => root.endsWith('/') ? raw.startsWith(root) : raw === root);
}
export function isLocalRequest(req) {
  const host = req.headers.host || '';
  if (!/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host)) return false;
  if (req.headers.origin && req.headers.origin !== 'http://' + host) return false;
  return req.headers['sec-fetch-site'] !== 'cross-site';
}
export async function loginAws(password, fetcher = fetch) {
  if (!password || password.length > 128) throw Error('AWS 사이트 접속 비밀번호가 필요합니다.');
  let response;
  try {
    response = await fetcher(AWS_ORIGIN + '/access/login', {
      method: 'POST', redirect: 'manual',
      headers: {Origin: AWS_ORIGIN, 'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({password, next: '/sumo'}), signal: AbortSignal.timeout(20000),
    });
  } catch { throw Error('AWS 연결에 실패했습니다. 인터넷 연결과 운영 사이트 상태를 확인하세요.'); }
  const cookie = response.headers.getSetCookie().find(value => value.startsWith('__Host-sejong-access='))?.split(';')[0];
  const destination = response.headers.get('location');
  await response.body?.cancel();
  if (response.status !== 303 || destination !== '/sumo' || !cookie) {
    throw Error(destination?.includes('error=limit') ? '로그인 시도 제한입니다. 15분 후 다시 실행하세요.' : 'AWS 사이트 인증에 실패했습니다. 접속 비밀번호를 확인하세요.');
  }
  return cookie;
}
const reply = (res, status, message) => {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify({error:message}));
};
export function createAwsMiddleware({root, session, awsMode, fetcher = fetch}) {
  return async function awsData(req, res, next) {
    const path = req.url?.split('?')[0] || '';
    if (!path.startsWith('/data/') && path !== '/api/traffic') return next();
    if (!awsMode) {
      // Return an actual error instead of Vite's index.html fallback for missing JSON.
      if (!path.startsWith('/data/')) return next();
      const dataRoot = resolve(root, 'public/data');
      const filename = resolve(root, 'public', '.' + path);
      if (!filename.startsWith(dataRoot + sep)) return reply(res, 403, '잘못된 자료 경로입니다.');
      if (existsSync(filename)) return next();
      return reply(res, 404, '재생 자료가 없습니다. 터미널에서 npm run dev:aws를 실행하고 AWS 사이트 비밀번호로 연결하세요.');
    }
    if (!isLocalRequest(req)) return reply(res, 403, '로컬 브라우저에서만 사용할 수 있습니다.');
    if (!['GET','HEAD'].includes(req.method)) return reply(res, 405, '허용되지 않는 요청 방식입니다.');
    if (!allowedAwsPath(req.url)) return reply(res, 403, 'AWS 데이터 허용 목록에 없는 경로입니다.');
    if (!session) return reply(res, 401, 'AWS 데이터 인증이 필요합니다. npm run dev:aws로 다시 실행하세요.');
    const controller = new AbortController();
    const abort = () => { if (!res.writableEnded) controller.abort(); };
    res.once('close', abort);
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetcher(AWS_ORIGIN + path, {
        method:req.method, redirect:'manual', signal:controller.signal,
        headers:{Cookie:session, 'Accept-Encoding':'identity'},
      });
      const type = response.headers.get('content-type') || 'application/octet-stream';
      if (response.status === 401 || response.status === 403 || (response.status >= 300 && response.status < 400) || type.includes('text/html')) {
        await response.body?.cancel();
        return reply(res, 401, 'AWS 세션이 만료되었거나 접근이 거부됐습니다. 서버를 종료한 뒤 npm run dev:aws로 다시 연결하세요.');
      }
      if (!response.ok) {
        await response.body?.cancel();
        return reply(res, response.status === 404 ? 404 : 502, 'AWS에서 해당 재생 자료를 가져오지 못했습니다.');
      }
      // Do not expose the AWS session, Set-Cookie, redirect target, or server metadata.
      res.writeHead(200, {'Content-Type':type, 'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
      if (req.method === 'HEAD' || !response.body) { res.end(); return; }
      await new Promise((resolveStream, reject) => {
        const stream = Readable.fromWeb(response.body);
        stream.once('error', reject); res.once('finish', resolveStream);
        res.once('close', () => { stream.destroy(); resolveStream(); });
        stream.pipe(res);
      });
    } catch {
      if (!res.headersSent && !res.destroyed) reply(res, 502, 'AWS 자료 연결이 끊겼습니다. 연결 상태를 확인하고 다시 시도하세요.');
      else if (!res.destroyed) res.destroy();
    } finally { clearTimeout(timeout); res.off('close', abort); }
  };
}
export function awsDataPlugin() {
  return {
    name:'sejongscape-authorized-aws-data', apply:'serve',
    configureServer(server) {
      server.middlewares.use(createAwsMiddleware({root:server.config.root,
        awsMode:process.env.SEJONGSCAPE_DATA_MODE === 'aws', session:process.env.SEJONGSCAPE_AWS_SESSION}));
    },
  };
}

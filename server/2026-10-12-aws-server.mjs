import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync, readdirSync, mkdirSync, chmodSync, realpathSync, statSync, createReadStream} from 'node:fs';
import {resolve, dirname, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import worker from './index.js';
import {gate} from './access.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const headers = {'Cache-Control':'private, no-store', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'same-origin', Vary:'Cookie'};
const aliases = {'/':'/index.html', '/real':'/real.html', '/real/':'/real.html', '/sumo':'/sumo.html', '/sumo/':'/sumo.html', '/traffic':'/traffic.html', '/traffic/':'/traffic.html'};
const types = {'.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.ico':'image/x-icon', '.woff2':'font/woff2'};
const viewerCookie = '__Host-sejong-access';
const adminCookie = '__Host-sejong-admin';

export function openDatabase(filename, migrations = resolve(root, 'drizzle')) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), {recursive:true, mode:0o700});
  const database = new DatabaseSync(filename);
  if (filename !== ':memory:') chmodSync(filename, 0o600);
  database.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  database.exec('CREATE TABLE IF NOT EXISTS aws_schema_migrations (name TEXT PRIMARY KEY)');
  for (const name of readdirSync(migrations).filter(name => name.endsWith('.sql')).sort()) {
    if (database.prepare('SELECT name FROM aws_schema_migrations WHERE name=?').get(name)) continue;
    database.exec('BEGIN IMMEDIATE');
    try {
      database.exec(readFileSync(resolve(migrations, name), 'utf8'));
      database.prepare('INSERT INTO aws_schema_migrations(name) VALUES(?)').run(name);
      database.exec('COMMIT');
    } catch (error) { database.exec('ROLLBACK'); database.close(); throw error; }
  }
  const prepare = (sql, values = []) => ({
    bind(...args) { return prepare(sql, args); },
    first() { return database.prepare(sql).get(...values) ?? null; },
    all() { return {results:database.prepare(sql).all(...values)}; },
    run() { const result = database.prepare(sql).run(...values); return {success:true, meta:{changes:Number(result.changes)}}; },
  });
  return {
    prepare,
    batch(statements) {
      database.exec('BEGIN');
      try { const result = statements.map(statement => statement.all()); database.exec('COMMIT'); return result; }
      catch (error) { database.exec('ROLLBACK'); throw error; }
    },
    close() { database.close(); },
  };
}

function cleanRequest(request, clientIP) {
  const clean = new Headers(request.headers);
  for (const name of [...clean.keys()]) {
    if (name.startsWith('oai-') || ['cf-connecting-ip','forwarded','x-forwarded-for','x-real-ip'].includes(name)) clean.delete(name);
  }
  clean.set('cf-connecting-ip', clientIP);
  return new Request(request, {headers:clean});
}

export function createHandler(env, clientDirectory) {
  const clientRoot = realpathSync(clientDirectory);
  const adminEnv = {...env, SITE_PASSWORD_HASH:env.ADMIN_PASSWORD_HASH, SITE_PASSWORD_SALT:env.ADMIN_PASSWORD_SALT, SITE_SESSION_KEY:env.SITE_SESSION_KEY + ':admin'};
  async function adminGate(request, login = false) {
    const url = new URL(request.url);
    if (login) url.pathname = '/access/login';
    const translated = new Headers(request.headers);
    const cookie = (translated.get('cookie') || '').split(';').map(value => value.trim()).find(value => value.startsWith(adminCookie + '='));
    translated.set('cookie', cookie ? viewerCookie + cookie.slice(adminCookie.length) : '');
    const options = {method:request.method, headers:translated};
    if (!['GET','HEAD'].includes(request.method)) options.body = await request.clone().text();
    const denied = await gate(new Request(url, options), adminEnv);
    if (!denied) return null;
    const resultHeaders = new Headers(denied.headers);
    const cookieValue = resultHeaders.get('set-cookie');
    if (cookieValue) resultHeaders.set('set-cookie', cookieValue.replace(viewerCookie + '=', adminCookie + '='));
    const location = resultHeaders.get('location');
    if (location) resultHeaders.set('location', location === '/' ? '/OSM' : location.replace('/access/login', '/OSM/login'));
    const body = (await denied.text()).replaceAll('action="/access/login"', 'action="/OSM/login"').replace('안내받은 비밀번호를 입력해 주세요.', '소유자용 관리자 비밀번호를 입력해 주세요.');
    return new Response(body || null, {status:denied.status, headers:resultHeaders});
  }
  return async (incoming, clientIP = 'unknown') => {
    let request = cleanRequest(incoming, clientIP);
    const url = new URL(request.url);
    if (url.origin !== env.PUBLIC_ORIGIN) return new Response('잘못된 주소입니다.', {status:400, headers});
    if (['/admin', '/admin/', '/admin/login'].includes(url.pathname)) {
      const target = url.pathname === '/admin/login' ? '/OSM/login' : '/OSM';
      return new Response(null, {status:['GET','HEAD'].includes(request.method) ? 303 : 307, headers:{...headers, Location:target + url.search}});
    }
    if (url.pathname === '/OSM/login') return adminGate(request, true);
    if (url.pathname === '/OSM' || url.pathname === '/OSM/' || url.pathname === '/api/admin/visits') {
      const denied = await adminGate(request);
      if (denied) return denied;
      const ownerHeaders = new Headers(request.headers);
      ownerHeaders.set('oai-authenticated-user-id', 'aws-owner');
      ownerHeaders.set('oai-authenticated-user-email', env.SITE_OWNER_EMAIL);
      ownerHeaders.set('oai-authenticated-user-full-name', 'Owner');
      const internalUrl = new URL(request.url);
      if (internalUrl.pathname === '/OSM' || internalUrl.pathname === '/OSM/') internalUrl.pathname = '/admin';
      return worker.fetch(new Request(internalUrl, new Request(request, {headers:ownerHeaders})), env);
    }
    if (url.pathname === '/api/me') {
      const denied = await gate(request, env);
      if (denied) return denied;
      return Response.json({isOwner:!(await adminGate(request))}, {headers});
    }
    if (url.pathname.startsWith('/api/')) return worker.fetch(request, env);
    const denied = await gate(request, env);
    if (denied) return denied;
    if (!['GET','HEAD'].includes(request.method)) return new Response(null, {status:405, headers});
    let filename;
    try {
      const pathname = decodeURIComponent(aliases[url.pathname] || url.pathname);
      filename = realpathSync(resolve(clientRoot, '.' + pathname));
      if (!filename.startsWith(clientRoot + sep) || !statSync(filename).isFile()) throw Error('outside build');
    } catch { return new Response('찾을 수 없습니다.', {status:404, headers}); }
    const mime = types[extname(filename)] || 'application/octet-stream';
    const outputHeaders = {...headers, 'Content-Type':mime};
    if (request.method === 'HEAD') return new Response(null, {headers:outputHeaders});
    if (mime.startsWith('text/html')) {
      const html = readFileSync(filename, 'utf8').replace('</body>', "<script>addEventListener('pageshow',e=>{if(e.persisted)location.reload()});</script></body>");
      return new Response(html, {headers:outputHeaders});
    }
    return new Response(Readable.toWeb(createReadStream(filename)), {headers:outputHeaders});
  };
}

export function startServer(settings = process.env) {
  const required = ['PUBLIC_ORIGIN','SITE_PASSWORD_HASH','SITE_PASSWORD_SALT','SITE_SESSION_KEY','ADMIN_PASSWORD_HASH','ADMIN_PASSWORD_SALT'];
  for (const key of required) if (!settings[key]) throw Error('Missing setting: ' + key);
  if (new URL(settings.PUBLIC_ORIGIN).origin !== settings.PUBLIC_ORIGIN || !settings.PUBLIC_ORIGIN.startsWith('https://')) throw Error('PUBLIC_ORIGIN must be an HTTPS origin');
  const env = {...settings, SITE_OWNER_EMAIL:settings.SITE_OWNER_EMAIL || ''};
  env.DB = openDatabase(settings.DATABASE_PATH || resolve(root, 'scripts/.cache/2026-10-12-aws-data.sqlite'));
  const handler = createHandler(env, settings.CLIENT_DIRECTORY || resolve(root, '2026-10-12-aws-build/client'));
  const server = createServer(async (req, res) => {
    try {
      const parts = []; let size = 0;
      for await (const part of req) {
        size += part.length;
        if (size > 16384) { res.writeHead(413); res.end(); return; }
        parts.push(part);
      }
      if (req.headers.host !== new URL(env.PUBLIC_ORIGIN).host) { res.writeHead(400); res.end(); return; }
      const inputHeaders = new Headers();
      for (const [key, value] of Object.entries(req.headers)) if (value !== undefined) inputHeaders.set(key, Array.isArray(value) ? value.join(',') : value);
      const request = new Request(new URL(req.url, env.PUBLIC_ORIGIN), {method:req.method, headers:inputHeaders, ...(!['GET','HEAD'].includes(req.method) ? {body:Buffer.concat(parts)} : {})});
      // Bind only to loopback. Nginx must overwrite X-Real-IP with its socket peer.
      const response = await handler(request, req.headers['x-real-ip'] || req.socket.remoteAddress);
      res.writeHead(response.status, {...Object.fromEntries(response.headers), ...(response.headers.getSetCookie().length ? {'set-cookie':response.headers.getSetCookie()} : {})});
      if (response.body) await pipeline(Readable.fromWeb(response.body), res); else res.end();
    } catch (error) {
      console.error('aws_request_failed', error.name);
      if (!res.headersSent) res.writeHead(500, headers);
      res.end('요청 처리에 실패했습니다.');
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.listen(Number(settings.PORT || 3000), '127.0.0.1');
  const stop = () => server.close(() => {env.DB.close(); process.exit(0);});
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
  return server;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) startServer();

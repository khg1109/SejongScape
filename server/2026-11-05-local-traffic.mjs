import {DatabaseSync} from 'node:sqlite';
import {mkdirSync, chmodSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {trafficResponse} from './traffic.js';

// Server-only: never import this module from browser code.
export function localTrafficPlugin() {
  return {
    name: 'traffic-local-live', apply: 'serve',
    configureServer(server) {
      const directory = resolve(server.config.root, 'scripts/.cache');
      mkdirSync(directory, {recursive: true, mode: 0o700});
      const filename = resolve(directory, '2026-11-05-local-traffic.sqlite');
      const database = new DatabaseSync(filename);
      chmodSync(filename, 0o600);
      database.exec('CREATE TABLE IF NOT EXISTS traffic_cache (id INTEGER PRIMARY KEY, payload TEXT NOT NULL, fetched_at INTEGER NOT NULL, next_attempt INTEGER NOT NULL, status TEXT NOT NULL)');
      const DB = {prepare(sql) {
        return {bind(...values) {
          return {
            first: () => database.prepare(sql).get(...values),
            run: () => database.prepare(sql).run(...values),
          };
        }};
      }};
      server.httpServer?.once('close', () => database.close());
      server.middlewares.use('/api/traffic', async (req, res) => {
        res.setHeader('Cache-Control', 'private, no-store');
        if (req.method !== 'GET') {res.statusCode = 405; res.end(); return;}
        let key = process.env.ITS_API_KEY?.trim();
        if (!key) {
          try {
            key = JSON.parse(readFileSync(resolve(directory, '2026-11-05-its-secrets.json'), 'utf8')).apiKey?.trim();
          } catch { /* Missing credentials are reported without printing secrets. */ }
        }
        try {
          const response = await trafficResponse({DB, ITS_API_KEY: key});
          const payload = await response.json();
          if (!key) payload.status = 'missing_key';
          for (const [name, value] of response.headers) res.setHeader(name, value);
          res.end(JSON.stringify(payload));
        } catch {
          res.statusCode = 503;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({error: 'local_traffic_unavailable'}));
        }
      });
    },
  };
}

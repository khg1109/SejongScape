// Run once ON THE AWS SERVER. Never bundle generated credentials with web files.
import {randomBytes, pbkdf2Sync} from 'node:crypto';
import {mkdirSync, writeFileSync, existsSync} from 'node:fs';
import {resolve} from 'node:path';

const [origin, directory] = process.argv.slice(2);
if (!origin || !directory || new URL(origin).origin !== origin || !origin.startsWith('https://')) {
  throw Error('Usage: node scripts/2026-10-12-aws-create-config.mjs https://PUBLIC_IP /private/config/directory');
}
const output = resolve(directory, '2026-10-12-sejongscape.env');
const passwords = resolve(directory, '2026-10-12-sejongscape-passwords.txt');
if (existsSync(output) || existsSync(passwords)) throw Error('Configuration exists; refusing to replace credentials.');
mkdirSync(directory, {recursive:true, mode:0o700});
const viewer = randomBytes(18).toString('base64url'), admin = randomBytes(24).toString('base64url');
const viewerSalt = randomBytes(16).toString('hex'), adminSalt = randomBytes(16).toString('hex');
const hash = (password, salt) => pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex');
const values = {
  PUBLIC_ORIGIN:origin, PORT:'3000',
  CLIENT_DIRECTORY:'/opt/sejongscape/2026-10-12-aws-build/client',
  DATABASE_PATH:'/var/lib/sejongscape/2026-10-12-visits.sqlite',
  SITE_PASSWORD_HASH:hash(viewer, viewerSalt), SITE_PASSWORD_SALT:viewerSalt,
  SITE_SESSION_KEY:randomBytes(32).toString('hex'),
  ADMIN_PASSWORD_HASH:hash(admin, adminSalt), ADMIN_PASSWORD_SALT:adminSalt,
  SITE_OWNER_EMAIL:process.env.SITE_OWNER_EMAIL || '',
};
writeFileSync(output, Object.entries(values).map(([key, value]) => key + '=' + value).join('\n') + '\n', {flag:'wx', mode:0o600});
writeFileSync(passwords, 'Site URL: ' + origin + '\nVisitor password: ' + viewer + '\nAdmin URL: ' + origin + '/admin\nAdmin password: ' + admin + '\n', {flag:'wx', mode:0o600});
console.log('Created private configuration. Password values were not printed.');

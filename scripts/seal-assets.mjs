import {randomBytes,createCipheriv,createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
const secrets=JSON.parse(await fs.readFile('scripts/.cache/gate-secrets.json','utf8'));
const root=path.resolve('dist/client');
const manifest={};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon'};
async function seal(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){
 const full=path.join(dir,entry.name);if(entry.isDirectory()){await seal(full);continue;}
 const rel='/'+path.relative(root,full).split(path.sep).join('/');
 const plain=await fs.readFile(full),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(secrets.SITE_ASSET_KEY,'hex'),iv);
 const encrypted=Buffer.concat([iv,cipher.update(plain),cipher.final(),cipher.getAuthTag()]);
 const name=createHash('sha256').update(encrypted).digest('hex')+'.bin';
 await fs.writeFile(path.join('scripts/.cache/sealed-stage',name),encrypted);
 manifest[rel]={file:'/_sealed/'+name,type:mime[path.extname(full)]||'application/octet-stream'};
}}
await fs.mkdir('scripts/.cache/sealed-stage',{recursive:true});
await seal(root);
// Only remove the verified build output directory, never project sources.
if(root!==path.join(process.cwd(),'dist','client'))throw Error('Unexpected build path');
await fs.rm(root,{recursive:true});
await fs.mkdir(root,{recursive:true});
await fs.mkdir(path.join(root,'_sealed'),{recursive:true});
for(const entry of Object.values(manifest)){const name=path.basename(entry.file);await fs.copyFile(path.join('scripts/.cache/sealed-stage',name),path.join(root,'_sealed',name));}
await fs.writeFile('dist/server/asset-manifest.js','export default '+JSON.stringify(manifest)+';');

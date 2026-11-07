import {createReadStream} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {resolve,dirname,extname} from 'node:path';
import {isLocalRequest} from './2026-11-07-aws-data.mjs';

export function actualDataPlugin(){
 return {name:'verified-local-aws-snapshot',apply:'serve',async configureServer(server){
  const root=process.env.SEJONGSCAPE_ACTUAL_DATA_ROOT;if(process.env.SEJONGSCAPE_DATA_MODE!=='actual'||!root)return;
  const marker=JSON.parse(await readFile(resolve(dirname(root),'complete.json'),'utf8'));
  const files=new Map(marker.files.map(entry=>[entry.path,entry]));
  server.middlewares.use((req,res,next)=>{
   if(!req.url?.startsWith('/data/'))return next();
   const fail=(status,message)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:message}));};
   if(!isLocalRequest(req))return fail(403,'실제 자료는 이 컴퓨터의 로컬 브라우저에서만 열 수 있습니다.');
   if(!['GET','HEAD'].includes(req.method))return fail(405,'허용되지 않는 요청 방식입니다.');
   let name;try{name=decodeURIComponent(req.url.split('?')[0].slice(6));}catch{return fail(400,'잘못된 데이터 경로입니다.');}
   const entry=files.get(name);if(!entry)return fail(404,'이 AWS 운영 스냅샷에 없는 자료입니다.');
   res.writeHead(200,{'Content-Type':extname(name)==='.json'?'application/json; charset=utf-8':'application/octet-stream','Content-Length':entry.size,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
   if(req.method==='HEAD')return res.end();
   const stream=createReadStream(resolve(root,name));stream.on('error',()=>res.destroy());res.once('close',()=>stream.destroy());stream.pipe(res);
  });
 }};
}

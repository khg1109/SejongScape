import {gate,protectedAsset} from './access.js';
import {adminHtml} from './admin.js';
import {trafficResponse} from './traffic.js';
const headers={'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'};
const json=(data,status=200)=>Response.json(data,{status,headers});
const redirect=location=>new Response(null,{status:303,headers:{...headers,Location:location}});
export function identity(request,env){
 const id=request.headers.get('oai-authenticated-user-id');const email=request.headers.get('oai-authenticated-user-email');
 if(!id||!email)return null;
 let name=request.headers.get('oai-authenticated-user-full-name')||'';
 if(request.headers.get('oai-authenticated-user-full-name-encoding')==='percent-encoded-utf-8'){try{name=decodeURIComponent(name);}catch{name='';}}
 return {id,email,name,isOwner:!!env.SITE_OWNER_EMAIL&&email.toLowerCase()===env.SITE_OWNER_EMAIL.trim().toLowerCase()};
}
export default {async fetch(request,env){
 const url=new URL(request.url),path=url.pathname,user=identity(request,env);
 if(path==='/admin'||path==='/admin/'||path==='/api/admin/visits'){
  if(!user){
   if(path==='/api/admin/visits')return json({error:'ChatGPT 소유자 로그인이 필요합니다.'},401);
   return redirect('/signin-with-chatgpt?return_to=%2Fadmin');
  }
  if(!user.isOwner)return json({error:'소유자만 접속 기록을 볼 수 있습니다.'},403);
  if(request.method!=='GET')return json({error:'허용되지 않은 요청입니다.'},405);
  if(path!=='/api/admin/visits')return new Response(adminHtml,{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"}});
  const days=Math.min(90,Math.max(1,Number(url.searchParams.get('days'))||30));
  const offset=Math.min(1000000,Math.max(0,Math.floor(Number(url.searchParams.get('offset'))||0)));
  const since=Date.now()-days*86400000;
  try{
   const [rows,stats]=await env.DB.batch([
    env.DB.prepare('SELECT email,name,path,visited_at,ip FROM visits WHERE visited_at >= ? ORDER BY visited_at DESC,id DESC LIMIT 51 OFFSET ?').bind(since,offset),
    env.DB.prepare('SELECT COUNT(*) AS visits,COUNT(DISTINCT CASE WHEN email != \'\' THEN user_id END) AS visitors,COUNT(DISTINCT ip) AS ips,MAX(visited_at) AS latest FROM visits WHERE visited_at >= ?').bind(since)
   ]);
   return json({rows:rows.results.slice(0,50),hasMore:rows.results.length>50,offset,stats:stats.results[0]});
  }catch{console.error('visit_query_failed');return json({error:'접속 기록을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.'},503);}
 }
 const denied=await gate(request,env);if(denied)return denied;
 if(path==='/api/traffic')return request.method==='GET'?trafficResponse(env):json({error:'허용되지 않은 요청입니다.'},405);
 if(path==='/api/visits'){
  if(request.method!=='POST')return json({error:'허용되지 않은 요청입니다.'},405);
  if(request.headers.get('origin')!==url.origin)return json({error:'허용되지 않은 출처입니다.'},403);
  let body;try{body=await request.json();}catch{return json({error:'잘못된 요청입니다.'},400);}
  if(!body||!['/','/real','/sumo','/traffic'].includes(body.path))return json({error:'잘못된 방문 화면입니다.'},400);
  const time=Date.now();
  // Cloudflare supplies this header; never accept IP or timestamps from the body.
  const ip=request.headers.get('cf-connecting-ip')||null;
  const session=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('__Host-sejong-access='))||'';
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(session));
  const visitorId=user?.id||'anonymous:'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  try{
   await env.DB.prepare('INSERT INTO visits(user_id,email,name,path,visited_at,ip) SELECT ?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM visits WHERE user_id=? AND path=? AND ip IS ? AND visited_at>?)').bind(visitorId,user?.email||'',user?.name||'',body.path,time,ip,visitorId,body.path,ip,time-300000).run();
   await env.DB.prepare('DELETE FROM visits WHERE visited_at < ?').bind(time-90*86400000).run();
   return json({recorded:true});
  }catch(e){console.error('visit_write_failed',e.message);return json({error:'접속 기록 저장에 실패했습니다.'},503);}
 }
 if(path==='/api/me')return json({isOwner:!!user?.isOwner});
 if(path.startsWith('/api/'))return json({error:'찾을 수 없습니다.'},404);
 return protectedAsset(request,env);
}};

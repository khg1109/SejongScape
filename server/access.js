import manifest from './asset-manifest.js';
const enc=new TextEncoder();
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
const bytes=value=>Uint8Array.from(value.match(/../g)||[],v=>parseInt(v,16));
const baseHeaders={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'};
const cookieName='__Host-sejong-access';
const sign=async(value,key)=>{const k=await crypto.subtle.importKey('raw',enc.encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',k,enc.encode(value)));};
const equal=(a,b)=>{if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;};
const loginHtml=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SejongScape | 입장</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#101e28;color:#edf5ef;font:16px/1.6 system-ui}main{width:min(420px,90vw);padding:36px;background:#1b3036;border:1px solid #34524f;border-radius:18px}h1{margin:0;font-size:30px}p{color:#bdcfc8}label{display:block}input,button{width:100%;font:inherit;border-radius:8px;padding:12px;margin-top:10px}input{background:#102228;color:white;border:1px solid #70988b}button{background:#b8e9cc;border:0;color:#142b25;cursor:pointer}#status{min-height:26px;color:#ffd5c7}</style><main><h1>SejongScape</h1><p>안내받은 비밀번호를 입력해 주세요.</p><form method="post" action="/access/login"><label for="password">접속 비밀번호</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="128" autofocus><button>입장하기</button></form><p id="status" role="alert"></p></main><script>const e=new URLSearchParams(location.search).get('error');document.getElementById('status').textContent=e==='wrong'?'비밀번호가 일치하지 않습니다.':e==='limit'?'시도가 많습니다. 15분 후 다시 시도해 주세요.':e==='unavailable'?'잠시 후 다시 시도해 주세요.':'';</script></html>`;
const destinations=['/','/index.html','/real','/real/','/real.html','/sumo','/sumo/','/sumo.html','/traffic','/traffic/','/traffic.html'];
const redirect=location=>new Response(null,{status:303,headers:{...baseHeaders,Location:location}});
export async function gate(request,env){
 const url=new URL(request.url);
 if(!env.SITE_PASSWORD_HASH||!env.SITE_PASSWORD_SALT||!env.SITE_SESSION_KEY)return new Response('접속 설정 중입니다. 잠시 후 다시 시도해 주세요.',{status:503,headers:baseHeaders});
 if(url.pathname==='/access/login'){
  if(request.method==='GET')return new Response(loginHtml.replace('<label for="password">','<input type="hidden" name="next" value="'+(destinations.includes(url.searchParams.get('next'))?url.searchParams.get('next'):'/')+'"><label for="password">'),{headers:{...baseHeaders,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});
  if(request.method!=='POST')return new Response(null,{status:405,headers:baseHeaders});
  if(request.headers.get('origin')!==url.origin)return new Response(null,{status:403,headers:baseHeaders});
  if(Number(request.headers.get('content-length'))>2048)return new Response(null,{status:413,headers:baseHeaders});
  try{
   const now=Date.now(),ip=request.headers.get('cf-connecting-ip')||'unknown',key=await sign(ip,env.SITE_SESSION_KEY);
   await env.DB.prepare('DELETE FROM password_attempts WHERE expires < ?').bind(now).run();
   const attempt=await env.DB.prepare('INSERT INTO password_attempts(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key,now+900000).first();
   if(attempt.count>10)return redirect('/access/login?error=limit');
   const body=await request.text();if(body.length>2048)return new Response(null,{status:413,headers:baseHeaders});
   const form=new URLSearchParams(body);const password=form.get('password')||'';
   const destination=destinations.includes(form.get('next'))?form.get('next'):'/';
   const material=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
   const hash=hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc.encode(env.SITE_PASSWORD_SALT),iterations:100000,hash:'SHA-256'},material,256));
   if(!equal(hash,env.SITE_PASSWORD_HASH))return redirect('/access/login?error=wrong');
   await env.DB.prepare('DELETE FROM password_attempts WHERE key=?').bind(key).run();
   const payload=String(now+8*3600000)+'.'+hex(crypto.getRandomValues(new Uint8Array(16)));
   const token=payload+'.'+await sign(payload,env.SITE_SESSION_KEY+env.SITE_PASSWORD_HASH);
   return new Response(null,{status:303,headers:{...baseHeaders,Location:destination, 'Set-Cookie':cookieName+'='+token+'; Path=/; HttpOnly; Secure; SameSite=Lax'}});
  }catch(e){console.error('access_login_failed',e.message);return redirect('/access/login?error=unavailable');}
 }
 const value=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';
 const parts=value.split('.');
 if(parts.length===3&&Number(parts[0])>Date.now()&&Number(parts[0])<=Date.now()+8*3600000&&equal(await sign(parts[0]+'.'+parts[1],env.SITE_SESSION_KEY+env.SITE_PASSWORD_HASH),parts[2])){
  return null;
 }
 if(url.pathname.startsWith('/api/'))return Response.json({error:'접속 비밀번호를 입력해 주세요.'},{status:401,headers:baseHeaders});
 return redirect('/access/login'+(destinations.includes(url.pathname)&&url.pathname!=='/'?'?next='+encodeURIComponent(url.pathname):''));
}
export async function protectedAsset(request,env){
 const url=new URL(request.url),aliases={'/':'/index.html','/real':'/real.html','/real/':'/real.html','/sumo':'/sumo.html','/sumo/':'/sumo.html','/traffic':'/traffic.html','/traffic/':'/traffic.html'};
 const entry=manifest[aliases[url.pathname]||url.pathname];
 if(!entry||!['GET','HEAD'].includes(request.method))return new Response('찾을 수 없습니다.',{status:404,headers:baseHeaders});
 try{
  url.pathname=entry.file;url.search='';
  const response=await env.ASSETS.fetch(new Request(url,{method:'GET'}));
  if(!response.ok)throw Error('asset unavailable');
  const data=new Uint8Array(await response.arrayBuffer());
  const key=await crypto.subtle.importKey('raw',bytes(env.SITE_ASSET_KEY),'AES-GCM',false,['decrypt']);
  let plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:data.slice(0,12)},key,data.slice(12));
  if(entry.type.startsWith('text/html'))plain=new TextDecoder().decode(plain).replace('</body>',"<script>addEventListener('pageshow',e=>{if(e.persisted)location.reload()});</script></body>");
  return new Response(request.method==='HEAD'?null:plain,{headers:{...baseHeaders,'Content-Type':entry.type}});
 }catch(e){console.error('protected_asset_failed',e.message);return new Response('자료를 불러오지 못했습니다.',{status:503,headers:baseHeaders});}
}

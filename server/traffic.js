import initial from './traffic-initial.js';
export const REFRESH_MS=300000;
const RETRY_MS=3600000;
const reply=data=>Response.json(data,{headers:{'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'}});
export function observationTime(value){
 if(!/^\d{14}$/.test(String(value)))return null;
 const s=String(value),iso=`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T${s.slice(8,10)}:${s.slice(10,12)}:${s.slice(12)}+09:00`,time=Date.parse(iso);
 return Number.isFinite(time)?time:null;
}
export function normalize(payload){
 if(String(payload?.header?.resultCode)!=='0'||!Array.isArray(payload?.body?.items))throw Error('invalid_upstream');
 const items=payload.body.items;
 if(items.length>10000||Number(payload.body.totalCount)!==items.length)throw Error('invalid_count');
 const number=value=>value===null||value===undefined||String(value).trim()===''?null:Number(value);
 return items.filter(x=>/^\d{10}$/.test(x.linkId)).map(x=>{
  const speed=number(x.speed),travelTime=number(x.travelTime);
  return {id:x.linkId,name:String(x.roadName||'이름 없는 도로').slice(0,100),fromNode:String(x.startNodeId||''),toNode:String(x.endNodeId||''),
   speed:Number.isFinite(speed)&&speed>=0&&speed<=200?speed:null,
   travelTime:Number.isFinite(travelTime)&&travelTime>=0?travelTime:null,observedAt:observationTime(x.createdDate)};
 });
}
export async function trafficResponse(env,{now=Date.now(),fetcher=fetch}={}){
 let row;
 try{
  await env.DB.prepare('INSERT OR IGNORE INTO traffic_cache(id,payload,fetched_at,next_attempt,status) VALUES(1,?,0,0,?)').bind(JSON.stringify(initial),'snapshot').run();
  row=await env.DB.prepare('SELECT * FROM traffic_cache WHERE id=?').bind(1).first();
  if(env.ITS_API_KEY&&now>=row.next_attempt){
   // A conditional update grants one global refresh lease across visitors and Workers.
   const lease=await env.DB.prepare('UPDATE traffic_cache SET next_attempt=? WHERE id=1 AND next_attempt<=? RETURNING id').bind(now+RETRY_MS,now).first();
   if(lease){
    try{
     const url=new URL('https://openapi.its.go.kr:9443/trafficInfo');
     url.search=new URLSearchParams({apiKey:env.ITS_API_KEY,type:'all',getType:'json',minX:'127.252',maxX:'127.286',minY:'36.489',maxY:'36.513'}).toString();
     const response=await fetcher(url,{signal:AbortSignal.timeout(12000)});
     if(!response.ok)throw Error('upstream_http');
     const items=normalize(await response.json());
     await env.DB.prepare('UPDATE traffic_cache SET payload=?,fetched_at=?,next_attempt=?,status=? WHERE id=1').bind(JSON.stringify(items),now,now+REFRESH_MS,'ok').run();
    }catch{
     await env.DB.prepare('UPDATE traffic_cache SET status=? WHERE id=1').bind('unavailable').run();
    }
    row=await env.DB.prepare('SELECT * FROM traffic_cache WHERE id=?').bind(1).first();
   }
  }
 }catch{return reply({items:initial,source:'ITS 국가교통정보센터',mode:'saved',status:'storage_unavailable',fetchedAt:null,nextAttempt:null,serverTime:now});}
 return reply({items:JSON.parse(row.payload),source:'ITS 국가교통정보센터',mode:row.fetched_at?'api':'saved',status:row.status,
  fetchedAt:row.fetched_at||null,nextAttempt:row.next_attempt||null,serverTime:now,refreshSeconds:REFRESH_MS/1000});
}

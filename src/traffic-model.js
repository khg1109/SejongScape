export const STALE_MS=15*60000;
export function trafficState(row,now=Date.now()){
 if(!row||row.speed===null||!Number.isFinite(row.speed)||row.observedAt===null||!Number.isFinite(row.observedAt))return 'missing';
 if(now-row.observedAt>STALE_MS||row.observedAt-now>300000)return 'stale';
 return row.speed<15?'slow':row.speed<25?'medium':'fast';
}
export const COLORS={slow:0xff756d,medium:0xffcb68,fast:0x64dec3,missing:0x637782,stale:0x8a94a8};
export const LABELS={slow:'15 km/h 미만',medium:'15–25 km/h',fast:'25 km/h 이상',missing:'자료 없음',stale:'지난 관측자료'};
export function joinTraffic(geometry,observations){
 const byId=new Map(observations.map(row=>[row.id,row]));
 return geometry.links.map(link=>({...link,observation:byId.get(link.id)||null}));
}

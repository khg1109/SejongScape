export const MODE_COLORS = {1:'#7dd3fc',2:'#74e4bc',3:'#f8c477',4:'#d2afff',97:'#f19bb4'};
export function decodeTrips(buffer) {
 if(buffer.byteLength%20)throw Error('통행 파일의 길이가 올바르지 않습니다.');
 const v=new DataView(buffer),rows=[];
 for(let p=0;p<buffer.byteLength;p+=20)rows.push({id:v.getUint32(p,true),seq:v.getUint8(p+4),gender:v.getUint8(p+5),age:v.getUint8(p+6),home:v.getUint8(p+7),originType:v.getUint8(p+8),destinationType:v.getUint8(p+9),origin:v.getUint8(p+10),destination:v.getUint8(p+11),start:v.getUint16(p+12,true),end:v.getUint16(p+14,true),mode:v.getUint8(p+16),purpose:v.getUint8(p+17)});
 return rows;
}
export function filterTrips(rows, f) {
 return rows.filter(r=>(f.person==null||r.id===f.person)&&f.modes.includes(r.mode)&&(f.origin===''||r.origin===Number(f.origin))&&(f.destination===''||r.destination===Number(f.destination))&&(f.purpose===''||r.purpose===Number(f.purpose)));
}
export const tripKey=r=>`${r.id}:${r.seq}`;
export function routeState(r, anchors) {
 if(anchors[r.origin]?.kind==='external'||anchors[r.destination]?.kind==='external')return 'external';
 if(r.origin===r.destination)return 'same';
 if(!anchors[r.origin]?.point||!anchors[r.destination]?.point)return 'unmapped';
 return 'route';
}
export function activeTrips(rows, minute) {return rows.filter(r=>r.start<=minute&&minute<r.end);}
// A reproducible bounded display sample, never used for totals or the record table.
export function displaySample(rows, limit=800) {
 if(rows.length<=limit)return rows;
 return [...rows].sort((a,b)=>hash(a)-hash(b)||a.id-b.id||a.seq-b.seq).slice(0,limit);
}
function hash(r){return Math.imul(r.id^Math.imul(r.seq,2654435761),1597334677)>>>0;}
export function prepareRoute(route) {
 const cumulative=[0];for(let i=1;i<route.points.length;i++)cumulative.push(cumulative.at(-1)+Math.hypot(route.points[i][0]-route.points[i-1][0],route.points[i][1]-route.points[i-1][1]));
 return {...route,cumulative};
}
export function positionOnRoute(route, progress) {
 const p=Math.max(0,Math.min(1,progress)),length=route.cumulative.at(-1),target=p*length;
 if(!length||p===0)return route.points[0];if(p===1)return route.points.at(-1);
 let lo=1,hi=route.points.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(route.cumulative[mid]<target)lo=mid+1;else hi=mid;}
 const a=route.points[lo-1],b=route.points[lo],segment=route.cumulative[lo]-route.cumulative[lo-1],f=segment?(target-route.cumulative[lo-1])/segment:0;
 return [a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f];
}
export function clock(minute) {const m=Math.max(0,Math.min(1440,Math.floor(minute)));return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;}
export function replayBounds(rows,hour,person) {
 let start=person!=null&&rows.length?1440:hour*60,end=person!=null&&rows.length?0:(hour+1)*60;
 for(const r of rows){if(person!=null)start=Math.min(start,r.start);end=Math.max(end,r.end);}
 return {start,end:Math.min(1440,Math.max(start+1,end+(person!=null?1:0)))};
}

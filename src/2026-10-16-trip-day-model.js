// Keep the million-record source in compact binary storage, not a million JS objects.
export class TripDay {
 constructor(manifest){this.manifest=manifest;this.chunks=[];this.count=0;}
 add(buffer,expected){
  if(buffer.byteLength%20||buffer.byteLength/20!==expected)throw Error('통행 데이터 건수가 일치하지 않습니다.');
  const view=new DataView(buffer);let min=1440,max=0;
  for(let p=0;p<buffer.byteLength;p+=20){min=Math.min(min,view.getUint16(p+12,true));max=Math.max(max,view.getUint16(p+14,true));}
  this.chunks.push({view,min,max});this.count+=expected;
 }
 person(id){const found=[];for(const {view:v} of this.chunks)for(let p=0;p<v.byteLength;p+=20)if(v.getUint32(p,true)===id)found.push(read(v,p));return found.sort((a,b)=>a.seq-b.seq);}
 active(minute,{modes,origin='',destination='',purpose='',person=null}){
  const rows=[];const allowed=new Set(modes);
  for(const {view:v,min,max} of this.chunks){
   if(minute<min||minute>=max)continue;
   for(let p=0;p<v.byteLength;p+=20){
    const start=v.getUint16(p+12,true);if(start>minute||v.getUint16(p+14,true)<=minute)continue;
    if(!allowed.has(v.getUint8(p+16))||(origin!==''&&v.getUint8(p+10)!==Number(origin))||(destination!==''&&v.getUint8(p+11)!==Number(destination))||(purpose!==''&&v.getUint8(p+17)!==Number(purpose))||(person!==null&&v.getUint32(p,true)!==person))continue;
    rows.push(read(v,p));
   }
  }return rows;
 }
}
function read(v,p){return {id:v.getUint32(p,true),seq:v.getUint8(p+4),gender:v.getUint8(p+5),age:v.getUint8(p+6),home:v.getUint8(p+7),originType:v.getUint8(p+8),destinationType:v.getUint8(p+9),origin:v.getUint8(p+10),destination:v.getUint8(p+11),start:v.getUint16(p+12,true),end:v.getUint16(p+14,true),mode:v.getUint8(p+16),purpose:v.getUint8(p+17)};}
export function dayClock(minute){const sec=Math.max(0,Math.min(86400,Math.floor(minute*60)));return `${String(Math.floor(sec/3600)).padStart(2,'0')}:${String(Math.floor(sec/60)%60).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;}

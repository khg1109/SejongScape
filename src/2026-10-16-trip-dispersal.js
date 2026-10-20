// Synthetic locations only. Source times, regions, purposes and modes are untouched.
const NONE=65535;
function hash(id,seq,region,salt) {
 let h=(id^Math.imul(seq+1,0x9e3779b9)^Math.imul(region+1,0x85ebca6b)^salt)>>>0;
 h=Math.imul(h^(h>>>16),0x7feb352d);h=Math.imul(h^(h>>>15),0x846ca68b);
 return (h^(h>>>16))>>>0;
}
export class TripDispersal {
 constructor(network,parents) {
  this.network=network;this.parents=parents;this.cache=new Map();this.used=new Set();
  if(parents.length!==network.endpoints.length*network.vertices.length)throw Error('분산 경로 자료 크기가 일치하지 않습니다.');
 }
 assign(day) {
  let maxSequence=0;
  for(const {view:v} of day.chunks)for(let p=0;p<v.byteLength;p+=20)maxSequence=Math.max(maxSequence,v.getUint8(p+4));
  this.stride=maxSequence+1;
  const slots=(day.manifest.maxPerson+1)*this.stride;
  this.origins=new Uint16Array(slots).fill(NONE);this.destinations=new Uint16Array(slots).fill(NONE);
  const lastDestination=new Uint16Array(day.manifest.maxPerson+1).fill(NONE),lastRegion=new Uint8Array(day.manifest.maxPerson+1).fill(255);
  for(let seq=1;seq<=maxSequence;seq++)for(const {view:v} of day.chunks)for(let p=0;p<v.byteLength;p+=20){
   if(v.getUint8(p+4)!==seq)continue;
   const id=v.getUint32(p,true),origin=v.getUint8(p+10),destination=v.getUint8(p+11),key=id*this.stride+seq;
   const origins=this.network.pools[origin]||[],destinations=this.network.pools[destination]||[];
   const from=origins.length?(lastRegion[id]===origin&&lastDestination[id]!==NONE?lastDestination[id]:origins[hash(id,seq,origin,17)%origins.length]):NONE;
   let to=destinations.length?destinations[hash(id,seq,destination,73)%destinations.length]:NONE;
   if(from===to&&to!==NONE)to=destinations[(destinations.indexOf(to)+1+hash(id,seq,destination,131)%(destinations.length-1))%destinations.length];
   this.origins[key]=from;this.destinations[key]=to;lastDestination[id]=to;lastRegion[id]=destination;
  }
 }
 pair(row) {
  const key=row.id*this.stride+row.seq,from=this.origins[key],to=this.destinations[key];
  return from===undefined||to===undefined||from===NONE||to===NONE?null:[from,to];
 }
 beginFrame(){this.used.clear();}
 endFrame(){for(const key of this.cache.keys())if(!this.used.has(key))this.cache.delete(key);}
 route(row) {
  const pair=this.pair(row);if(!pair)return null;
  const [from,to]=pair,key=from*this.network.endpoints.length+to;this.used.add(key);
  if(this.cache.has(key))return this.cache.get(key);
  const n=this.network,source=n.endpoints[from],target=n.endpoints[to];let edgeIds;
  if(source.region===target.region)edgeIds=n.localRoutes[`${from}:${to}`];
  else {
   edgeIds=[];let vertex=target.vertex;
   while(vertex!==source.vertex){
    const eid=this.parents[from*n.vertices.length+vertex]-1;
    if(eid<0||!n.edges[eid]||edgeIds.length>n.vertices.length)throw Error('분산 도로 연결 검증 실패');
    edgeIds.push(eid);vertex=n.edges[eid][0];
   }
   edgeIds.reverse();
  }
  if(!edgeIds?.length)throw Error('동일 지역 분산 경로가 없습니다.');
  const points=[];
  for(const eid of edgeIds){const ids=n.edges[eid][3];for(let i=points.length?1:0;i<ids.length;i++)points.push(n.points[ids[i]]);}
  const cumulative=new Float64Array(points.length);
  for(let i=1;i<points.length;i++)cumulative[i]=cumulative[i-1]+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]);
  const path={points,cumulative,meters:cumulative.at(-1),from,to,local:source.region===target.region};
  if(!path.meters)throw Error('출발·도착 지점이 겹칩니다.');
  this.cache.set(key,path);return path;
 }
}

export async function loadTripDispersal() {
 const response=await fetch('/data/2026-10-16-dispersal/2026-10-16-network.json');
 if(!response.ok)throw Error(`분산 경로 응답 ${response.status}`);
 const network=await response.json(),trees=await fetch(network.treeUrl);
 if(!trees.ok)throw Error(`분산 도로 응답 ${trees.status}`);
 // Vite serves .gz with Content-Encoding; other static hosts may send raw gzip.
 const received=await trees.arrayBuffer(),magic=new Uint8Array(received,0,Math.min(2,received.byteLength));
 const buffer=magic[0]===31&&magic[1]===139?await new Response(new Blob([received]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer():received;
 if(buffer.byteLength!==network.treeBytes)throw Error('분산 도로 자료가 불완전합니다.');
 return new TripDispersal(network,new Uint32Array(buffer));
}

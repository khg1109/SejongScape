import { project } from './map.js';

export const PERIODS = {
  morning: { label: '출근 · 08:00', people: 1000, cars: 230, office: 1.8, shop: .6, park: .5 },
  day: { label: '낮 · 13:00', people: 1250, cars: 170, office: 1.2, shop: 1.2, park: 1.1 },
  evening: { label: '퇴근 · 18:00', people: 1600, cars: 260, office: 1.3, shop: 1.8, park: 1.4 },
  night: { label: '밤 · 22:00', people: 430, cars: 85, office: .15, shop: .8, park: .25 },
};
export function randomSource(seed=721) {
  return () => { seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; };
}
export function roadWidth(tags) {
  return Number.parseFloat(tags.width)||({primary:18,secondary:14,tertiary:11,residential:7,service:4,motorway:22,trunk:20,busway:7})[tags.highway]||(['footway','path','cycleway','steps','pedestrian'].includes(tags.highway)?2.2:6);
}
const carTypes=new Set(['primary','secondary','tertiary','primary_link','secondary_link','tertiary_link','residential','unclassified','living_street','service']);
export function permitted(tags, kind) {
  if(tags.tunnel==='yes'||tags.indoor==='yes'||tags.covered==='yes'||['private','no'].includes(tags.access)||tags.area==='yes') return false;
  if(kind==='person') return ['footway','path','pedestrian','steps'].includes(tags.highway)&&tags.foot!=='no';
  if(kind==='bike') return (tags.highway==='cycleway'||tags.bicycle==='designated'||tags.bicycle==='yes')&&tags.highway!=='steps';
  if(['no','private'].includes(tags.motor_vehicle)||tags.motorcar==='no') return false;
  if(kind==='bus') return ['primary','secondary','tertiary','primary_link','secondary_link','tertiary_link','busway'].includes(tags.highway);
  return carTypes.has(tags.highway)&&tags.service!=='parking_aisle';
}

export function buildNetwork(data,kind) {
  const edges=[],nodes=new Map();
  function node(key,point) {if(!nodes.has(key))nodes.set(key,{key,point,out:[],neighbors:new Set()});return nodes.get(key);}
  for(const way of data.elements) {
    if(!way.geometry||!permitted(way.tags||{},kind))continue;
    const tags=way.tags, motor=['car','bus'].includes(kind);
    const one=motor?(tags.oneway==='-1'?-1:tags.oneway==='yes'||tags.junction==='roundabout'?1:0):0;
    for(let i=1;i<way.geometry.length;i++) {
      const a=way.geometry[i-1],b=way.geometry[i];
      if(!Number.isFinite(a?.lat)||!Number.isFinite(b?.lat))continue;
      const key=(p,index)=>String(way.nodes?.[index]??`${p.lat},${p.lon},${tags.layer||0}`);
      const na=node(key(a,i-1),project(a,data.center)),nb=node(key(b,i),project(b,data.center));
      const length=Math.hypot(nb.point[0]-na.point[0],nb.point[1]-na.point[1]);
      if(length<.3)continue;
      function add(from,to) {
        const dx=(to.point[0]-from.point[0])/length,dz=(to.point[1]-from.point[1])/length;
        const edge={id:edges.length,from,to,length,dx,dz,tags,width:roadWidth(tags),y:(tags.bridge&&tags.bridge!=='no'?1.23:.23)+(tags.footway==='sidewalk'?.1:0),one:one!==0};
        edges.push(edge);from.out.push(edge);from.neighbors.add(to.key);to.neighbors.add(from.key);
      }
      if(one!==-1)add(na,nb);if(one!==1)add(nb,na);
    }
  }
  if(kind==='bus') {
    for(const stop of data.elements.filter(e=>e.type==='node'&&e.tags?.highway==='bus_stop')) {
      const p=project(stop,data.center);let closest=null,best=24;
      for(const edge of edges){const x=p[0]-edge.from.point[0],z=p[1]-edge.from.point[1],d=x*edge.dx+z*edge.dz,side=-x*edge.dz+z*edge.dx;if(d<1||d>edge.length-1||side<0)continue;const distance=Math.abs(side);if(distance<best){best=distance;closest={edge,d};}}
      if(closest){closest.edge.stops??=[];closest.edge.stops.push({distance:closest.d,id:stop.id,name:stop.tags.name});}
    }
  }
  return {edges,nodes,kind};
}

export function activitySources(data) {
  const sources=[];
  for(const e of data.elements) {
    if(e.type==='node'&&e.tags?.highway==='bus_stop'){const p=project(e,data.center);sources.push({kind:'office',x:p[0],z:p[1]});continue;}
    if(!e.geometry?.length)continue;
    const t=e.tags||{};
    const kind=t.shop||['retail','commercial'].includes(t.building)?'shop':t.office||t.building==='office'?'office':t.leisure==='park'||t.amenity==='library'?'park':null;
    if(!kind)continue;
    const pts=e.geometry.map(p=>project(p,data.center));
    sources.push({kind,x:pts.reduce((s,p)=>s+p[0],0)/pts.length,z:pts.reduce((s,p)=>s+p[1],0)/pts.length});
  }
  return sources;
}
export function activityAt(x,z,sources,period) {
  let density=.12;
  for(const p of sources) {
    const d2=(x-p.x)**2+(z-p.z)**2;
    if(d2<360000)density+=period[p.kind]*Math.exp(-d2/(2*150**2))*(p.kind==='office'?.16:.65);
  }
  return Math.min(density,5);
}
export function sampleEdge(edge,distance,offset=0) {
  const d=Math.max(0,Math.min(distance,edge.length));
  // In x/z coordinates (-dz, dx) is the right-hand side of travel.
  return {x:edge.from.point[0]+edge.dx*d-edge.dz*offset,z:edge.from.point[1]+edge.dz*d+edge.dx*offset,y:edge.y,yaw:Math.atan2(edge.dx,edge.dz)};
}
export function signalAllows(edge,time) {
  return signalState(edge,time)==='green';
}
export function signalPhase(node,time){return (time+Math.abs(node.point[0]*.07+node.point[1]*.11)%12)%90;}
export function signalState(edge,time) {
  const node=edge.controller||edge.to;
  if(!node.signal)return 'green';
  if(node.pedestrianOccupied)return 'red';
  const offset=(Math.abs(node.point[0]*.07+node.point[1]*.11)%12);
  const phase=(time+offset)%90;
  const horizontal=Math.abs(edge.dx)>Math.abs(edge.dz);
  if(horizontal&&phase<19||!horizontal&&phase>=22&&phase<41)return 'green';
  if(horizontal&&phase>=19&&phase<21||!horizontal&&phase>=41&&phase<43)return 'yellow';
  return 'red';
}
export function walkAllows(node,time){const phase=signalPhase(node,time);return phase>=44&&phase<54;}
export function chooseNext(edge,rng) {
  const choices=edge.to.out.filter(e=>e.to!==edge.from);
  if(!choices.length)return edge.to.out.find(e=>e.to===edge.from)||null;
  // Favor continuing ahead; a junction turn is less common than through travel.
  const weights=choices.map(e=>.3+Math.max(0,e.dx*edge.dx+e.dz*edge.dz)*2);
  let pick=rng()*weights.reduce((a,b)=>a+b,0);
  return choices.find((e,i)=>(pick-=weights[i])<=0)||choices.at(-1);
}

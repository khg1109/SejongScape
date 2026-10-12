import * as THREE from 'three';
import { PERIODS, randomSource, buildNetwork, activitySources, activityAt, sampleEdge, signalAllows, chooseNext,walkAllows } from './mobility-model.js';
import {createTraffic} from './traffic.js';

const palette=[0xe6ddcf,0x344c71,0xa05d45,0x467669,0xd3ad55,0x775c84,0x59616a];
const carPalette=[0xe2e6e3,0xa8b6c0,0x243442,0x535b62,0xd1d3ca,0x963d35];
const box=new THREE.BoxGeometry(1,1,1);
const sphere=new THREE.SphereGeometry(1,7,5);
const wheel=new THREE.CylinderGeometry(1,1,1,10);wheel.rotateZ(Math.PI/2);

export function createMobility(scene,data,density=1) {
  const group=new THREE.Group();group.name='City activity';scene.add(group);
  const rng=randomSource(), sources=activitySources(data);
  const networks=Object.fromEntries(['person','car','bus','bike'].map(k=>[k,buildNetwork(data,k)]));
  const traffic=createTraffic(scene,data,networks);
  const object=new THREE.Object3D(),rotation=new THREE.Quaternion(),axis=new THREE.Vector3(0,1,0),local=new THREE.Vector3();
  const material=(color)=>new THREE.MeshStandardMaterial({color,roughness:.7});
  const skin=material(0xd9ac89),dark=material(0x26323b),glass=material(0x87a8b6),rubber=material(0x14202a);
  const lightMat=new THREE.MeshBasicMaterial({color:0xffedbc}),tailMat=new THREE.MeshBasicMaterial({color:0xff3a24});
  const white=material(0xffffff);
  const allBatches=[];
  function batch(geometry,mat,capacity,colors) {
    const mesh=new THREE.InstancedMesh(geometry,mat,capacity);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;mesh.count=0;group.add(mesh);allBatches.push(mesh);
    if(colors)for(let i=0;i<capacity;i++)mesh.setColorAt(i,new THREE.Color(colors[i%colors.length]));
    return mesh;
  }
  const people={body:batch(box,white,1600,palette),head:batch(sphere,skin,1600),hair:batch(sphere,dark,1600),legs:batch(box,dark,3200),arms:batch(box,white,3200,palette)};
  function vehicleBatches(max,isBus=false) {
    return {body:batch(box,white,max,isBus?[0x4ea7ad,0x79ad69]:carPalette),glass:batch(box,glass,max),wheels:batch(wheel,rubber,max*4),head:batch(box,lightMat,max*2),tail:batch(box,tailMat,max*2)};
  }
  const cars=vehicleBatches(260),buses=vehicleBatches(24,true);
  const bikes={body:batch(box,white,80,palette),head:batch(sphere,skin,80),wheels:batch(wheel,rubber,160),frame:batch(box,material(0xd2b665),80),legs:batch(box,dark,160)};
  let agents=[],period='evening',time=0,paused=matchMedia('(prefers-reduced-motion: reduce)').matches,night=true,totals={},focus=[];
  function populate(key) {
    period=key;agents=[];const settings=PERIODS[key],motorOccupied=new Map();
    for(const [kind,target] of Object.entries({person:settings.people,car:settings.cars,bus:key==='night'?8:24,bike:key==='night'?16:80})) {
      const network=networks[kind];
      let sum=0;
      const options=network.edges.filter(e=>e.length>(kind==='bus'?24:kind==='car'?14:3)).map(edge=>{
        const midpoint=sampleEdge(edge,edge.length/2);
        let weight=activityAt(midpoint.x,midpoint.z,sources,settings);
        if(kind==='car'||kind==='bus')weight*=({primary:3,secondary:2.5,tertiary:2,busway:4,service:.2})[edge.tags.highway]||.7;
        sum+=edge.length*weight;return {edge,end:sum,weight};
      });
      if(!sum)continue;
      const motor=kind==='car'||kind==='bus',occupied=motor?motorOccupied:new Map();
      for(let n=0;n<Math.round(target*density);n++) {
        let edge,distance,entry;
        for(let attempt=0;attempt<40;attempt++) {
          const value=rng()*sum;let lo=0,hi=options.length-1;
          while(lo<hi){const mid=(lo+hi)>>1;if(options[mid].end<value)lo=mid+1;else hi=mid;}
          entry=options[lo];edge=entry.edge;distance=rng()*edge.length;
          const gap=kind==='bus'?16:kind==='car'?9:.9;
          if(!(occupied.get(motor?`${edge.from.key}:${edge.to.key}`:edge.id)||[]).some(p=>Math.abs(p-distance)<gap))break;
          edge=null;
        }
        if(!edge)continue;
        const slot=motor?`${edge.from.key}:${edge.to.key}`:edge.id;
        if(!occupied.has(slot))occupied.set(slot,[]);occupied.get(slot).push(distance);
        const base=kind==='person'?.9+rng()*.65:kind==='bike'?3.4+rng()*1.8:kind==='bus'?9:8+rng()*6;
        const offset=kind==='person'?.25+rng()*.32:kind==='bike'?.35:edge.one?0:Math.min(edge.width*.24,2.4);
        const p=sampleEdge(edge,distance,offset);
        agents.push({kind,edge,distance,offset,base,speed:base,phase:rng()*Math.PI*2,scale:.87+rng()*.22,wait:0,x:p.x,y:p.y,z:p.z,yaw:p.yaw,initialWeight:entry.weight});
      }
    }
    totals=Object.fromEntries(['person','car','bus','bike'].map(k=>[k,agents.filter(a=>a.kind===k).length]));
    // Pick a genuinely busy mapped walkway, not a fabricated road coordinate.
    focus=agents.filter(a=>a.kind==='person').sort((a,b)=>b.initialWeight-a.initialWeight).slice(0,30);
    render();return totals;
  }
  function place(mesh,index,a,x,y,z,sx,sy,sz,tilt=0) {
    rotation.setFromAxisAngle(axis,a.yaw);local.set(x,y,z).applyQuaternion(rotation);
    object.position.set(a.x+local.x,a.y+y,a.z+local.z);object.quaternion.copy(rotation);
    if(tilt)object.rotateX(tilt);
    object.scale.set(sx,sy,sz);object.updateMatrix();mesh.setMatrixAt(index,object.matrix);
  }
  function render() {
    const count={person:0,car:0,bus:0,bike:0};
    for(const a of agents) {
      const i=count[a.kind]++;
      if(a.kind==='person') {
        const s=a.scale,swing=Math.sin(a.phase)*.42*Math.min(a.speed,1),bob=Math.abs(Math.sin(a.phase))*.035;
        place(people.body,i,a,0,1.08*s+bob,0,.43*s,.64*s,.25*s);
        place(people.head,i,a,0,1.62*s+bob,0,.145*s,.18*s,.145*s);
        place(people.hair,i,a,0,1.72*s+bob,-.015,.15*s,.095*s,.15*s);
        for(let j=0;j<2;j++) {const side=j?1:-1;place(people.legs,i*2+j,a,side*.115*s,.4*s,side*swing*.25,.14*s,.76*s,.16*s,side*swing);place(people.arms,i*2+j,a,side*.29*s,1.06*s,-side*swing*.23,.13*s,.58*s,.15*s,-side*swing);}
      } else if(a.kind==='bike') {
        place(bikes.body,i,a,0,1.3,0,.42,.6,.27,.22);place(bikes.head,i,a,0,1.78,.12,.16,.17,.16);
        place(bikes.frame,i,a,0,.55,0,.08,.12,1.25);
        for(let j=0;j<2;j++){place(bikes.wheels,i*2+j,a,0,.35,j?.65:-.65,.07,.34,.34);place(bikes.legs,i*2+j,a,j?.13:-.13,.72,Math.sin(a.phase+j*Math.PI)*.15,.13,.55,.15,Math.sin(a.phase+j*Math.PI)*.5);}
      } else {
        const bus=a.kind==='bus',parts=bus?buses:cars,w=bus?2.45:1.8,l=bus?10.5:4.3;
        place(parts.body,i,a,0,bus?1.55:.65,0,w,bus?2.5:1.0,l);
        place(parts.glass,i,a,0,bus?2.0:1.3,bus?.5:-.15,w+.015,bus?.85:.65,bus?l-.6:2.3);
        for(let j=0;j<4;j++)place(parts.wheels,i*4+j,a,(j%2?1:-1)*w*.49,.4,(j<2?1:-1)*l*.32,bus?.25:.2,.38,.38);
        for(let j=0;j<2;j++){place(parts.head,i*2+j,a,(j?1:-1)*w*.32,.73,l*.501,.35,.18,.05);place(parts.tail,i*2+j,a,(j?1:-1)*w*.32,.73,-l*.501,.3,.16,.05);}
      }
    }
    people.body.count=people.head.count=people.hair.count=count.person;people.legs.count=people.arms.count=count.person*2;
    for(const [parts,n] of [[cars,count.car],[buses,count.bus]]){parts.body.count=parts.glass.count=n;parts.wheels.count=n*4;parts.head.count=parts.tail.count=n*2;}
    bikes.body.count=bikes.head.count=bikes.frame.count=count.bike;bikes.wheels.count=bikes.legs.count=count.bike*2;
    allBatches.forEach(m=>{m.instanceMatrix.needsUpdate=true;});
  }
  function update(dt) {
    if(paused||dt<=0)return;
    time+=dt;
    for(const node of networks.car.nodes.values())node.pedestrianOccupied=false;
    for(const a of agents)if(a.edge.crossingController&&a.distance>.1&&a.distance<a.edge.length-.1)a.edge.crossingController.pedestrianOccupied=true;
    traffic.update(time);
    const lanes=new Map();
    const laneKey=(a,edge=a.edge)=>`${a.kind==='car'||a.kind==='bus'?'motor':a.kind}:${edge.from.key}:${edge.to.key}`;
    for(const a of agents) {const key=laneKey(a);if(!lanes.has(key))lanes.set(key,[]);lanes.get(key).push(a);}
    lanes.forEach(list=>list.sort((a,b)=>b.distance-a.distance));
    const gaps=new Map();
    for(const list of lanes.values())for(let i=1;i<list.length;i++)gaps.set(list[i],list[i-1].distance-list[i].distance-({bus:7,car:4,person:.45,bike:1.4})[list[i-1].kind]);
    for(const a of agents) {
      const motor=a.kind==='car'||a.kind==='bus';let desired=a.base;
      const stop=a.kind==='bus'?a.edge.stops?.find(s=>s.id!==a.lastStop&&s.distance>=a.distance-.2):null;
      if(stop){const remaining=stop.distance-a.distance;if(remaining<.6){a.lastStop=stop.id;a.wait=7+rng()*5;a.speed=0;}else desired=Math.min(desired,remaining*.8);}
      if(motor) {
        const limit=Number.parseFloat(a.edge.tags.maxspeed)/3.6;
        if(limit>0)desired=Math.min(desired,limit);
        if(a.edge.tags.highway==='service'||a.edge.tags.highway==='residential')desired=Math.min(desired,6);
        const remaining=a.edge.length-a.distance;
        if(a.distance<=a.edge.stopDistance+.1&&!signalAllows(a.edge,time))desired=Math.min(desired,Math.max(0,(a.edge.stopDistance-a.distance)*.7));
        if(gaps.has(a))desired=Math.min(desired,Math.max(0,(gaps.get(a)-3)*.65));
      }
      const waitingToCross=!motor&&a.edge.crossingController&&a.distance<=.1&&!walkAllows(a.edge.crossingController,time);
      if(waitingToCross)desired=0;
      if(!motor&&gaps.has(a))desired=Math.min(desired,Math.max(0,(gaps.get(a)-.3)*1.8));
      if(a.wait>0){a.wait-=dt;desired=0;}
      a.speed+=(desired-a.speed)*Math.min(1,dt*(desired<a.speed?5:1.4));
      let step=a.speed*dt;
      if(motor&&gaps.has(a))step=Math.min(step,Math.max(0,gaps.get(a)-1.8));
      if(!motor&&gaps.has(a))step=Math.min(step,Math.max(0,gaps.get(a)-.2));
      if(motor&&a.distance<=a.edge.stopDistance+.1&&!signalAllows(a.edge,time))step=Math.min(step,Math.max(0,a.edge.stopDistance-a.distance));
      if(waitingToCross)step=0;
      a.distance+=step;
      if(a.distance>=a.edge.length) {
        const next=chooseNext(a.edge,rng);
        if(next) {
          const list=lanes.get(laneKey(a,next))||[];
          if((!motor&&next.crossingController&&next.crossingController!==a.edge.crossingController&&!walkAllows(next.crossingController,time))||list.some(b=>b!==a&&b.distance<(motor?14:1.1))){a.distance=a.edge.length-.1;a.speed=0;}
          else {a.distance-=a.edge.length;a.edge=next;a.offset=motor?(next.one?0:Math.min(next.width*.24,2.4)):a.offset;if(a.kind==='person'&&rng()<.06)a.wait=1+rng()*4;}
        } else {a.distance=a.edge.length;a.speed=0;}
      }
      const p=sampleEdge(a.edge,a.distance,a.offset);
      const blend=1-Math.exp(-dt*9);a.x+=(p.x-a.x)*blend;a.z+=(p.z-a.z)*blend;a.y+=(p.y-a.y)*blend;
      const turn=Math.atan2(Math.sin(p.yaw-a.yaw),Math.cos(p.yaw-a.yaw));a.yaw+=turn*Math.min(1,dt*5);
      a.phase+=dt*a.speed*(a.kind==='person'?5:2.5);
    }
    render();
  }
  populate(period);
  return {traffic,dispose(){traffic.dispose();scene.remove(group);const materials=new Set();group.traverse(o=>{if(o.material)materials.add(o.material);if(o.isInstancedMesh)o.dispose();});materials.forEach(m=>m.dispose());},update,populate,get totals(){return totals;},get paused(){return paused;},setPaused(value){paused=value;},setNight(value){night=value;lightMat.color.set(night?0xffedbc:0xa6adb0);tailMat.color.set(night?0xff3a24:0x922e22);},focus(){
    const people=agents.filter(a=>a.kind==='person');let best=null,score=-1;
    for(let i=0;i<people.length;i+=4){const a=people[i];let count=0;for(const b of people)if((a.x-b.x)**2+(a.z-b.z)**2<45**2)count++;if(count>score){score=count;best=a;}}
    return best?{x:best.x,y:best.y,z:best.z,yaw:best.yaw}:null;
  }};
}

import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {Line2} from 'three/addons/lines/Line2.js';
import {LineGeometry} from 'three/addons/lines/LineGeometry.js';
import {LineMaterial} from 'three/addons/lines/LineMaterial.js';
import {createSumoRoads} from './2026-11-04-sumo-roads.js';
import {createTwinWorld} from './2026-10-16-twin-world.js';
import {surfaceTexture} from './environment.js';
const $=id=>document.getElementById(id),roadVersion=new URLSearchParams(location.search).get('roads'),laneMode=roadVersion!=='legacy',sourcedMode=laneMode&&roadVersion!=='osm',demandVersion=new URLSearchParams(location.search).get('demand'),sampledMode=sourcedMode&&demandVersion!=='100',prefix=sampledMode?(demandVersion==='70'?'/data/2026-11-05-sumo-demand70/':'/data/2026-11-05-sumo-demand50/'):sourcedMode?'/data/2026-11-05-sourced-sumo/':laneMode?'/data/2026-11-04-lane-sumo/':'/data/2026-11-04-full-sumo/',dated=s=>'2026-11-04-'+s;
const fmt=n=>n.toLocaleString('ko-KR'),clock=t=>t<0?'—':`${String(Math.floor(t/3600)).padStart(2,'0')}:${String(Math.floor(t%3600/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
async function read(url,binary=false){const r=await fetch(url);if(!r.ok)throw Error(`자료를 불러오지 못했습니다 (${r.status}).`);if(r.headers.get('content-type')?.includes('text/html'))throw Error('차량 자료 대신 페이지가 반환됐습니다. 로컬 서버의 자료 경로를 확인하세요.');return binary?r.arrayBuffer():r.json();}
async function gzipJSON(url){const b=await read(url,true),a=new Uint8Array(b);return JSON.parse(a[0]===31&&a[1]===139?await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).text():new TextDecoder().decode(b));}
async function start(){
 const [manifest,geom,tripBuffer]=await Promise.all([read(prefix+dated('progress.json')),read(prefix+dated('geometry.json')),read(prefix+dated('trips.bin'),true)]);
 const trips=new DataView(tripBuffer),count=tripBuffer.byteLength/16;
 if(count!==manifest.counts.mapped)throw Error('통행 건수가 맞지 않습니다.');
 $('total').textContent=fmt(manifest.counts.total);$('mapped').textContent=fmt(count);$('unmapped').textContent=fmt(manifest.counts.noLocation);
 if(manifest.publicReplay){
  document.querySelector('.panel.left p.muted').textContent='공개용 가상 차량 6,000대 · AWS 원본 결과와 다름';
  $('total').parentElement.firstChild.textContent='가상 수요';
  $('mapped').parentElement.firstChild.textContent='실험 투입';
  document.querySelector('a[href*="view=pilot"]').hidden=true;
 }
 if(manifest.sampling){
  document.querySelector('.panel.left p.muted').textContent=`통행 ${Math.round(manifest.sampling.removeFraction*100)}% 무작위 감축 · ${fmt(count)}건으로 SUMO 재계산`;
  $('mapped').parentElement.firstChild.textContent='실험 투입';
  $('mapped').title=`위치 배정 ${fmt(manifest.counts.originalMapped)}건 중 ${fmt(manifest.counts.sampleExcluded)}건 제외`;
 }
 $('vehicle-id').max=count;$('engine').textContent=manifest.engine;
 $('progress').textContent=manifest.runState==='superseded'?'이전 1차로 계산 중단 · 보존된 결과':manifest.complete?(manifest.publicReplay?'공개용 가상 수요 · 06:00–26:00 계산 완료':'하루 전체 계산 완료'):`전체 계산 미완료 · ${clock(manifest.availableEnd-5)}까지 재생 가능`;
 $('refresh').hidden=manifest.complete||manifest.runState==='superseded';
 $('refresh').onclick=()=>location.reload();
 $('assumptions').textContent=manifest.assumptions.join('. ')+'. CSV 도착이 출발보다 이르거나 같은 '+fmt(manifest.counts.nonpositiveCsvDuration)+'건도 출발 시각을 기준으로 입력했습니다.';
 if(!laneMode)document.querySelector('.badge').textContent='이전 1차로 중시적 모형 · 보존된 결과';
 if(laneMode){const audit=await read(prefix+dated('road-audit.json'));document.querySelector('.badge').textContent=sourcedMode?`공식 차로 자료 ${audit.geometryDate} · ${fmt(audit.matchedEdges)}개 구간 대응`:'도로별 차로 적용 · 누락 속성 추정 · 미시적 모형';$('assumptions').textContent+=(sourcedMode?` 표준노드링크와 이름·위치·방향이 대응된 ${fmt(audit.matchedEdges)}개 구간에 공식 차로 수를 적용했습니다. 현장 실측과 동일함을 보증하지 않습니다.`:'')+` 방향별 차로 정보가 부족한 ${fmt(audit.counts['estimated-direction']??0)}개 구간은 1차로 추정값을 유지합니다. 총 차로 수만 있는 양방향 도로는 균등 배분합니다. 실제 신호 주기와 회전 제한은 미확인입니다.`;}
 const scenarioData=new Map(),cache=new Map(),routesCache=new Map();
 let scenario='base',comparison='open',time=27000,playing=false,last=0,selected=null,follow=false,night=false,generation=0,rendered=[],currentFrames=null,loading=null,lastPaint=-1;
 function url(key,file){return prefix+dated(key)+'/'+dated(file);}
 async function data(key){
  if(!scenarioData.has(key))scenarioData.set(key,(async()=>{
   const complete=manifest.scenarios[key].complete,index=await read(url(key,complete?'index.json':'progress-index.json'));
   if(!complete)return {index,metrics:null,status:null};
   const [metrics,status]=await Promise.all([read(url(key,'metrics.bin'),true),read(url(key,'status.bin'),true)]);
   return {index,metrics:new DataView(metrics),status:new Uint8Array(status)};
  })());
  return scenarioData.get(key);
 }
 await Promise.all([data('base'),data('open'),data('close')]);
 const base=await data('base');
 const renderer=new THREE.WebGLRenderer({antialias:true,logarithmicDepthBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));$('app').prepend(renderer.domElement);
 const initialRoads=laneMode?await read(url('base','lanes.json')):null;
 const roadMaterial=new THREE.MeshStandardMaterial({color:0x596873,map:surfaceTexture('asphalt'),roughness:.95});
 roadMaterial.map.anisotropy=8;
 const scene=new THREE.Scene(),world=await createTwinWorld(scene,renderer,{roadMaterial,mainRoadStyle:true,sumoWayIds:initialRoads?new Set(initialRoads.sourceWayIds):null}),camera=new THREE.PerspectiveCamera(44,innerWidth/innerHeight,.25,180000);
 const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=12;controls.maxDistance=45000;controls.maxPolarAngle=Math.PI*.48;
 const roadLayer=laneMode?createSumoRoads(scene,roadMaterial):null;if(roadLayer)roadLayer.replace(initialRoads);
 const roadCache=new Map(initialRoads?[['base',initialRoads]]:[]);
 const overlay=new THREE.Group();scene.add(overlay);
 const capacity=Math.max(...Object.values(manifest.scenarios).map(s=>s.maxActive))+1;
 function box(w,h,d,x=0,y=0,z=0){const b=new THREE.BoxGeometry(w,h,d);b.translate(x,y,z);return b;}
 function part(g,mat){const m=new THREE.InstancedMesh(g,mat,capacity);m.count=0;m.frustumCulled=false;m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(m);return m;}
 const body=part(mergeGeometries([box(1.8,1,4.3,0,.65,0),box(1.6,.5,2.3,0,1.28,-.15)]),new THREE.MeshStandardMaterial({color:0xffffff,roughness:.7}));
 body.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(capacity*3).fill(1),3);
 const windows=part(mergeGeometries([box(.03,.28,1.7,-.82,1.27,-.25),box(.03,.28,1.7,.82,1.27,-.25),box(1.4,.28,.03,0,1.27,.95),box(1.4,.28,.03,0,1.27,-1.45)]),new THREE.MeshStandardMaterial({color:0x87a8b6}));
 const wheels=[];for(const x of [-.92,.92])for(const z of [-1.35,1.35]){const g=new THREE.CylinderGeometry(.34,.34,.2,8);g.rotateZ(Math.PI/2);g.translate(x,.36,z);wheels.push(g);}
 const tires=part(mergeGeometries(wheels),new THREE.MeshStandardMaterial({color:0x14202a}));
 const carPalette=[0xe2e6e3,0xa8b6c0,0x243442,0x535b62,0xd1d3ca,0x963d35];
 const dummy=new THREE.Object3D(),color=new THREE.Color(),projection=new THREE.Vector3(),tracked=new THREE.Vector3();
 function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);overlay.traverse(o=>o.material?.resolution?.set(innerWidth,innerHeight));}
 addEventListener('resize',resize);resize();
 function view(x,z,span=1600){follow=false;$('follow').setAttribute('aria-pressed','false');controls.target.set(x,0,z);camera.position.set(x+span*.24,span*.72,z+span*.75);controls.update();}
 view(0,0,1400);
 function row(id){const p=id*16;return {depart:trips.getUint32(p,true),arrival:trips.getUint32(p+4,true),a:trips.getUint16(p+8,true),b:trips.getUint16(p+10,true),mode:trips.getUint8(p+12),origin:trips.getUint8(p+13),dest:trips.getUint8(p+14)};}
 function metric(d,id){return d.metrics?{depart:d.metrics.getFloat32(id*16,true),arrival:d.metrics.getFloat32(id*16+4,true),duration:d.metrics.getFloat32(id*16+8,true),distance:d.metrics.getFloat32(id*16+12,true),status:d.status[id]}:{depart:-1,arrival:-1,duration:-1,distance:-1,status:5};}
 const statusName=['미진입','경로 없음','미진입','종료 시 미도착','도착','계산 중'];
 function line(points,col,width){if(points.length<2)return;const g=new LineGeometry();g.setPositions(points.flatMap(p=>[p[0],.7,p[1]]));const m=new LineMaterial({color:col,linewidth:width,toneMapped:false});m.resolution.set(innerWidth,innerHeight);const l=new Line2(g,m);overlay.add(l);}
 function newRoad(a,b){
  const [x,z]=a,[tx,tz]=b,length=Math.hypot(tx-x,tz-z);
  const surface=new THREE.Mesh(new THREE.BoxGeometry(7,.12,length),new THREE.MeshStandardMaterial({color:0x424d52,roughness:1}));
  surface.position.set((x+tx)/2,.16,(z+tz)/2);surface.rotation.y=Math.atan2(tx-x,tz-z);overlay.add(surface);
  for(let d=5;d<length;d+=12){const dash=new THREE.Mesh(new THREE.BoxGeometry(.14,.04,4),new THREE.MeshBasicMaterial({color:0xf5e9b5}));dash.position.set(x+(tx-x)*d/length,.25,z+(tz-z)*d/length);dash.rotation.y=surface.rotation.y;overlay.add(dash);}
 }
 async function route(key,r){const k=key+':'+r.a;if(!routesCache.has(k))routesCache.set(k,gzipJSON(url(key,`routes-${r.a}.json.gz`)));return (await routesCache.get(k))[r.b]||[];}
 function edge(id){if(typeof id==='number')return geom.edges[id];const [,a,b]=id.match(/new(\d+)_(\d+)/)||[];return a?[+a,+b,0,[geom.vertices[a],geom.vertices[b]]]:null;}
 async function showSelection(){
  const id=selected,g=generation;overlay.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});overlay.clear();
  if(scenario!=='base'){
   const pair=scenario==='open'?[1529,1531]:[1529,1530],points=pair.map(v=>geom.points[geom.vertices[v]]);
   if(scenario==='open'&&!laneMode)newRoad(...points);
   line(points,scenario==='open'?0xa2f1c9:0xf05164,scenario==='open'?3:8);
  }
  if(id===null)return;
  const r=row(id),old=metric(base,id),changedData=await data(comparison),changed=metric(changedData,id);
  if(id!==selected||g!==generation)return;
  $('vehicle-id').value=id+1;$('jump').disabled=false;
  $('vehicle-info').textContent=`차량 ${fmt(id+1)} · ${manifest.regions[r.origin]} → ${manifest.regions[r.dest]} · ${manifest.publicReplay?'가상 시각':'CSV'} ${clock(r.depart)} → ${clock(r.arrival)} · 수단 코드 ${r.mode}`;
  const duration=m=>m.status===4?Math.round(m.duration)+'초':statusName[m.status];
  $('old-duration').textContent=duration(old);$('new-duration').textContent=duration(changed);
  let diff=old.status===4&&changed.status===4?`통행시간 ${Math.round(changed.duration-old.duration)}초 변화`:`기존 ${statusName[old.status]} / 변경 ${statusName[changed.status]}`;
  $('vehicle-diff').textContent=diff+` · SUMO 도착 ${clock(old.arrival)} → ${clock(changed.arrival)}`;
  try{
   const [a,b]=await Promise.all([route('base',r),route(comparison,r)]);if(id!==selected||g!==generation)return;
   const points=path=>path.flatMap(e=>{const v=edge(e);return v?v[3].map(p=>geom.points[p]):[];});
   line(points(a),0x4f9bff,4);if(scenario!=='base')line(points(b),0xff984d,3);
   const fork=a.findIndex((e,i)=>e!==b[i]);if(fork>=0&&b.length)$('vehicle-diff').textContent+=` · 교차로 ${edge(a[fork])[0]}에서 경로 분기`;
  }catch(e){$('message').textContent='차량 재생은 가능하지만 선택 경로를 불러오지 못했습니다.';}
 }
 async function block(key,number){
  const token=key+':'+number;
  if(!cache.has(token)){const d=await data(key),chunk=d.index.chunks.find(c=>c.frames.length&&Math.floor(c.frames[0][0]/300)===number);if(!chunk)return null;cache.set(token,read(prefix+dated(key)+'/'+chunk.file,true).then(b=>({view:new DataView(b),frames:chunk.frames})).catch(e=>{cache.delete(token);throw e;}));}
  const result=await cache.get(token);for(const k of cache.keys())if(k!==token&&(!k.startsWith(key+':')||Math.abs(+k.split(':')[1]-number)>1))cache.delete(k);return result;
 }
 async function framesAt(key,t){
  const f=Math.floor(t/5)*5,first=await block(key,Math.floor(f/300)),next=await block(key,Math.floor((f+5)/300));
  const take=(b,stamp)=>{if(!b)return null;const info=b.frames.find(x=>x[0]===stamp);if(!info)return null;return {v:b.view,start:info[1]+8,count:info[2],t:stamp};};
  const a=take(first,f),b=take(next,f+5);if(!a)return null;
  const lookup=new Map();if(b)for(let i=0;i<b.count;i++)lookup.set(b.v.getUint32(b.start+i*16,true),b.start+i*16);
  return {a,b,lookup,key};
 }
 function paint(){
  if(!currentFrames)return;
  const {a,b,lookup}=currentFrames,blend=Math.max(0,Math.min(1,(time-a.t)/5));let detailed=0;rendered=[];
  // Metre-scale vehicles must fit their SUMO lanes at every camera distance.
  for(let i=0;i<a.count;i++){
   const p=a.start+i*16,v=a.v,id=v.getUint32(p,true),q=lookup.get(id);
   let x=v.getFloat32(p+4,true),z=v.getFloat32(p+8,true),speed=v.getUint16(p+12,true)/100,angle=v.getUint16(p+14,true)/100,motion=null;
   if(q!==undefined){const dx=b.v.getFloat32(q+4,true)-x,dz=b.v.getFloat32(q+8,true)-z;motion=Math.hypot(dx,dz)/5;x+=dx*blend;z+=dz*blend;speed+=(b.v.getUint16(q+12,true)/100-speed)*blend;angle+=((b.v.getUint16(q+14,true)/100-angle+540)%360-180)*blend;}
   // FCD coordinates denote the front bumper. Shift the model centre backwards.
   const theta=angle*Math.PI/180;x-=Math.sin(theta)*2.15;z+=Math.cos(theta)*2.15;
   rendered.push({id,x,z,speed,motion});dummy.position.set(x,.3,z);dummy.rotation.set(0,Math.PI-theta,0);dummy.scale.setScalar(1);dummy.updateMatrix();body.setMatrixAt(i,dummy.matrix);body.setColorAt(i,color.setHex(id===selected?0xffca43:carPalette[id%carPalette.length]));
   if(Math.hypot(x-camera.position.x,z-camera.position.z)<2000){windows.setMatrixAt(detailed,dummy.matrix);tires.setMatrixAt(detailed,dummy.matrix);detailed++;}
  }
  body.count=a.count;windows.count=tires.count=detailed;for(const m of [body,windows,tires])m.instanceMatrix.needsUpdate=true;body.instanceColor.needsUpdate=true;
  $('active').textContent=fmt(a.count);$('clock').textContent=clock(time);$('timeline').value=Math.floor(time);
  const car=rendered.find(c=>c.id===selected);
  $('live-state').textContent=selected===null?'':car?laneMode?`SUMO 속도 ${(car.speed*3.6).toFixed(1)} km/h · ${car.speed<.1?'대기 / 정차':'이동 중'}`:car.motion===null?'다음 위치 출력 없음':`표시 이동 속도 ${(car.motion*3.6).toFixed(1)} km/h · ${car.motion<.1?'대기 / 정차':'이동 중'} (5초 위치 변화 기준)`:'현재 시각에는 도로 위에 표시되지 않습니다.';
  $('live-state').title=laneMode?'SUMO 미시적 모형이 계산한 순간 속도입니다. 5초 출력 사이를 보간합니다.':car?`SUMO 중시적 모형의 원본 속도 출력: ${(car.speed*3.6).toFixed(1)} km/h. 대기열 내부에서는 위치 변화 속도와 다를 수 있습니다.`:'';
  if(follow&&car){const p=new THREE.Vector3(car.x,0,car.z),delta=p.clone().sub(tracked);camera.position.add(delta);controls.target.add(delta);tracked.copy(p);}
 }
 function stop(){playing=false;$('play').textContent='재생';}
 async function seek(t){stop();time=t;const g=++generation;$('message').textContent='해당 시각의 차량을 불러오는 중…';try{const frames=await framesAt(scenario,time);if(g!==generation)return;currentFrames=frames;paint();$('message').textContent=frames?'':'이 시각의 출력이 없습니다.';}catch(e){if(g===generation)$('message').textContent=e.message;}}
 async function switchScenario(key){
  stop();scenario=key;const d=await data(key);
  if(roadLayer){if(!roadCache.has(key))roadCache.set(key,await read(url(key,'lanes.json')));roadLayer.replace(roadCache.get(key));}$('timeline').max=manifest.availableEnd-5;
  $('before').setAttribute('aria-pressed',String(key==='base'));$('after').setAttribute('aria-pressed',String(key!=='base'));
  const s=d.index.stats;$('scenario-summary').textContent=d.index.complete?`실제 진입 ${fmt(s.arrived+s.unfinished)} · 도착 ${fmt(s.arrived)} · 미진입 ${fmt(s.notInserted)} · 종료 시 미도착 ${fmt(s.unfinished)} · 경로 없음 ${fmt(s.noRoute)}`:`${clock(s.at??21600)} 중간 집계 · 도착 ${fmt(s.arrived)} · 운행 ${fmt(s.unfinished)} · 출발 대기 ${fmt(s.waiting)} · 대기 초과 미진입 ${fmt(s.notInserted)}`;
  await seek(Math.min(time,manifest.availableEnd-5));await showSelection();
 }
 $('scenario').onchange=async e=>{comparison=e.target.value;await switchScenario(e.target.value);};
 $('before').onclick=()=>switchScenario('base');$('after').onclick=()=>switchScenario(comparison);
 $('timeline').oninput=e=>seek(+e.target.value);$('reset').onclick=()=>seek(21600);
 $('play').onclick=()=>{if(playing)return stop();playing=true;last=performance.now();$('play').textContent='일시정지';};
 async function choose(id){if(!Number.isInteger(id)||id<0||id>=count){$('message').textContent='차량 번호는 1부터 '+fmt(count)+'까지입니다.';return;}selected=id;await showSelection();paint();}
 $('vehicle-form').onsubmit=e=>{e.preventDefault();choose(+$('vehicle-id').value-1);};
 $('pick-active').onclick=()=>{const candidate=rendered.reduce((best,c)=>!best||Math.hypot(c.x-controls.target.x,c.z-controls.target.z)<Math.hypot(best.x-controls.target.x,best.z-controls.target.z)?c:best,null);if(candidate)choose(candidate.id);};
 $('jump').onclick=async()=>{if(selected===null)return;const r=row(selected),m=metric(await data(scenario),selected);await seek(Math.min(+$('timeline').max,Math.max(21600,m.depart>=0?Math.ceil(m.depart/5)*5:r.depart)));const c=rendered.find(c=>c.id===selected);const p=c?[c.x,c.z]:geom.points[geom.vertices[geom.endpoints[r.a].vertex]];view(...p,130);};
 $('toggle-panels').onclick=()=>{const hidden=document.body.classList.toggle('panels-collapsed');$('toggle-panels').textContent=hidden?'패널 펼치기':'패널 접기';$('toggle-panels').setAttribute('aria-pressed',String(hidden));};
 $('multilane').hidden=!laneMode;
 $('multilane').onclick=()=>{const lanes=roadCache.get(scenario).lanes.filter(l=>l.index>0&&(!sourcedMode||l.laneSource==='official-spatial-match'));const lane=lanes.reduce((best,l)=>{const p=l.centerline[Math.floor(l.centerline.length/2)],d=Math.hypot(p[0]-controls.target.x,p[1]-controls.target.z);return !best||d<best.d?{l,p,d}:best;},null);if(lane){view(...lane.p,180);$('message').textContent=sourcedMode?'표준노드링크 차로 수 적용 구간 · 차로 폭은 추정값입니다.':'';}};
 $('overview').onclick=()=>view(0,0,1700);$('road-change').onclick=()=>view(...geom.points[geom.vertices[1529]],450);
 $('near').onclick=()=>{const c=rendered.find(c=>c.id===selected)||rendered.reduce((a,b)=>!a||Math.hypot(b.x-controls.target.x,b.z-controls.target.z)<Math.hypot(a.x-controls.target.x,a.z-controls.target.z)?b:a,null);if(c){choose(c.id);view(c.x,c.z,90);}else view(controls.target.x,controls.target.z,90);};
 $('moving').onclick=()=>{const c=rendered.filter(c=>c.motion>.5).reduce((a,b)=>!a||Math.hypot(b.x-controls.target.x,b.z-controls.target.z)<Math.hypot(a.x-controls.target.x,a.z-controls.target.z)?b:a,null);if(c){choose(c.id);view(c.x,c.z,180);}else $('message').textContent='현재 출력 구간에 이동 중인 차량이 없습니다.';};
 $('follow').onclick=()=>{const c=rendered.find(c=>c.id===selected);if(!c){$('message').textContent='현재 운행 중인 차량을 먼저 선택하세요.';return;}follow=!follow;tracked.set(c.x,0,c.z);$('follow').setAttribute('aria-pressed',String(follow));};
 $('night').onclick=()=>{night=!night;world.setNight(night);$('night').setAttribute('aria-pressed',String(night));};
 let down=null;renderer.domElement.onpointerdown=e=>{down=[e.clientX,e.clientY];};renderer.domElement.onpointerup=e=>{if(!down||e.button||Math.hypot(e.clientX-down[0],e.clientY-down[1])>4)return;let best=null,dist=16;for(const car of rendered){projection.set(car.x,2,car.z).project(camera);if(Math.abs(projection.z)>1)continue;const d=Math.hypot((projection.x+1)*innerWidth/2-e.clientX,(1-projection.y)*innerHeight/2-e.clientY);if(d<dist){best=car;dist=d;}}if(best)choose(best.id);};
 await switchScenario('base');$('loading').remove();
 let lastRender=0;
 renderer.setAnimationLoop(now=>{
  if(now-lastRender<33)return;lastRender=now;
  if(document.hidden){last=now;return;}
  if(playing&&!loading){const next=Math.min(+$('timeline').max,time+Math.min((now-last)/1000,.1)*+$('rate').value);if(!currentFrames||Math.floor(next/5)*5!==currentFrames.a.t){const g=generation,key=scenario;loading=framesAt(key,next).then(f=>{if(g===generation){currentFrames=f;time=next;}}).catch(e=>{stop();$('message').textContent=e.message;}).finally(()=>{loading=null;last=performance.now();});}else time=next;if(time>=+$('timeline').max)stop();}
  last=now;if(now-lastPaint>45){paint();lastPaint=now;}
  controls.update();world.update(camera,controls.target,false);renderer.render(scene,camera);$('altitude').textContent='관찰 높이 '+fmt(Math.round(camera.position.y))+' m';
 });
}
start().catch(e=>{$('loading').textContent=e.message+' 전체 자료 계산이 끝난 뒤 새로고침해 주세요.';console.error(e);});

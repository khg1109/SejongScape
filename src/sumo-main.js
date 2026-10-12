import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {project,buildingHeight} from './map.js';
import {sampleFrame,trafficStats} from './sumo-model.js';
import './sumo.css';
import {mountScenarioPanel} from './sumo-scenario-panel.js';
document.querySelector('#app').innerHTML=`<main id="view" aria-label="SUMO 교통 시뮬레이션 지도"></main><header><a href="/">S · SEJONGSCAPE</a><a href="/traffic">실제 교통정보 ↗</a><a href="/">도시 지도로 돌아가기 ↗</a></header><section class="panel"><div class="kicker">SUMO 교통 실험</div><h1>도로 위의 흐름을<br>살펴보세요.</h1><p id="area">세종 시범 구간을 불러오는 중</p><div class="badge">시뮬레이션 · 실시간 교통정보 아님</div><dl><div><dt>운행 중 차량</dt><dd id="count">—</dd></div><div><dt>평균 속도</dt><dd><span id="speed">—</span><small> km/h</small></dd></div><div><dt>정지 차량</dt><dd id="stopped">—</dd></div></dl><p class="note">세종의 지도 도로망 위에서 SUMO가 계산한 차량 움직임입니다. 교통량과 신호 주기는 실측 자료로 보정하지 않았습니다.</p><div class="actions"><button id="focus">차량 가까이 보기</button><button id="overview">전체 구간</button></div><details><summary>자료와 재현 범위</summary><p id="metadata"></p><p>차량 위치·속도·신호 상태는 동일한 SUMO 실행 결과입니다. 수요는 임의 생성, 신호 계획은 SUMO 추정값입니다. 건물 높이 일부와 지형은 단순화했습니다. 실측 교통량, 실제 신호 주기, 버스 노선은 미연동입니다.</p><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors · ODbL</a></details></section><section class="playbar" aria-label="시뮬레이션 재생"><button id="play" disabled>재생</button><button id="restart" disabled>처음으로</button><label>재생 속도 <select id="rate"><option value="1">1배</option><option value="2">2배</option><option value="5">5배</option></select></label><label class="timeline">시뮬레이션 경과 <input id="seek" type="range" min="0" max="599" value="0" step="1" disabled></label><output id="time">00:00 / 10:00</output></section><div id="status" role="status">SUMO 결과를 불러오는 중입니다…</div><div class="legend"><span>● <b>차량</b> 민트</span><span>● <b>정지 차량</b> 주황</span><span>신호등 색상 = 시뮬레이션 상태</span><span>드래그 회전 · 휠 확대 · 우클릭 이동</span></div>`;
const $=s=>document.querySelector(s);
mountScenarioPanel();
async function start(){
 const results=await Promise.all(['/data/sumo-pilot.json','/data/sejong.json'].map(async url=>{const r=await fetch(url);if(!r.ok)throw Error('자료 응답 '+r.status);return r.json();}));const[data,map]=results;
 if(!data.frames?.length)throw Error('시뮬레이션 프레임이 없습니다.');
 $('#area').textContent=data.meta.area;$('#metadata').textContent=`${data.meta.version} / 지도 수집 ${data.meta.mapDate.slice(0,10)} / ${data.meta.laneCount}개 차로 / 신호 제어 지점 ${data.meta.signalControllers}곳 / 임의 수요: ${data.meta.departurePeriodSeconds}초당 출발 시도 1회 / 준비 운행 120초 이후 10분 재생`;
 const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);$('#view').append(renderer.domElement);
 const scene=new THREE.Scene();scene.background=new THREE.Color('#14252c');scene.add(new THREE.HemisphereLight(0xdffbff,0x415d55,2.5));const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(-800,1400,700);scene.add(sun);
 const camera=new THREE.PerspectiveCamera(45,innerWidth/innerHeight,1,25000);const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.maxPolarAngle=Math.PI/2-.04;controls.minDistance=20;controls.maxDistance=8000;
 const bounds=new THREE.Box3();const pieces=[];
 for(const road of data.roads){for(let i=1;i<road.shape.length;i++){const[a,b]=[road.shape[i-1],road.shape[i]],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(!len)continue;const g=new THREE.BoxGeometry(road.width,.1,len+.1);g.rotateY(Math.atan2(dx,dz));g.translate((a[0]+b[0])/2,.12,(a[1]+b[1])/2);pieces.push(g);bounds.expandByPoint(new THREE.Vector3(...[a[0],0,a[1]]));}}
 const roadMesh=new THREE.Mesh(mergeGeometries(pieces),new THREE.MeshStandardMaterial({color:0x556974,roughness:1}));scene.add(roadMesh);pieces.forEach(g=>g.dispose());
 const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());const land=new THREE.Mesh(new THREE.PlaneGeometry(16000,16000),new THREE.MeshStandardMaterial({color:0x203a3b}));land.rotation.x=-Math.PI/2;land.position.y=-.2;scene.add(land);
 const buildingGeos=[];
 for(const e of map.elements){if(!e.tags?.building||e.geometry?.length<4)continue;const points=e.geometry.map(p=>project(p,map.center));const shape=new THREE.Shape(points.map(p=>new THREE.Vector2(p[0],-p[1])));const g=new THREE.ExtrudeGeometry(shape,{depth:buildingHeight(e.tags).value,bevelEnabled:false});g.rotateX(-Math.PI/2);buildingGeos.push(g);}
 if(buildingGeos.length){scene.add(new THREE.Mesh(mergeGeometries(buildingGeos),new THREE.MeshStandardMaterial({color:0x38525c,roughness:.9,transparent:true,opacity:.38,depthWrite:false})));buildingGeos.forEach(g=>g.dispose());}
 const max=Math.max(...data.frames.map(f=>f.vehicles.length),1),cars=new THREE.InstancedMesh(new THREE.BoxGeometry(1.8,1.5,4.5),new THREE.MeshStandardMaterial({color:0xffffff,roughness:.45}),max);cars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);cars.frustumCulled=false;scene.add(cars);
 const lamps=new THREE.InstancedMesh(new THREE.SphereGeometry(1.1,8,6),new THREE.MeshBasicMaterial({color:0xffffff}),data.signals.length);scene.add(lamps);const obj=new THREE.Object3D();data.signals.forEach((s,i)=>{obj.position.set(s.point[0],4,s.point[1]);obj.rotation.set(0,0,0);obj.updateMatrix();lamps.setMatrixAt(i,obj.matrix);});
 let time=0,playing=false,last=performance.now(),current=[];const end=data.frames.length-1;$('#seek').max=end;
 function overview(){controls.target.copy(center);const distance=Math.max(size.x,size.z);camera.position.copy(center).add(new THREE.Vector3(distance*.25,distance*.85,distance*.6));controls.update();}
 $('#overview').onclick=overview;overview();
 $('#focus').onclick=()=>{const v=current.find(v=>v[4]>1)||current[0];if(!v)return;controls.target.set(v[1],0,v[2]);camera.position.set(v[1]+15,200,v[2]+45);controls.update();};
 function playLabel(){$('#play').textContent=playing?'일시정지':'재생';$('#play').setAttribute('aria-pressed',String(playing));}
 $('#play').onclick=()=>{if(time>=end)time=0;playing=!playing;playLabel();};$('#restart').onclick=()=>{time=0;playing=false;playLabel();};$('#seek').oninput=e=>{time=Number(e.target.value);};
 for(const id of ['play','restart','seek'])$('#'+id).disabled=false;$('#status').hidden=true;
 const mint=new THREE.Color(0x6bf0c4),orange=new THREE.Color(0xffb16c),signalColors={r:0xff5c61,y:0xffdc6a,g:0x55eea3,G:0x55eea3,o:0x657b82,O:0x657b82};
 function clock(t){return Math.floor(t/60).toString().padStart(2,'0')+':'+Math.floor(t%60).toString().padStart(2,'0');}
 function animate(now){requestAnimationFrame(animate);const dt=Math.min(.1,(now-last)/1000);last=now;if(playing&&!document.hidden){time=Math.min(end,time+dt*Number($('#rate').value));if(time>=end){playing=false;playLabel();}}
 current=sampleFrame(data,time);cars.count=current.length;current.forEach((v,i)=>{obj.position.set(v[1],.95,v[2]);obj.rotation.set(0,-v[3]*Math.PI/180,0);obj.updateMatrix();cars.setMatrixAt(i,obj.matrix);cars.setColorAt(i,v[4]<.1?orange:mint);});cars.instanceMatrix.needsUpdate=true;if(cars.instanceColor)cars.instanceColor.needsUpdate=true;
 const states=data.frames[Math.floor(time)].signals;data.signals.forEach((s,i)=>lamps.setColorAt(i,new THREE.Color(signalColors[states[s.tls]?.[s.index]]||0x657b82)));if(lamps.instanceColor)lamps.instanceColor.needsUpdate=true;
 const stats=trafficStats(current);$('#count').textContent=stats.count;$('#speed').textContent=stats.meanKmh.toFixed(1);$('#stopped').textContent=stats.stopped;$('#seek').value=time;$('#time').textContent=clock(time)+' / '+clock(end);controls.update();renderer.render(scene,camera);
 }requestAnimationFrame(animate);
 addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
}
start().catch(e=>{$('#status').textContent='SUMO 결과를 불러오지 못했습니다. 새로고침해 주세요.';console.error(e);});

import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {TripDay,dayClock} from './2026-10-16-trip-day-model.js';
import {MODE_COLORS,clock} from './2026-10-16-trip-model.js';
import {loadTripDispersal} from './2026-10-16-trip-dispersal.js';
import {createTwinWorld} from './2026-10-16-twin-world.js';
import {createTwinVehicles} from './2026-10-16-twin-vehicles.js';
import {routePose} from './2026-10-16-twin-geometry.js';
import './2026-10-16-trip-3d.css';

const $=s=>document.querySelector(s),fmt=n=>n.toLocaleString('ko-KR');
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
document.title='CSV 통행 재생 | SejongScape';
$('#app').innerHTML=`<main id="view" aria-label="CSV 개인별 통행 3D 지도"></main><header><a href="/">S · SEJONGSCAPE</a><a href="/traffic">실제 교통정보 ↗</a><a href="/">도시 지도로 돌아가기 ↗</a></header>
<section class="panel csv-panel"><div class="kicker">SEJONG · DIGITAL CITY</div><h1>도시의 길 위에,<br>하루의 움직임.</h1><p class="note">260316 - Mode&amp;Purpose.csv<br><span id="csv-source-total">전체 자료를 불러오는 중</span></p><div class="badge">원본 시간·목적·코드 / 도로 경로는 추정</div>
<dl><div><dt>통행 중 · 현재 조건</dt><dd id="csv-active">—</dd></div><div><dt>지도에 표시</dt><dd id="csv-drawn">—</dd></div><div><dt>같은 지역 · 표시 포함</dt><dd id="csv-same">—</dd></div><div><dt>외부 포함·위치 없음</dt><dd id="csv-external">—</dd></div></dl>
<fieldset style="border:0;padding:0;margin:0"><legend style="font-size:12px">이동수단 코드 · 원본 숫자</legend><div class="csv-modes">${Object.entries(MODE_COLORS).map(([m,c])=>`<label style="color:${c}"><input type="checkbox" value="${m}" data-mode checked>${m}</label>`).join('')}</div></fieldset>
<div class="csv-fields"><label>출발 지역<select id="csv-origin"><option value="">전체</option></select></label><label>도착 지역<select id="csv-destination"><option value="">전체</option></select></label><label>통행 목적<select id="csv-purpose"><option value="">전체</option></select></label></div>
<label style="display:flex;gap:8px;align-items:center;margin-bottom:12px"><input id="csv-local-only" type="checkbox">같은 동·읍·면 안의 이동만</label>
<label for="csv-person-id">개인 ID · 하루 통행 조회</label><form class="csv-person-form"><input id="csv-person-id" type="number" min="1" step="1" placeholder="예: 1"><button disabled id="csv-find">조회</button></form>
<div class="actions"><button id="csv-reset" disabled>전체 통행으로</button><button id="csv-focus" disabled>통행 가까이</button><button id="csv-overview" disabled>세종시 전체</button></div>
<p class="note">출발·도착은 지역별 24개 도로 지점에 분산합니다. 같은 지역 안의 이동도 포함하며, 지점과 경로는 추정값입니다. 마커는 겹칠 수 있습니다. 가까이서는 차량 모형, 멀리서는 숫자 코드별 점으로 표현합니다.</p>
<div class="csv-chart" aria-label="전체 자료의 시간대별 출발 통행량"></div>
<details><summary>원본과 추정 범위</summary><p>원본의 개인 ID, 출발·도착 시간, 지역, 목적, 수단 코드를 그대로 사용합니다. 파일 이름을 관측 날짜로 해석하지 않습니다.</p><p>실제 도로 경로와 상세 위치는 원본에 없습니다. OSM 지역 경계 안의 도로 지점을 지역마다 24곳씩 골라 개인별 출발·도착을 고정 배정합니다. 연속 통행에서 이전 도착 지역과 다음 출발 지역이 같으면 같은 지점을 이어 씁니다. 같은 지역 내 이동은 해당 경계 안의 도로를 사용하고, 지역 간 이동은 방향을 반영한 최단거리 도로를 사용합니다. 원본 소요시간에 맞춰 이동하며 상세 주소를 복원한 것은 아닙니다. SUMO 실행 결과가 아니며 신호·정체·회전 제한·수단별 도로 제한은 반영하지 않습니다.</p><p>세종시 외부 포함 통행은 외부 상세 위치가 없어 개별 조회 내역과 통계로 표시합니다. OSM 경계 기준이며 CSV의 지역 구분 시점과 차이가 있을 수 있습니다. 0분 통행은 이동 재생에서 제외합니다. 건물은 OSM 외곽선 기반이며 높이 미기록 시 층수 × 3.2m 또는 용도별 추정값을 사용합니다. 창문·외장·옥상 설비·수목 배치·차선 도색은 시각적 재현입니다. 지형 고도·사진 기반 실사 모델은 포함하지 않습니다. 차량 모형은 통행을 표시하는 공통 기호이며 수단 코드를 자동차로 분류한 것이 아닙니다.</p><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors · ODbL</a></details></section>
<nav class="twin-tools" aria-label="도시 보기"><div class="twin-tools-title">도시 둘러보기</div><button id="twin-center">도심 조감</button><button id="twin-street" disabled>도로 가까이</button><button id="twin-lake">호수공원</button><button id="twin-follow" disabled>선택 통행 따라가기</button><button id="twin-night" aria-pressed="false">야간 보기</button><small>지도 기반 3D · 세부 외관 추정</small><small id="twin-view-scale"></small></nav><div class="csv-legend">${Object.entries(MODE_COLORS).map(([m,c])=>`<span><i style="background:${c}"></i>${m}</span>`).join('')}</div><button class="csv-compact">설정 접기</button>
<aside class="csv-info" hidden><button class="csv-close" aria-label="개인 정보 닫기">×</button><h2 id="csv-person-title"></h2><p id="csv-person-meta"></p><div class="csv-chain"></div><p class="csv-source" id="csv-route-description"></p></aside>
<div class="csv-help">드래그 회전 · 휠 확대 · 우클릭 이동 · 통행 마커 클릭</div>
<section class="playbar csv-bar" aria-label="CSV 하루 통행 재생"><button id="csv-play" disabled>재생</button><button id="csv-start" disabled>하루 처음</button><label>재생 속도 <select id="csv-rate"><option value="1">1배 · 실제 시간</option><option value="10">10배</option><option value="60" selected>60배</option><option value="300">300배</option><option value="900">900배</option></select></label><label class="timeline">하루 시각 <input id="csv-seek" type="range" min="0" max="1440" step="0.01" value="448" disabled></label><output id="csv-clock">07:28:00</output><div class="csv-footnote">00:00–24:00 · 원본 출발 시각에 나타나고 도착 시각에 사라집니다 · 차량 모형은 통행 기호 · 수단 종류는 원본 숫자 코드</div></section><div id="status" class="csv-loading" role="status">세종시 도로와 CSV 자료를 불러오는 중…</div><div class="csv-toast" role="status" hidden></div>`;

async function get(url,type='json'){const r=await fetch(url);if(!r.ok)throw Error(`자료 응답 ${r.status}`);return type==='json'?r.json():r.arrayBuffer();}
async function start(){
 const [manifest,geo,city,dispersal]=await Promise.all([get('/data/2026-10-16-trips/2026-10-16-manifest.json'),get('/data/2026-10-16-trips/2026-10-16-routes.json'),get('/data/2026-10-16-trip-city.json'),loadTripDispersal()]);
 const day=new TripDay(manifest);
 if(manifest.publicReplay){
  document.querySelector('.csv-panel > .note').innerHTML='공개용 가상 통행 · AWS 연결 없음<br><span id="csv-source-total">자료를 불러오는 중</span>';
  document.querySelector('.csv-panel .badge').textContent='50명 이상 집계 기반 · 개인 기록 없음';
  document.querySelector('label[for="csv-person-id"]').textContent='가상 통행 번호 조회';
  document.querySelector('.csv-panel details').innerHTML='<summary>공개 데이터의 범위</summary><p>50명 이상이 포함된 지역·시간대·수단별 인원수를 50명 단위로 내림한 집계에서 만든 가상 통행입니다. ID, 시각, 소요시간은 새로 생성했습니다. 개인별 이동 연결·성별·연령·거주지·목적은 포함하지 않습니다. 실제 개인 기록이나 AWS 원본과 같은 통행량을 나타내지 않습니다. 도로 위치·경로는 추정이며 SUMO 결과는 별도 화면에서 확인합니다.</p><a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors · ODbL</a>';
  document.querySelector('.csv-footnote').textContent='00:00–24:00 · 공개용 가상 통행 · 개인의 실제 이동 기록 아님';
 }

 for(const name of ['origin','destination'])$('#csv-'+name).insertAdjacentHTML('beforeend',manifest.regions.map((s,i)=>`<option value="${i}">${escape(s)}</option>`).join(''));
 $('#csv-purpose').insertAdjacentHTML('beforeend',manifest.purposes.map((s,i)=>`<option value="${i}">${escape(s)}</option>`).join(''));
 const highest=Math.max(...manifest.hourly);$('.csv-chart').innerHTML=manifest.hourly.map((n,h)=>`<span style="height:${n/highest*24}px" title="${h}시 출발 ${fmt(n)}건"></span>`).join('');
 const renderer=new THREE.WebGLRenderer({antialias:true,logarithmicDepthBuffer:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);$('#view').append(renderer.domElement);
 const scene=new THREE.Scene();
 const world=await createTwinWorld(scene,renderer);
 const camera=new THREE.PerspectiveCamera(45,innerWidth/innerHeight,.5,180000);const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.maxPolarAngle=Math.PI/2-.035;controls.minDistance=12;controls.maxDistance=70000;
 const labelGroup=new THREE.Group();scene.add(labelGroup);
 for(const anchor of geo.anchors){if(!anchor.point)continue;const c=document.createElement('canvas');c.width=256;c.height=64;const x=c.getContext('2d');x.font='500 30px system-ui';x.textAlign='center';x.lineWidth=5;x.strokeStyle='#263d48';x.strokeText(anchor.name,128,42);x.fillStyle='#fff';x.fillText(anchor.name,128,42);const texture=new THREE.CanvasTexture(c);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false,transparent:true}));sprite.position.set(anchor.point[0],60,anchor.point[1]);sprite.scale.set(1000,250,1);labelGroup.add(sprite);}
 const positions=new Float32Array(city.peakActive*3),colors=new Float32Array(city.peakActive*3),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('color',new THREE.BufferAttribute(colors,3).setUsage(THREE.DynamicDrawUsage));geometry.setDrawRange(0,0);
 const disc=document.createElement('canvas');disc.width=32;disc.height=32;const dc=disc.getContext('2d');dc.fillStyle='#fff';dc.beginPath();dc.arc(16,16,13,0,Math.PI*2);dc.fill();
 const markers=new THREE.Points(geometry,new THREE.PointsMaterial({size:5,sizeAttenuation:false,vertexColors:true,map:new THREE.CanvasTexture(disc),alphaTest:.1,depthTest:false,transparent:true,opacity:.85}));markers.frustumCulled=false;markers.renderOrder=3;scene.add(markers);
 const colorValues=Object.fromEntries(Object.entries(MODE_COLORS).map(([k,v])=>[k,new THREE.Color(v)]));
 const vehicles=createTwinVehicles(scene,city.peakActive,MODE_COLORS);let vehicleVersion=0,following=false,night=false;
 const highlight=new THREE.Group();scene.add(highlight);let selected=null,personId=null,personal=[],active=[],routed=[],time=448,playing=false,lastMinute=-1,ready=false,elapsed=0,lastFrame=0,drawAt=0;
 function setFollowing(value){following=value;controls.enabled=!value;$('#twin-follow').textContent=value?'추적 해제':'선택 통행 따라가기';$('#twin-follow').setAttribute('aria-pressed',String(value));}
 function placeCamera(target,position){camera.clearViewOffset();controls.enableDamping=false;controls.update();controls.target.set(...target);camera.position.set(...position);controls.update();controls.enableDamping=true;}
 function fit(points,overview=false){let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;for(const p of points){minX=Math.min(minX,p[0]);maxX=Math.max(maxX,p[0]);minZ=Math.min(minZ,p[1]);maxZ=Math.max(maxZ,p[1]);}const x=(minX+maxX)/2,z=(minZ+maxZ)/2,span=Math.max(maxX-minX,(maxZ-minZ)*1.2,700)*(overview?1.25:1.65);const factor=$('.csv-info').hidden?1:1.2;placeCamera([x,0,z],[x+span*.12*factor,span*.85*factor,z+span*.65*factor]);if(!$('.csv-info').hidden&&innerWidth>1000){const left=$('.csv-panel').getBoundingClientRect().right+24,right=$('.csv-info').getBoundingClientRect().left-24;camera.setViewOffset(innerWidth,innerHeight,innerWidth/2-(left+right)/2,0,innerWidth,innerHeight);}}
 function overview(){fit(geo.anchors.filter(a=>a.point).map(a=>a.point),true);}function cityCenter(){setFollowing(false);placeCamera([-350,0,-500],[500,1300,850]);}
 cityCenter();$('#csv-overview').onclick=()=>{setFollowing(false);overview();};
 $('#twin-center').onclick=cityCenter;
 $('#twin-lake').onclick=()=>{setFollowing(false);placeCamera([420,0,320],[900,440,1000]);};
 function closeRoad(follow=false){
  if(!routed.length)return;
  if(personId==null){const closest=routed.reduce((best,r)=>{const p=routePose(r.path,(time-r.row.start)/(r.row.end-r.row.start)),d=Math.hypot(p.x-controls.target.x,p.z-controls.target.z);return !best||d<best.d?{r,d}:best;},null);const originalTime=time;showPerson(closest.r.row.id,closest.r.row.seq);time=originalTime;update(true);}
  const r=routed[0];if(!r)return;const p=routePose(r.path,(time-r.row.start)/(r.row.end-r.row.start));placeCamera([p.x,1,p.z],[p.x-p.dx*18,65,p.z-p.dz*18]);setFollowing(follow);
 }
 $('#twin-street').onclick=()=>closeRoad(false);$('#twin-follow').onclick=()=>{if(following)setFollowing(false);else closeRoad(true);};
 $('#twin-night').onclick=()=>{night=!night;world.setNight(night);$('#twin-night').textContent=night?'주간 보기':'야간 보기';$('#twin-night').setAttribute('aria-pressed',String(night));document.body.dataset.twinNight=String(night);};

 function setPlaying(v){playing=v;$('#csv-play').textContent=v?'일시정지':'재생';$('#csv-play').setAttribute('aria-pressed',String(v));}
 function filters(){return {modes:[...document.querySelectorAll('[data-mode]:checked')].map(e=>Number(e.value)),origin:$('#csv-origin').value,destination:$('#csv-destination').value,purpose:$('#csv-purpose').value,person:personId};}
 function update(force=false){
  $('#csv-clock').textContent=dayClock(time);$('#csv-seek').value=time;if(!ready||(!force&&lastMinute===Math.floor(time)))return;lastMinute=Math.floor(time);
  vehicleVersion++;active=day.active(time,filters());if($('#csv-local-only').checked)active=active.filter(r=>r.origin===r.destination&&dispersal.network.pools[r.origin]?.length);routed=[];let same=0,external=0;dispersal.beginFrame();for(const row of active){const path=dispersal.route(row);if(path){routed.push({row,path});if(row.origin===row.destination)same++;}else external++;}dispersal.endFrame();
  if(routed.length>city.peakActive)throw Error('통행 표시 용량 초과');
  $('#csv-active').textContent=fmt(active.length);$('#csv-drawn').textContent=fmt(routed.length);$('#csv-same').textContent=fmt(same);$('#csv-external').textContent=fmt(external);
  routed.forEach(({row},i)=>{const c=colorValues[row.mode];colors[i*3]=c.r;colors[i*3+1]=c.g;colors[i*3+2]=c.b;});geometry.attributes.color.needsUpdate=true;geometry.setDrawRange(0,routed.length);
 }
 function clearHighlight(){while(highlight.children.length){const child=highlight.children[0];highlight.remove(child);child.geometry?.dispose();child.material?.map?.dispose();child.material?.dispose();}}
 function endpointLabel(point,text,color){
  const c=document.createElement('canvas');c.width=256;c.height=80;const ctx=c.getContext('2d');ctx.fillStyle='#102e3b';ctx.fillRect(0,0,256,80);ctx.fillStyle=new THREE.Color(color).getStyle();ctx.font='bold 40px system-ui';ctx.textAlign='center';ctx.fillText(text+' · 추정',128,55);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),depthTest:false}));sprite.position.set(point[0],16,point[1]);sprite.scale.set(130,40,1);sprite.renderOrder=7;highlight.add(sprite);
 }
 function choose(row,moveTime=true){
  selected=row;setFollowing(false);clearHighlight();if(moveTime){time=row.start;setPlaying(false);update(true);}const path=dispersal.route(row);
  if(path){const points=path.points.map(p=>new THREE.Vector3(p[0],.38,p[1]));const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:MODE_COLORS[row.mode],depthTest:true}));line.renderOrder=4;highlight.add(line);const bands=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({color:MODE_COLORS[row.mode],depthTest:true}),path.points.length-1);const segment=new THREE.Object3D();for(let i=1;i<path.points.length;i++){const a=path.points[i-1],b=path.points[i],dx=b[0]-a[0],dz=b[1]-a[1];segment.position.set((a[0]+b[0])/2,.39,(a[1]+b[1])/2);segment.scale.set(.5,.025,Math.hypot(dx,dz)+.02);segment.rotation.y=Math.atan2(dx,dz);segment.updateMatrix();bands.setMatrixAt(i-1,segment.matrix);}bands.renderOrder=5;highlight.add(bands);endpointLabel(path.points[0],'출발',0x46d7ed);endpointLabel(path.points.at(-1),'도착',0xffb46a);fit(path.points);}
  $('#csv-route-description').textContent=path?`${path.local?'같은 지역 안의 이동 · ':''}추정 도로 거리 ${(path.meters/1000).toFixed(2)} km · 출발 지점 ${dispersal.network.pools[row.origin].indexOf(path.from)+1} → 도착 지점 ${dispersal.network.pools[row.destination].indexOf(path.to)+1} (각 지역 24곳) · 위치·경로 추정${row.end===row.start?' · 원본 소요시간 0분, 이동 재생 제외':''}`:'세종시 외부 포함 · 외부 상세 위치가 없어 경로를 표시하지 않습니다.';
  for(const el of document.querySelectorAll('[data-trip]'))el.setAttribute('aria-pressed',String(Number(el.dataset.trip)===row.seq));
 }
 function showPerson(id,preferred){
  const found=day.person(id);if(!found.length){$('.csv-toast').textContent=`개인 ID ${id}의 기록이 없습니다.`;$('.csv-toast').hidden=false;return;}$('.csv-toast').hidden=true;personal=found;personId=id;$('#csv-local-only').checked=false;markers.material.size=12;$('#csv-person-id').value=id;for(const el of document.querySelectorAll('[data-mode]'))el.checked=true;for(const name of ['origin','destination','purpose'])$('#csv-'+name).value='';
  $('.csv-info').hidden=false;$('.csv-legend').hidden=true;$('#csv-person-title').textContent=manifest.publicReplay?`가상 통행 ${id}`:`개인 ${id} · 하루 ${found.length}건`;$('#csv-person-meta').textContent=manifest.publicReplay?'개인 속성 없음 · 독립적으로 생성한 통행':`성별 코드 ${found[0].gender} · 연령 그룹 ${found[0].age} · 거주 ${manifest.regions[found[0].home]}`;
  $('.csv-chain').innerHTML=found.map(r=>`<button data-trip="${r.seq}" aria-pressed="false"><b>${r.seq}. ${escape(manifest.regions[r.origin])} → ${escape(manifest.regions[r.destination])}</b><small>${clock(r.start)} → ${clock(r.end)} · 수단 ${r.mode} · ${escape(manifest.purposes[r.purpose])}</small><small>장소 유형 ${r.originType} → ${r.destinationType}${r.start===r.end?' · 0분 기록':''}</small></button>`).join('');
  for(const el of document.querySelectorAll('[data-trip]'))el.onclick=()=>choose(found.find(r=>r.seq===Number(el.dataset.trip)));
  choose(found.find(r=>r.seq===preferred)||found.find(r=>r.start<=time&&time<r.end)||found[0]);
 }
 $('.csv-person-form').onsubmit=e=>{e.preventDefault();const id=Number($('#csv-person-id').value);if(!Number.isSafeInteger(id)||id<1){$('.csv-toast').textContent='올바른 개인 ID를 입력해 주세요.';$('.csv-toast').hidden=false;return;}showPerson(id);};
 function reset(){setFollowing(false);$('#csv-local-only').checked=false;markers.material.size=5;personId=null;personal=[];selected=null;clearHighlight();$('.csv-info').hidden=true;$('.csv-legend').hidden=false;$('.csv-toast').hidden=true;$('#csv-person-id').value='';for(const e of document.querySelectorAll('[data-mode]'))e.checked=true;for(const name of ['origin','destination','purpose'])$('#csv-'+name).value='';update(true);}
 $('#csv-reset').onclick=reset;$('.csv-close').onclick=reset;
 for(const el of document.querySelectorAll('[data-mode],#csv-origin,#csv-destination,#csv-purpose,#csv-local-only'))el.onchange=()=>{update(true);if((el.id==='csv-origin'||el.id==='csv-destination')&&el.value!==''){const pool=dispersal.network.pools[Number(el.value)];if(pool?.length){setFollowing(false);fit(pool.map(i=>dispersal.network.points[dispersal.network.endpoints[i].point]));}}};
 $('#csv-focus').onclick=()=>{const candidate=routed[0];if(candidate)showPerson(candidate.row.id,candidate.row.seq);else{ $('.csv-toast').textContent='현재 조건과 시각에는 지도에 표시할 통행이 없습니다.';$('.csv-toast').hidden=false;}};
 $('#csv-play').onclick=()=>{if(time>=1440)time=0;setPlaying(!playing);};$('#csv-start').onclick=()=>{time=0;setPlaying(false);update(true);};$('#csv-seek').oninput=e=>{time=Number(e.target.value);update(true);};
 $('.csv-compact').onclick=e=>{const p=$('.csv-panel'),collapsed=p.dataset.collapsed!=='true';p.dataset.collapsed=String(collapsed);e.target.textContent=collapsed?'설정 열기':'설정 접기';};
 let pointerStart=null;renderer.domElement.addEventListener('pointerdown',e=>{pointerStart=[e.clientX,e.clientY];});
 renderer.domElement.addEventListener('pointerup',e=>{if(!pointerStart||Math.hypot(e.clientX-pointerStart[0],e.clientY-pointerStart[1])>5||e.button!==0||!ready)return;const point=new THREE.Vector3();let best=null,distance=144;for(let i=0;i<routed.length;i++){point.set(positions[i*3],positions[i*3+1],positions[i*3+2]).project(camera);if(point.z<-1||point.z>1)continue;const dx=(point.x+1)*innerWidth/2-e.clientX,dy=(1-point.y)*innerHeight/2-e.clientY,d=dx*dx+dy*dy;if(d<distance){distance=d;best=routed[i].row;}}if(best)showPerson(best.id,best.seq);});
 addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
 function draw(now){requestAnimationFrame(draw);const dt=Math.min(.15,(now-lastFrame)/1000);lastFrame=now;if(document.hidden)return;if(ready&&playing){time=Math.min(1440,time+dt*Number($('#csv-rate').value)/60);if(time>=1440)setPlaying(false);}if(now-drawAt<40)return;drawAt=now;update();
  const vehicleState=vehicles.update(routed,time,camera,controls.target,positions,vehicleVersion*1000000+world.revision,world.roadAt);markers.visible=!vehicleState.near;geometry.attributes.position.needsUpdate=true;
  if(following&&routed.length){const r=routed[0],p=routePose(r.path,(time-r.row.start)/(r.row.end-r.row.start)),aim=new THREE.Vector3(p.x,1,p.z);controls.target.lerp(aim,.18);camera.position.lerp(new THREE.Vector3(p.x-p.dx*8,25,p.z-p.dz*8),.1);}
  world.update(camera,controls.target,playing);
  const distance=camera.position.distanceTo(controls.target);$('#twin-view-scale').textContent=`관찰 높이 ${Math.round(camera.position.y).toLocaleString()} m${following?' · 통행 추적 중':''}`;for(const label of labelGroup.children)label.scale.set(Math.min(900,distance*.075),Math.min(225,distance*.01875),1);controls.update();renderer.render(scene,camera);
 }requestAnimationFrame(draw);
 const files=Object.entries(manifest.files).filter(([k])=>k.startsWith('hour-')).map(([,f])=>f);let next=0,done=0;
 await Promise.all(Array.from({length:3},async()=>{while(next<files.length){const file=files[next++];day.add(await get(file.url,'binary'),file.records);done++;$('#status').textContent=`하루 전체 통행을 불러오는 중… ${done}/${files.length} (${fmt(day.count)}건)`;}}));
 if(day.count!==manifest.total)throw Error('전체 통행 건수 검증 실패');dispersal.assign(day);ready=true;$('#status').hidden=true;$('#csv-source-total').textContent=manifest.publicReplay?`${fmt(manifest.total)}건 · 공개용 가상 통행 · 하루 재생`:`${fmt(manifest.total)}건 · ${fmt(manifest.people)}명 · 하루 전체`;
 $('#twin-street').disabled=false;$('#twin-follow').disabled=false;
 for(const id of ['play','start','seek','find','reset','focus','overview'])$('#csv-'+id).disabled=false;update(true);
}
start().catch(error=>{$('#status').hidden=false;$('#status').textContent=`자료를 불러오지 못했습니다. 새로고침해 주세요. (${error.message})`;console.error(error);});

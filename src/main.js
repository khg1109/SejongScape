import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { project, buildingHeight, stitchRings, contains } from './map.js';
import { createMobility } from './mobility.js';
import { roadWidth } from './mobility-model.js';
import { createArchitecture } from './architecture.js';
import { createEnvironment, surfaceTexture } from './environment.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createCity } from './city.js';
import {createSidewalkRenderer,isMappedSidewalk} from './sidewalk.js';
import {roadSurface} from './2026-11-04-road-surface.js';
import './style.css';

document.querySelector('#app').innerHTML = `
  <main id="scene" aria-label="세종시 3D 지도"></main>
  <header><a class="brand" href="/">S<span>·</span> <b>SEJONGSCAPE</b></a><a href="/real.html" style="color:inherit;font-size:14px">실제 3D 지도 ↗</a><a href="/traffic" style="color:inherit;font-size:14px">실제 교통정보 ↗</a><a href="/sumo" style="color:inherit;font-size:14px">CSV 통행 재생 ↗</a><a href="/2026-11-03-road-lab.html" style="color:inherit;font-size:14px">SUMO 도로 변경 실험 ↗</a><button id="sources-button">재현 기준</button><button id="theme" aria-pressed="false">☀ 낮으로 보기</button></header>
  <section class="intro"><div class="eyebrow"><span class="dot"></span> 세종특별자치시 · 전 지역</div><h1>세종을,<br>다른 시선으로.</h1><p>신도심에서 조치원, 읍·면 마을까지.<br>지도 위의 세종을 입체로 만나보세요.</p><div class="coordinates">36.5010° N &nbsp; 127.2690° E</div></section>
  <aside class="places" aria-label="장소 이동"><div class="panel-title">어디로 가볼까요 <span>↗</span></div><button data-place="overview" class="active"><span>01</span> 도시 한눈에 <i>↗</i></button><button data-place="government"><span>02</span> 정부세종청사 <i>↗</i></button><button data-place="lake"><span>03</span> 세종호수공원 <i>↗</i></button><button data-place="library"><span>04</span> 국립세종도서관 <i>↗</i></button><div class="view-modes"><button id="orbit" class="active" aria-pressed="true">조감도</button><button id="walk" aria-pressed="false">거리 시점</button></div></aside>
  <section class="activity-panel" aria-label="도시의 움직임"><div class="panel-title">도시의 움직임 <span class="dot"></span></div><label for="period">시간대</label><select id="period"><option value="morning">출근 · 08:00</option><option value="day">낮 · 13:00</option><option value="evening" selected>퇴근 · 18:00</option><option value="night">밤 · 22:00</option></select><p id="activity-count" aria-live="polite"></p><div class="activity-actions"><button id="activity-focus">사람 많은 길 보기 ↗</button><button id="activity-pause" aria-pressed="false">일시정지</button></div><small>지도 기반 교통시설 · 신호 주기·교통량은 시뮬레이션</small></section>
  <div id="detail" hidden></div>
  <dialog id="sources"><button id="sources-close" aria-label="닫기">×</button><h2>무엇을 실제 자료로 만들었나요?</h2><p>건물 외곽선·도로·호수·공원·주차장·정류장·횡단보도 위치는 OpenStreetMap에 등록된 정보를 사용합니다. 건물 높이는 층수가 있으면 환산하고, 없으면 추정합니다.</p><p>도서관의 곡선 지붕, 대통령기록관의 유리 큐브, 청사 옥상정원은 아래 자료를 참고한 단순화 모델입니다. 사진을 붙인 실사 모델이나 측량 도면 수준의 복제는 아닙니다.</p><ul><li><a href="https://www.samoo.com/home/works/view.do?cntntsSn=117" target="_blank" rel="noreferrer">SAMOO · 국립세종도서관 설계 및 외관</a></li><li><a href="https://www.pa.go.kr/portal/introduce/exhibitionInfo/exhibitionInfo01.do" target="_blank" rel="noreferrer">대통령기록관 · 전시관 건축 소개</a></li><li><a href="https://www.gbmo.go.kr/chungsa/cm/cntnts/cntntsView.do?cntntsId=1043&mi=1159" target="_blank" rel="noreferrer">정부청사관리본부 · 옥상정원 소개</a></li></ul><p>녹지 안의 나무, 가로수 간격, 조명·재질·교통량은 연출입니다. 횡단보도와 신호등은 지도 기록을 우선 쓰며, 미등록 지점에 신호등을 추가하지 않습니다. 신호등 모양은 OSM 신호 지점 표시이며, 기둥의 실측 설치 위치를 뜻하지 않습니다. 기록이 없는 보행 신호기·지주는 표시하지 않습니다. 90초 신호 주기와 보행자 우선 대기는 시뮬레이션이며 실제 신호 제어·회전 전용 신호를 재현하지는 않습니다. 인도는 별도 인도 경로가 등록된 구간에만 표시하며 폭 미기록 시 2.2m를 사용합니다. 포장과 경계석 높이는 시각적 표현입니다. 실제 지형 고도, 실시간 유동인구, 정확한 버스 노선은 아직 반영하지 않았습니다.</p><small id="environment-count"></small></dialog>
  <div class="north" title="북쪽은 지도의 위쪽입니다">N<span>↑</span></div>
  <footer><div class="stats" id="stats">도시 데이터를 불러오는 중</div><div class="hint" id="hint">드래그 회전 · 휠 확대 · 우클릭 이동 · 건물 클릭</div><div class="credit"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors · ODbL</a><span>건물 높이 일부 추정 · 평탄 지형 · 초기 시제품</span></div></footer>
  <div id="loading" role="status"><div class="loader-mark">S<span>·</span></div><p>세종의 풍경을 불러옵니다</p><small>실제 지도 데이터로 구성하는 3D 도시</small></div>`;

const status = document.querySelector('#loading');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
} catch {
  status.innerHTML = '<p>3D 화면을 시작할 수 없습니다.</p><small>WebGL을 지원하는 브라우저에서 하드웨어 가속을 켜고 다시 열어주세요.</small>';
}
if (renderer) start().catch(error => {
  console.error(error);
  status.replaceChildren();
  const message = document.createElement('p');
  message.textContent = '도시 데이터를 불러오지 못했습니다.';
  const info = document.createElement('small');
  info.textContent = 'npm run data:fetch 실행 후 페이지를 새로고침해 주세요.';
  status.append(message, info);
});

async function start() {
  const response = await fetch('/data/sejong.json');
  if (!response.ok) throw new Error(`Map data: ${response.status}`);
  const data = await response.json();
  const trafficResponse=await fetch('/data/traffic.json');if(!trafficResponse.ok)throw Error('교통 시설 데이터 불러오기 실패');
  const trafficData=await trafficResponse.json();
  const originalIds=new Set(data.elements.map(e=>e.type+'/'+e.id));
  data.elements.push(...trafficData.elements.filter(e=>!originalIds.has(e.type+'/'+e.id)&&e.lat>=data.bbox[0]&&e.lat<=data.bbox[2]&&e.lon>=data.bbox[1]&&e.lon<=data.bbox[3]));
  const scene = new THREE.Scene();
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFShadowMap;
  const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();
  const environmentMap=pmrem.fromScene(room,.04);scene.environment=environmentMap.texture;room.dispose();pmrem.dispose();
  document.querySelector('#scene').append(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(43, innerWidth/innerHeight, 1, 250000);
  camera.position.set(2000, 2200, 2800);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI/2 - .025;
  controls.minDistance = 15;
  controls.maxDistance = 140000;
  const hemisphere = new THREE.HemisphereLight(0xb5d3ff, 0x526449, 1.6);
  const sun = new THREE.DirectionalLight(0xffdec0, 2);
  sun.position.set(-1000,2000,900);
  sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-500;sun.shadow.camera.right=500;sun.shadow.camera.top=500;sun.shadow.camera.bottom=-500;sun.shadow.camera.near=1;sun.shadow.camera.far=4000;sun.shadow.normalBias=.65;scene.add(sun.target);
  scene.add(hemisphere, sun);
  const grassTexture=surfaceTexture('grass');grassTexture.repeat.set(1800,1800);
  const groundMat = new THREE.MeshStandardMaterial({color:0xb8c3ac,map:grassTexture, roughness:1});
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120000,120000),groundMat);
  ground.rotation.x=-Math.PI/2; ground.position.y=-.5;ground.receiveShadow=true; scene.add(ground);
  const waterNormals=createWaterNormals();
  const waterMat = new THREE.MeshStandardMaterial({color:0x267f8b,roughness:.22,metalness:.45,normalMap:waterNormals,normalScale:new THREE.Vector2(.3,.3)});
  const parkMat = new THREE.MeshStandardMaterial({color:0x264c3a,roughness:1});
  const roadMat = new THREE.MeshStandardMaterial({color:0x596873,map:surfaceTexture('asphalt'),roughness:.95});
  const pathMat = new THREE.MeshStandardMaterial({color:0xbab7a7,map:surfaceTexture('path'),roughness:1});
  const bridgeMat = roadMat; // One asphalt material for base roads, bridges and city tiles.
  const architecture=createArchitecture();
  const buildings = [];
  const pos = p => project(p,data.center);
  const shapeOf = ring => new THREE.Shape(ring.map(p=>new THREE.Vector2(p[0],-p[1])));
  function surface(outer, holes, mat, height) {
    const shape=shapeOf(outer);
    holes.forEach(r=>shape.holes.push(new THREE.Path(r.map(p=>new THREE.Vector2(p[0],-p[1])))));
    const mesh=new THREE.Mesh(new THREE.ShapeGeometry(shape),mat);
    mesh.rotation.x=-Math.PI/2; mesh.position.y=height;mesh.receiveShadow=true; scene.add(mesh);
  }
  const roadGeo=[], pathGeo=[], bridgeGeo=[], markings=[],whiteMarkings=[];
  let estimated=0;
  for (const item of data.elements) {
    const tags=item.tags || {};
    if (tags.natural==='water' && item.type==='relation') {
      const outer=stitchRings(item.members || [],'outer').map(r=>r.map(pos));
      const inner=stitchRings(item.members || [],'inner').map(r=>r.map(pos));
      outer.forEach(r=>surface(r,inner.filter(h=>contains(h[0],r)),waterMat,.12));
    }
    if (!item.geometry?.length) continue;
    const points=item.geometry.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)).map(pos);
    if (tags.building && points.length>=4) {
      const height=buildingHeight(tags);
      if(height.estimated) estimated++;
      const mesh=architecture.make(item,points);
      buildings.push(mesh); scene.add(mesh);
    } else if(tags.natural==='water' && points.length>=4) surface(points,[],waterMat,.12);
    else if((['grass','forest','meadow'].includes(tags.landuse)||['park','garden'].includes(tags.leisure)||tags.natural==='wood') && points.length>=4) surface(points,[],parkMat,.08);
    else if(tags.amenity==='parking'&&points.length>=4)surface(points,[],roadMat,.1);
    else if(tags.leisure==='pitch'&&points.length>=4)surface(points,[],new THREE.MeshStandardMaterial({color:tags.sport==='tennis'?0x648d8d:0x5c8556,roughness:1}),.12);
    if(tags.highway && !isMappedSidewalk(item) && points.length>=2 && tags.tunnel!=='yes' && !['proposed','construction'].includes(tags.highway)) {
      const pedestrian=['footway','path','cycleway','steps','pedestrian'].includes(tags.highway);
      const width=roadWidth(tags);
      const bridge=tags.bridge && tags.bridge!=='no';
      const y=bridge?1.2:.2;
      const pavement=roadSurface(points,width,y,{caps:true});
      if(pavement)(bridge?bridgeGeo:pedestrian?pathGeo:roadGeo).push(pavement);
      if(!pedestrian&&width>=7){
        if(!['yes','-1'].includes(tags.oneway)){const line=roadSurface(points,.18,y+.035);if(line)markings.push(line);}
        for(const side of [-1,1]){const line=roadSurface(points,.12,y+.04,{offset:(width/2-.35)*side});if(line)whiteMarkings.push(line);}
      }
      for(let i=1;i<points.length;i++) {
        const a=points[i-1], b=points[i];
        if(Math.hypot(b[0]-a[0],b[1]-a[1])<.1) continue;
        if(!pedestrian && width>=7) {
          const one=['yes','-1'].includes(tags.oneway);
          const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),nx=-dz/len,nz=dx/len;
          const lanes=Number.parseInt(tags.lanes)||Math.max(2,Math.round(width/3.4));
          for(let lane=1;lane<lanes;lane++){
            const offset=-width/2+width*lane/lanes;if(!one&&Math.abs(offset)<.3)continue;
            for(let d=0;d<len;d+=9){const end=Math.min(len,d+4);whiteMarkings.push(strip([a[0]+dx*d/len+nx*offset,a[1]+dz*d/len+nz*offset],[a[0]+dx*end/len+nx*offset,a[1]+dz*end/len+nz*offset],.11,y+.045));}
          }
        }
      }
    }
  }
  function merged(geos,mat) {
    if(!geos.length) return;
    const mesh=new THREE.Mesh(mergeGeometries(geos),mat);mesh.receiveShadow=true;scene.add(mesh);
    geos.forEach(g=>g.dispose());
  }
  merged(roadGeo,roadMat); merged(pathGeo,pathMat); merged(bridgeGeo,bridgeMat);
  scene.add(createSidewalkRenderer().build(data));
  merged(markings,new THREE.MeshBasicMaterial({color:0xb5a87b}));
  merged(whiteMarkings,new THREE.MeshBasicMaterial({color:0xcacdc2}));
  const environment=createEnvironment(scene,data);
  let mobility=createMobility(scene,data);
  let city=null;

  const places={
    overview:{target:[0,0,0], offset:[2000,2200,2800]},
    government:{target:[...pos({lat:36.5055,lon:127.2651})],offset:[-550,650,720]},
    lake:{target:[...pos({lat:36.4981,lon:127.2737})],offset:[800,800,1050]},
    library:{target:[...pos({lat:36.4988,lon:127.2680})],offset:[260,230,330]},
    archives:{target:[...pos({lat:36.5016,lon:127.2732})],offset:[95,75,110]},
  };
  for(const place of Object.values(places)) if(place.target.length===2) place.target=[place.target[0],0,place.target[1]];
  // For the library viewpoint use its actual mapped footprint when available.
  const library=buildings.find(b=>b.userData.name==='국립세종도서관');
  if(library) { const center=new THREE.Box3().setFromObject(library).getCenter(new THREE.Vector3()); places.library.target=[center.x,8,center.z];places.library.offset=[90,55,115]; }
  let transition=null, walk=false, night=true;
  const keys=new Set();
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  function fly(target,position) {
    transition={from:camera.position.clone(),to:new THREE.Vector3(...position),targetFrom:controls.target.clone(),targetTo:new THREE.Vector3(...target),start:performance.now()};
    if(reduced) {camera.position.copy(transition.to);controls.target.copy(transition.targetTo);transition=null;}
  }
  function mode(value) {
    walk=value;
    controls.enablePan=!walk;
    controls.maxPolarAngle=walk?Math.PI*.65:Math.PI/2-.025;
    document.querySelector('#walk').classList.toggle('active',walk);
    document.querySelector('#orbit').classList.toggle('active',!walk);
    document.querySelector('#walk').setAttribute('aria-pressed',String(walk));
    document.querySelector('#orbit').setAttribute('aria-pressed',String(!walk));
    document.querySelector('#hint').textContent=walk?'WASD / 방향키 이동 · 드래그 둘러보기 · Shift 빠르게 · 충돌 판정 없음':'드래그 회전 · 휠 확대 · 우클릭 이동 · 건물 클릭';
  }
  document.querySelectorAll('[data-place]').forEach(button=>button.onclick=()=>{
    mode(false);
    document.querySelectorAll('[data-place]').forEach(b=>b.classList.toggle('active',b===button));
    const p=places[button.dataset.place]; fly(p.target,p.target.map((v,i)=>v+p.offset[i]));
  });
  document.querySelector('#walk').onclick=()=>{
    mode(true);
    const p=[controls.target.x,controls.target.z];
    fly([p[0]+40,2.2,p[1]-60],[p[0],2.2,p[1]]);
  };
  document.querySelector('#orbit').onclick=()=>{mode(false);fly(places.overview.target,places.overview.offset);};
  function theme() {
    mobility.setNight(night);
    architecture.setNight(night);environment.setNight(night);scene.environmentIntensity=night?.2:.65;
    scene.background=new THREE.Color(night?0x101e28:0xc6dde0);
    scene.fog=new THREE.FogExp2(night?0x101e28:0xc6dde0,.000012);
    city?.setNight(night);
    hemisphere.intensity=night?1.8:1.65; sun.intensity=night?1.1:2.1;renderer.toneMappingExposure=night?1:.9;
    groundMat.color.set(night?0x5e7773:0xc4c9b0);
    parkMat.color.set(night?0x264c3a:0x64845c);
    waterMat.color.set(night?0x267f8b:0x50a4ae);
    document.querySelector('#theme').textContent=night?'☀ 낮으로 보기':'☾ 밤으로 보기';
    document.querySelector('#theme').setAttribute('aria-pressed',String(!night));
  }
  document.querySelector('#theme').onclick=()=>{night=!night;theme();}; theme();
  const archiveButton=document.createElement('button');archiveButton.dataset.place='archives';archiveButton.innerHTML='<span>05</span> 대통령기록관 <i>↗</i>';document.querySelector('.view-modes').before(archiveButton);
  archiveButton.onclick=()=>{mode(false);const p=places.archives;fly(p.target,p.target.map((v,i)=>v+p.offset[i]));document.querySelectorAll('[data-place]').forEach(b=>b.classList.toggle('active',b===archiveButton));};
  document.querySelector('#sources-button').onclick=()=>document.querySelector('#sources').showModal();document.querySelector('#sources-close').onclick=()=>document.querySelector('#sources').close();
  const env=environment.stats;document.querySelector('#environment-count').textContent=`지도 위치: 정류장 ${env.stops}개 · 횡단보도 ${env.crossings}개 · 개별 수목 ${env.mappedTrees}그루 / 연출: 녹지·가로수·옥상 수목 ${env.landscapeTrees}그루, 조명 ${env.lamps}개`;
  function activityCounts() {
    const t=mobility.totals;
    document.querySelector('#activity-count').textContent=`보행자 ${t.person.toLocaleString()}명 · 자동차 ${t.car}대 · 버스 ${t.bus}대 · 자전거 ${t.bike}대`;
  }
  document.querySelector('#period').onchange=e=>{
    mobility.populate(e.target.value);activityCounts();
    night=['evening','night'].includes(e.target.value);theme();
  };
  document.querySelector('#activity-focus').onclick=()=>{
    const p=mobility.focus();if(!p)return;mode(false);
    document.querySelectorAll('[data-place]').forEach(b=>b.classList.remove('active'));
    const target=new THREE.Vector3(p.x,p.y+1,p.z),sight=new THREE.Raycaster();
    let destination;
    for(const height of [25,50,100,180]) {
      for(let i=0;i<12;i++) {
        const angle=i*Math.PI/6,candidate=target.clone().add(new THREE.Vector3(Math.sin(angle)*height*1.4,height,Math.cos(angle)*height*1.4));
        const direction=candidate.clone().sub(target);sight.set(target,direction.clone().normalize());sight.far=direction.length();
        if(!sight.intersectObjects(buildings,true).length){destination=candidate;break;}
      }
      if(destination)break;
    }
    destination??=target.clone().add(new THREE.Vector3(0,300,20));
    fly(target.toArray(),destination.toArray());
  };
  function pauseLabel() {const b=document.querySelector('#activity-pause');b.textContent=mobility.paused?'재생':'일시정지';b.setAttribute('aria-pressed',String(mobility.paused));}
  document.querySelector('#activity-pause').onclick=()=>{mobility.setPaused(!mobility.paused);pauseLabel();};
  const junctionButton=document.createElement('button');junctionButton.textContent='기록된 신호 지점 보기 ↗';junctionButton.onclick=()=>{const p=mobility.traffic.focus();if(!p)return;mode(false);fly([p.x,1,p.z],[p.x+45,35,p.z+50]);};document.querySelector('.activity-actions').after(junctionButton);junctionButton.className='junction-button';
  activityCounts();pauseLabel();
  document.querySelector('#stats').innerHTML=`<strong>${buildings.length.toLocaleString()}</strong> 건물 <span>/</span> <strong>${data.elements.filter(e=>e.geometry&&e.tags?.highway).length.toLocaleString()}</strong> 도로·보행로`;
  document.querySelector('.credit span').title=`${estimated}개 건물 높이 추정. 지도 수집: ${data.fetchedAt.slice(0,10)}. 건물 이름은 OSM 등록 정보로 현재 입주기관과 다를 수 있습니다.`;
  const ray=new THREE.Raycaster(), mouse=new THREE.Vector2(); let pointerStart;
  renderer.domElement.addEventListener('pointerdown',e=>{pointerStart=[e.clientX,e.clientY];transition=null;});
  renderer.domElement.addEventListener('pointerup',e=>{
    if(!pointerStart || Math.hypot(e.clientX-pointerStart[0],e.clientY-pointerStart[1])>5) return;
    mouse.set(e.clientX/innerWidth*2-1,1-e.clientY/innerHeight*2);
    ray.setFromCamera(mouse,camera); const hit=ray.intersectObjects(buildings,true)[0];
    const detail=document.querySelector('#detail'); detail.hidden=!hit;
    if(hit) {let obj=hit.object;while(obj&&!obj.userData.name)obj=obj.parent;const d=obj.userData;detail.textContent=`${d.name} · 높이 ${d.height.toFixed(1)}m (${d.estimated?'추정':'OSM 기록'}) · ${d.description}`;}
  });
  window.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))return;if(walk && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD'].includes(e.code))e.preventDefault();keys.add(e.code);});
  window.addEventListener('keyup',e=>keys.delete(e.code));
  window.addEventListener('blur',()=>keys.clear());
  window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
  let last=performance.now();
  renderer.setAnimationLoop(now=>{
    const dt=Math.min((now-last)/1000,.05);last=now;
    if(transition) {
      const t=Math.min((now-transition.start)/1300,1), smooth=t*t*(3-2*t);
      camera.position.lerpVectors(transition.from,transition.to,smooth);controls.target.lerpVectors(transition.targetFrom,transition.targetTo,smooth);
      if(t===1)transition=null;
    } else if(walk) {
      const forward=controls.target.clone().sub(camera.position);forward.y=0;forward.normalize();
      const right=new THREE.Vector3().crossVectors(forward,new THREE.Vector3(0,1,0));
      const delta=new THREE.Vector3();
      if(keys.has('KeyW')||keys.has('ArrowUp'))delta.add(forward);
      if(keys.has('KeyS')||keys.has('ArrowDown'))delta.sub(forward);
      if(keys.has('KeyD')||keys.has('ArrowRight'))delta.add(right);
      if(keys.has('KeyA')||keys.has('ArrowLeft'))delta.sub(right);
      delta.normalize().multiplyScalar(dt*(keys.has('ShiftLeft')?90:25));camera.position.add(delta);controls.target.add(delta);
      const shift=2.2-camera.position.y; camera.position.y=2.2;controls.target.y+=shift;
    }
    controls.update();
    mobility.update(dt);
    if(!transition)city?.update(controls.target.x,controls.target.z);
    waterNormals.offset.x+=dt*.008;waterNormals.offset.y+=dt*.004;
    sun.target.position.copy(controls.target);sun.position.copy(controls.target).add(new THREE.Vector3(-1000,2000,900));
    const c=controls.target.clone().project(camera), n=controls.target.clone().add(new THREE.Vector3(0,0,-100)).project(camera);
    document.querySelector('.north span').style.transform=`rotate(${Math.atan2((n.x-c.x)*innerWidth,(n.y-c.y)*innerHeight)}rad)`;
    renderer.render(scene,camera);
  });
  city=await createCity(scene,(elements,x,z)=>{
    const all=[...new Map([...data.elements,...elements,...trafficData.elements].map(e=>[e.type+'/'+e.id,e])).values()];
    const nearby=all.filter(e=>{const p=e.geometry?.[0]||e;if(!Number.isFinite(p.lat))return false;const q=pos(p);return Math.hypot(q[0]-x,q[1]-z)<2200;});
    const count=nearby.filter(e=>e.tags?.building).length;
    const paused=mobility.paused;mobility.dispose();
    mobility=createMobility(scene,{center:data.center,elements:nearby},Math.min(1,Math.max(.06,count/1800)));
    mobility.populate(document.querySelector('#period').value);mobility.setPaused(paused);mobility.setNight(night);activityCounts();
  },new Set(data.elements.map(e=>e.type+'/'+e.id)),roadMat);
  city.setNight(night);city.update(0,0);
  const options=[['세종 전체',36.57,127.27,31000],['조치원읍',36.601,127.298,2400],['한솔동',36.479,127.254,1800],['나성동',36.486,127.263,1800],['보람동 · 시청',36.480,127.289,2000],['소담동',36.485,127.301,2000],['아름·종촌·고운동',36.513,127.246,2500],['도담·어진동',36.512,127.261,2300],['반곡·집현동',36.491,127.314,2300],['해밀동',36.531,127.268,2000],['연기면',36.543,127.273,2400],['연동면',36.559,127.328,2600],['연서면',36.592,127.271,3000],['장군면',36.496,127.205,3000],['금남면',36.464,127.280,3000],['부강면',36.530,127.370,2700],['전의면',36.681,127.196,3200],['전동면',36.657,127.266,3200],['소정면',36.722,127.158,2400]];
  const label=document.createElement('label');label.className='region-picker';label.textContent='지역 이동';
  const select=document.createElement('select');select.setAttribute('aria-label','세종 지역 이동');
  const initial=new Option('지역을 선택하세요','');select.add(initial);
  options.forEach((p,i)=>select.add(new Option(p[0],String(i))));label.append(select);document.querySelector('.places .panel-title').after(label);
  select.onchange=()=>{if(select.value==='')return;mode(false);const[name,lat,lon,d]=options[Number(select.value)],q=pos({lat,lon}),target=[q[0],0,q[1]];const distance=Number(select.value)===0?Math.max(42000,33000/camera.aspect):d;fly(target,[q[0]+distance*.1,distance,q[1]+distance*.45]);document.querySelector('.eyebrow').textContent='세종특별자치시 · '+name;document.querySelectorAll('[data-place]').forEach(b=>b.classList.remove('active'));};
  document.querySelector('#stats').textContent='전체 건물 '+city.index.buildings.toLocaleString()+'개 · 도로·보행로 '+city.index.roads.toLocaleString()+'개';
  document.querySelector('#sources p').textContent+=' 세종시 행정경계 전체를 수집한 지도이며, 가까운 지역의 건물을 자동으로 불러옵니다. 지도에 미등록된 건물·도로는 누락될 수 있습니다. 전체 건물에 용도별 창호·층 구분·옥상 난간과 설비를 표현했습니다. 기록된 층수와 높이를 우선 사용하며, 창문 배치·색상·출입부·설비 위치는 유형별 추정입니다. 실제 사진을 붙인 실사 모델은 아닙니다.';
  status.remove();
}

function strip(a,b,width,y) {
  const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),x=-dz/length*width/2,z=dx/length*width/2;
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute([a[0]+x,y,a[1]+z,b[0]+x,y,b[1]+z,b[0]-x,y,b[1]-z,a[0]+x,y,a[1]+z,b[0]-x,y,b[1]-z,a[0]-x,y,a[1]-z],3));
  const p=geo.getAttribute('position'),uv=[];for(let i=0;i<p.count;i++)uv.push(p.getX(i)*.25,p.getZ(i)*.25);geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geo.computeVertexNormals();return geo;
}

function createWaterNormals(){const size=128,pixels=new Uint8Array(size*size*4);for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=(y*size+x)*4;pixels[i]=128+30*Math.sin(x/size*Math.PI*8+y/size*Math.PI*4);pixels[i+1]=128+25*Math.cos(y/size*Math.PI*10);pixels[i+2]=245;pixels[i+3]=255;}const t=new THREE.DataTexture(pixels,size,size);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(.018,.018);t.magFilter=t.minFilter=THREE.LinearFilter;t.needsUpdate=true;return t;}

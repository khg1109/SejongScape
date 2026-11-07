// Native SUMO FCD samples: x / z in decimetres, speed in cm/s, heading in degrees.
import * as THREE from 'three';
import {createExperimentCity} from './2026-11-03-road-lab-3d.js';

const $=id=>document.getElementById(id);
const prefix='/data/2026-11-03-csv-fleet/2026-11-03-';
const clock=s=>new Date(s*1000).toISOString().slice(11,19);
const carName=i=>'차량 '+String(i+1).padStart(3,'0');
async function get(url){const r=await fetch(url);if(!r.ok)throw Error('실험 자료를 불러오지 못했습니다.');return r.json();}
function pose(track,t){
  if(!track||t<track.start||t>=track.end)return null;
  const f=t-Math.floor(t),i=4*(Math.floor(t)-track.start),s=track.samples,j=Math.min(i+4,s.length-4);
  const lerp=k=>s[i+k]+(s[j+k]-s[i+k])*f;
  return {x:lerp(0)/10,z:lerp(1)/10,speed:lerp(2)*.036,angle:(s[i+3]+f*((s[j+3]-s[i+3]+540)%360-180))*Math.PI/180};
}
function fleetMesh(frame,capacity){
  let body,roof,scenePositions=[];
  const dummy=new THREE.Object3D(),color=new THREE.Color();
  function part(scene,g){const m=new THREE.InstancedMesh(g,new THREE.MeshStandardMaterial(),capacity);m.frustumCulled=false;m.count=0;scene.add(m);return m;}
  return {
    get focus(){const car=frame.cars.find(c=>c.id===frame.selected);return car?[car.x,car.z]:frame.origin;},
    get selectedActive(){return frame.cars.some(c=>c.id===frame.selected);},
    mount(scene){body=part(scene,new THREE.BoxGeometry(1.85,.85,4.4));roof=part(scene,new THREE.BoxGeometry(1.55,.55,2.4));},
    render(camera,target){
      const scale=THREE.MathUtils.clamp(camera.position.distanceTo(target)/170,1,3.3);
      scenePositions=frame.cars;
      for(const [i,c] of scenePositions.entries()){
        dummy.rotation.y=Math.PI-c.angle;dummy.scale.setScalar(scale);
        for(const [m,y,col] of [[body,.73,c.id===frame.selected?0xffbc2b:0x10d9c3],[roof,1.36,0x375d6f]]){
          dummy.position.set(c.x,.38+y*scale,c.z);dummy.updateMatrix();m.setMatrixAt(i,dummy.matrix);m.setColorAt(i,color.setHex(col));
        }
      }
      for(const m of [body,roof]){m.count=scenePositions.length;m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;}
    }
  };
}
function panel(){
  document.querySelector('aside').innerHTML=`<small>SEJONG / CSV × SUMO</small><h1>오전 통행 실험</h1><p id="trip">도담동의 오전 7시대 통행을 불러오는 중…</p>
  <section><h2>01　비교할 도로</h2><label>도로 변경 조건<select id="scenario"></select></label><p><a href="?view=edit">지도에서 직접 선택 ↗</a></p>
  <div class="modes"><button id="baseline">기존 도로</button><button id="altered">변경 도로</button></div><p id="totals"></p></section>
  <section><h2>02　같은 차량 비교</h2><label>차량 선택<select id="unit"></select></label><button id="jump" class="soft">선택 차량 출발로</button><p id="schedule"></p><div class="stats"><div>기존 통행시간<strong id="old-time"></strong></div><div>변경 통행시간<strong id="new-time"></strong></div></div><p id="difference"></p><p id="live"></p></section>
  <details><summary>통행 선정 및 모형 가정</summary><p>CSV에서 오전 7시대 도담동 내부의 첫 통행 중, 추정 양 끝점이 시범 도로망에 있고 기록상 도착이 출발보다 늦은 건을 사용했습니다. 이동수단 코드는 원자료 값을 유지하며, 실험에서는 통행 1건을 승용차 1대로 가정합니다.</p><p>도로 제한속도는 시속 30 km이며 교차로는 우선통행 규칙을 사용합니다. 표시하는 위치와 속도는 SUMO의 1초 단위 계산값입니다. 관측 교통량 및 실제 신호 주기로 보정하지 않았습니다.</p><a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a></details><p id="result" role="status"></p>`;
  document.querySelector('.chip').textContent='CSV × SUMO';
  document.querySelector('.controls').innerHTML=`<button id="play">재생</button><button id="reset">하루 첫 통행</button><label>배속 <select id="rate"><option>1</option><option selected>10</option><option>60</option></select></label><output id="clock"></output><input id="timeline" type="range" step="1" aria-label="통행 재생 시각">`;
  document.querySelector('.legend').innerHTML='<span>┄ 기존 경로</span><span>━ 변경 경로</span><span>● 선택 차량</span><span>● 다른 차량</span>';
}
export async function startFleet(){
  panel();
  const [lab,base,index]=await Promise.all([get('/data/2026-11-03-road-lab.json'),get(prefix+'base.json'),get(prefix+'index.json')]);
  const geom={...lab.edges}, trips=base.trips;
  const keys=Object.keys(index);
  const title=k=>k==='isolate'?'도착지 진입로 폐쇄':(k.startsWith('open')?'개통':'폐쇄')+'　'+k.split('-').slice(1).join(' ↔ ');
  for(const k of keys){
    if(k.startsWith('open')){const [,a,b]=k.split('-').map(Number);for(const [f,t] of [[a,b],[b,a]])geom['new'+f+'_'+t]=[f,t,[lab.nodes[f],lab.nodes[t]]];}
  }
  const best=kind=>keys.filter(k=>k.startsWith(kind)).sort((a,b)=>index[b].changed-index[a].changed)[0];
  const ordered=[...new Set([best('open'),best('close'),'isolate',...keys])];
  for(const k of ordered)$('scenario').add(new Option(title(k)+' · 경로 변경 '+index[k].changed+'대',k));
  for(let i=0;i<trips.length;i++)$('unit').add(new Option(carName(i)+'　'+clock(trips[i].depart),i));
  $('trip').textContent='도담동 내부 통행 '+trips.length+'건 · 통행 1건을 승용차 1대로 가정했습니다.';
  let key='',after=base.tracks,changed=true,selected=0,time=0,playing=false,animation=0,last=0,token=0,city=null,flat=true;
  const frame={cars:[],selected,origin:lab.nodes[trips[0].a]};
  const fleet=fleetMesh(frame,trips.length);
  const svg=$('map'),ns='http://www.w3.org/2000/svg';
  const pts=Object.values(lab.nodes),xx=pts.map(p=>p[0]),zz=pts.map(p=>p[1]);
  svg.setAttribute('viewBox',[Math.min(...xx)-20,Math.min(...zz)-20,Math.max(...xx)-Math.min(...xx)+40,Math.max(...zz)-Math.min(...zz)+40].join(' '));
  function svgItem(tag,attrs,parent){const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);parent.append(e);return e;}
  function path(shape,color,width,group,dash=''){svgItem('polyline',{points:shape.map(p=>p.join(',')).join(' '),fill:'none',stroke:color,'stroke-width':width,'stroke-dasharray':dash},group);}
  for(const e of Object.values(lab.edges))path(e[2],'#acbdb5',4,svg);
  const lines=svgItem('g',{},svg),dots=svgItem('g',{},svg);
  function displayMap(isFlat){flat=isFlat;$('app').hidden=flat;svg.toggleAttribute('hidden',!flat);city?.show(!flat);paint();}
  function diffRoute(i){const a=base.tracks[i],b=after[i];return a&&b&&a.route.join()!==b.route.join();}
  function overlay(){
    if(!key)return;
    const tr=trips[selected],a=base.tracks[selected],b=after[selected],parts=key.split('-'),chosen=parts.slice(1).map(Number);
    const mode=key.startsWith('open')?'open':'close';
    frame.selected=selected;frame.origin=lab.nodes[tr.a];
    const j=a&&b?a.route.findIndex((e,i)=>e!==b.route[i]):-1;
    const fork=j>=0?geom[a.route[j]][0]:null;
    city?.update({fork,mode,chosen,valid:changed,applied:true,isolated:key==='isolate',original:a?.route||[],route:changed?b?.route||[]:[],origin:tr.a,destination:tr.b});
    lines.replaceChildren();
    if(changed && mode==='open')path(chosen.map(v=>lab.nodes[v]),'#40846c',9,lines);
    if(changed && mode==='close')for(const [f,t,shape] of Object.values(lab.edges)){
      if(key==='isolate'?t===lab.end:chosen.includes(f)&&chosen.includes(t))path(shape,'#b82c46',8,lines,'8 4');
    }
    for(const eid of a?.route||[])path(geom[eid][2],'#2869b9',6,lines,'9 5');
    if(changed)for(const eid of b?.route||[])path(geom[eid][2],'#db672b',3.5,lines);
    if(fork!==null){const [cx,cy]=lab.nodes[fork];svgItem('circle',{cx,cy,r:7,fill:'#c12e69',stroke:'white'},lines);}
    $('schedule').textContent='CSV 출발 '+clock(tr.depart)+' · CSV 도착 '+clock(tr.csvArrival)+' · 수단 코드 '+tr.mode;
    const duration=t=>t?t.end-t.start:null;
    $('old-time').textContent=a?duration(a)+'초':'경로 없음';$('new-time').textContent=b?duration(b)+'초':'경로 없음';
    let diff='연결 경로 없음';
    if(a&&b){
      diff=j<0?'동일 경로':'교차로 '+geom[a.route[j]][0]+'에서 경로 분기';
      const delta=duration(b)-duration(a);
      diff+=' · '+(delta===0?'통행시간 동일':Math.abs(delta)+'초 '+(delta>0?'증가':'감소'));
    }
    $('difference').textContent=diff+'　|　SUMO 도착 '+(a?clock(a.end):'—')+' → '+(b?clock(b.end):'—');
    $('baseline').setAttribute('aria-pressed',String(!changed));$('altered').setAttribute('aria-pressed',String(changed));
    const tracks=changed?after:base.tracks, count=tracks.filter(Boolean).length;
    $('totals').textContent=(changed?'변경':'기존')+' 도로 · 도착 '+count+'대 / 경로 없음 '+(trips.length-count)+'대';
  }
  function paint(){
    const tracks=changed?after:base.tracks;frame.cars=[];
    tracks.forEach((t,id)=>{const p=pose(t,time);if(p)frame.cars.push({...p,id});});
    if(flat){dots.replaceChildren();for(const c of frame.cars)svgItem('circle',{cx:c.x,cy:c.z,r:c.id===selected?9:6,fill:c.id===selected?'#ffb32c':'#089e94',stroke:'#26443a'},dots);}
    const current=frame.cars.find(c=>c.id===selected),t=tracks[selected];
    $('clock').textContent=clock(time);
    $('live').textContent='현재 운행 '+frame.cars.length+'대 · '+carName(selected)+' '+(current?current.speed.toFixed(1)+' km/h':!t?'경로 없음':time<t.start?'출발 대기':'도착');
    $('timeline').value=Math.floor(time);
  }
  function stop(){cancelAnimationFrame(animation);playing=false;$('play').textContent='재생';}
  function tick(now){
    if(!playing)return;
    time=Math.min(+$('timeline').max,time+(now-last)/1000*Number($('rate').value));last=now;paint();
    if(time>=+$('timeline').max)stop();else animation=requestAnimationFrame(tick);
  }
  async function load(k,first=false){
    const id=++token;stop();$('result').textContent='SUMO 결과를 불러오는 중…';
    try{
      const delta=index[k].delta?await get(prefix+k+'.json'):{};
      if(id!==token)return;
      key=k;after=base.tracks.map((t,i)=>Object.hasOwn(delta,i)?delta[i]:t);
      $('timeline').min=Math.min(...trips.map(t=>t.depart));
      $('timeline').max=Math.max(...base.tracks.concat(after).filter(Boolean).map(t=>t.end));
      if(first){
        // Open at a busy second where a route-changing car is actually on screen.
        let peak=-1;
        for(let i=0;i<trips.length;i++){
          if(!after[i]||!base.tracks[i])continue;
          const candidate=Math.max(after[i].start,base.tracks[i].start)+3;
          if(candidate>=Math.min(after[i].end,base.tracks[i].end))continue;
          const score=after.filter(t=>t&&candidate>=t.start&&candidate<t.end).length+(diffRoute(i)?trips.length:0);
          if(score>peak){peak=score;time=candidate;selected=i;}
        }
        $('unit').value=selected;
      }
      time=Math.max(+$('timeline').min,Math.min(time,+$('timeline').max));
      overlay();paint();$('result').textContent=base.engine+' · 1초 단위 차량 위치와 속도';
    }catch(e){if(id===token){$('scenario').value=key;$('result').textContent=e.message;}}
  }
  $('scenario').onchange=e=>load(e.target.value);
  $('unit').onchange=e=>{selected=Number(e.target.value);overlay();paint();};
  $('jump').onclick=()=>{stop();time=(changed?after:base.tracks)[selected]?.start??trips[selected].depart;paint();};
  for(const [id,value] of [['baseline',false],['altered',true]])$(id).onclick=()=>{stop();changed=value;overlay();paint();};
  $('timeline').oninput=e=>{stop();time=+e.target.value;paint();};
  $('reset').onclick=()=>{stop();time=+$('timeline').min;paint();};
  $('play').onclick=()=>{if(playing)return stop();if(time>=+$('timeline').max)time=+$('timeline').min;playing=true;last=performance.now();$('play').textContent='일시정지';animation=requestAnimationFrame(tick);};
  $('plan-view').onclick=()=>displayMap(true);
  for(const [id,near] of [['city-over',false],['city-near',true]])$(id).onclick=()=>{displayMap(false);city?.view(near);};
  const requested=new URLSearchParams(location.search).get('scenario');
  $('scenario').value=Object.hasOwn(index,requested)?requested:ordered[0];
  await load($('scenario').value,true);
  try{
    city=await createExperimentCity($('app'),lab,geom,()=>{},fleet);
    $('city-loading').remove();$('city-over').disabled=$('city-near').disabled=false;
    overlay();displayMap(false);city.view(false);
  }catch(e){displayMap(true);$('result').textContent='3D를 열 수 없어 같은 SUMO 결과를 평면도에 표시합니다.';console.error(e);}
}

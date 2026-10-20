import './2026-10-16-trip-viewer.css';
import {MODE_COLORS,decodeTrips,filterTrips,tripKey,routeState,activeTrips,displaySample,prepareRoute,positionOnRoute,clock,replayBounds} from './2026-10-16-trip-model.js';

const ROOT='/data/2026-10-16-trips/2026-10-16-manifest.json';
const fmt=n=>n.toLocaleString('ko-KR');
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const descriptions={external:'세종시 외부 포함 · 외부 위치가 없어 경로 미표시',same:'같은 지역 내 통행 · 상세 출발·도착 위치가 없어 경로 미표시',unmapped:'도로 연결 지점 확인 불가 · 경로 미표시',route:'지역별 가정 지점을 잇는 도로 최단거리 추정'};

export function mountTripViewer(){
 const opener=document.createElement('button');opener.className='trip-open';opener.textContent='CSV 통행 데이터 ↗';
 document.querySelector('.panel .actions').after(opener);
 const dialog=document.createElement('dialog');dialog.className='trip-dialog';dialog.setAttribute('aria-labelledby','trip-title');
 dialog.innerHTML=`<header><div><div class="trip-eyebrow">SEJONGSCAPE · TRIP EXPLORER</div><h2 id="trip-title">개인별 통행 데이터</h2><p>원본 시간·숫자 코드 / 도로 경로는 추정 · SUMO 실행 결과 아님</p></div><button class="trip-close" aria-label="통행 데이터 닫기">닫기 ×</button></header>
 <div class="trip-layout"><aside class="trip-controls">
 <label>출발 시간대<select data-hour aria-label="출발 시간대">${Array.from({length:24},(_,h)=>`<option value="${h}" ${h===7?'selected':''}>${String(h).padStart(2,'0')}:00–${String(h).padStart(2,'0')}:59 출발</option>`).join('')}</select></label>
 <form data-search><label>개인 ID · 하루 전체 조회<div class="trip-person"><input data-id type="number" min="0" step="1" placeholder="person_id" aria-label="개인 ID"><button>조회</button></div></label></form>
 <label>출발 지역<select data-origin aria-label="출발 지역"><option value="">전체</option></select></label>
 <label>도착 지역<select data-destination aria-label="도착 지역"><option value="">전체</option></select></label>
 <fieldset><legend>이동수단 코드 · 원본 숫자</legend><div class="trip-modes">${Object.keys(MODE_COLORS).map(m=>`<label style="color:${MODE_COLORS[m]}"><input type="checkbox" data-mode value="${m}" checked>${m}</label>`).join('')}</div></fieldset>
 <label>통행 목적<select data-purpose aria-label="통행 목적"><option value="">전체</option></select></label>
 <button class="trip-reset">필터 초기화 · 시간대 조회로</button><p class="trip-help">시간대는 출발 시각 기준입니다. 개인 ID 조회에서는 하루 전체 통행을 불러옵니다. 수단 코드의 의미는 추정하지 않습니다.</p>
 <div class="trip-status" role="status" aria-live="polite">데이터 준비 중…</div>
 <div class="trip-stats"><div class="trip-stat"><strong data-total>—</strong><span>전체 원본 통행</span></div><div class="trip-stat"><strong data-filtered>—</strong><span>현재 조건 통행</span></div><div class="trip-stat"><strong data-active>—</strong><span>현재 시각 통행 중</span></div><div class="trip-stat"><strong data-drawn>—</strong><span>지도 표시 / 경로 가능</span></div></div>
 <details><summary>자료와 추정 범위</summary><p>260316 - Mode&amp;Purpose.csv의 전체 통행을 보존했습니다. 날짜·GPS·상세 주소·실제 도로 경로는 원본에 없습니다.</p><p>읍·면·동별 가정 지점을 도로에 연결하고, OpenStreetMap 도로망의 방향을 따른 최단거리 경로를 계산했습니다. 이동수단별 통행 허용, 회전 제한, 신호·정체는 반영하지 않습니다.</p><p>원본 출발·도착 시간 사이에서 경로를 일정한 비율로 이동합니다. 동일 지역·외부 통행은 표에서 확인할 수 있으나 위치를 만들지 않습니다. 소요시간 0분 기록은 정적인 경로만 확인합니다.</p><p>지도는 최대 800건의 재현 가능한 표본을 표시합니다. 통계와 표는 표본이 아닌 조회 조건 전체입니다.</p><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors · ODbL</a></details></aside>
 <section class="trip-workspace"><div class="trip-map"><canvas aria-label="세종시 추정 통행 경로 지도"></canvas><div class="trip-mapbar"><div class="trip-map-note"><b>추정 경로</b> · 원본에 실제 이동 경로 없음<br><span data-map-count>데이터 준비 중</span></div><div class="trip-map-actions"><button data-fit>전체 보기</button><button data-zoom="1.5" aria-label="지도 확대">＋</button><button data-zoom="0.67" aria-label="지도 축소">−</button></div></div><div class="trip-map-legend">${Object.entries(MODE_COLORS).map(([m,c])=>`<span><i style="background:${c}"></i>${m}</span>`).join('')}</div><div class="trip-detail" hidden></div></div>
 <div class="trip-timebar"><button class="trip-play" disabled>재생</button><label>속도 <select data-rate><option value="30">30배</option><option value="60" selected>60배</option><option value="300">300배</option></select></label><input data-seek aria-label="통행 재생 시각" type="range" min="420" max="480" value="420" step="0.05" disabled><output data-time>07:00</output><div class="trip-time-caption">조회한 통행만 재생 · 원본 시각 기준 · 드래그 이동 / 휠 확대</div></div>
 <div class="trip-records"><div class="trip-table-heading"><h3>원본 통행 목록</h3><div class="trip-paging"><button data-prev>이전</button><span data-page>0 / 0</span><button data-next>다음</button></div></div><table><thead><tr><th>개인 ID / 순서</th><th>이동수단</th><th>출발 → 도착</th><th>시간</th><th>목적</th><th>경로</th></tr></thead><tbody></tbody></table></div></section></div>`;
 document.body.append(dialog);
 const $=s=>dialog.querySelector(s),all=s=>[...dialog.querySelectorAll(s)];
 let manifest,geo,raw=[],rows=[],selected=null,person=null,hour=7,page=0,time=420,bounds={start:420,end:480},playing=false,loading=false,requestId=0,initializing=null;
 const prepared=new Map(),cache=new Map();let eligible=[],shown=[],lastMinute=-1,width=0,height=0,scale=1,cx=0,cz=0,dirty=true,previous=0;
 const canvas=$('canvas'),ctx=canvas.getContext('2d'),background=document.createElement('canvas'),bg=background.getContext('2d');
 function status(s,error=false){$('.trip-status').textContent=s;$('.trip-status').dataset.error=String(error);}
 async function json(url){const r=await fetch(url);if(!r.ok)throw Error(`자료 응답 ${r.status}`);return r.json();}
 async function initialize(){
  manifest=await json(ROOT);geo=await json(manifest.routesUrl);
  for(const name of ['origin','destination'])$(`[data-${name}]`).insertAdjacentHTML('beforeend',manifest.regions.map((s,i)=>`<option value="${i}">${escape(s)}</option>`).join(''));
  $('[data-purpose]').insertAdjacentHTML('beforeend',manifest.purposes.map((s,i)=>`<option value="${i}">${escape(s)}</option>`).join(''));
  $('[data-total]').textContent=fmt(manifest.total);fit();await load();
 }
 opener.onclick=async()=>{dialog.showModal();resize();if(!initializing)initializing=initialize().catch(e=>{initializing=null;status('자료를 불러오지 못했습니다. 닫은 뒤 다시 열어 주세요. '+e.message,true);});await initializing;};
 $('.trip-close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>setPlaying(false));
 function setPlaying(value){playing=value;$('.trip-play').textContent=value?'일시정지':'재생';$('.trip-play').setAttribute('aria-pressed',String(value));}
 function route(r){const key=`${r.origin}:${r.destination}`;if(!geo.routes[key])return null;if(!prepared.has(key))prepared.set(key,prepareRoute(geo.routes[key]));return prepared.get(key);}
 async function load(){
  if(!manifest)return;const token=++requestId;loading=true;setPlaying(false);$('.trip-play').disabled=true;$('[data-seek]').disabled=true;
  raw=[];rows=[];shown=[];selected=null;$('.trip-detail').hidden=true;renderTable();lastMinute=-1;updateActive();status('통행 파일을 불러오는 중…');
  const key=person==null?`hour-${String(hour).padStart(2,'0')}`:`people-${String(Math.floor(person/10000)).padStart(3,'0')}`;
  try{
   let data=cache.get(key);if(!data){const file=manifest.files[key];if(file){const response=await fetch(file.url);if(!response.ok)throw Error(`자료 응답 ${response.status}`);data=decodeTrips(await response.arrayBuffer());if(data.length!==file.records)throw Error('기록 수 검증 실패');}else data=[];cache.set(key,data);if(cache.size>3)cache.delete(cache.keys().next().value);}
   if(token!==requestId)return;raw=data;loading=false;apply();
  }catch(e){if(token!==requestId)return;loading=false;status('파일을 불러오지 못했습니다. 시간대를 다시 선택해 주세요. '+e.message,true);}
 }
 function apply(){
  if(!geo||loading)return;rows=filterTrips(raw,{person,modes:all('[data-mode]:checked').map(el=>Number(el.value)),origin:$('[data-origin]').value,destination:$('[data-destination]').value,purpose:$('[data-purpose]').value});
  if(person!=null)rows.sort((a,b)=>a.seq-b.seq);page=0;selected=null;$('.trip-detail').hidden=true;
  bounds=replayBounds(rows,hour,person);time=bounds.start;setPlaying(false);lastMinute=-1;
  $('[data-seek]').min=bounds.start;$('[data-seek]').max=bounds.end;$('[data-seek]').disabled=!rows.length;$('.trip-play').disabled=!rows.length;
  $('[data-filtered]').textContent=fmt(rows.length);
  status(`${person==null?`${String(hour).padStart(2,'0')}시 출발`: `개인 ${person} · 하루 전체`} · ${fmt(rows.length)}건${!rows.length?' · 조건에 맞는 기록 없음':''}`);
  renderTable();updateActive();
 }
 $('[data-hour]').onchange=e=>{hour=Number(e.target.value);person=null;$('[data-id]').value='';load();};
 $('[data-search]').onsubmit=e=>{e.preventDefault();const value=$('[data-id]').value;if(value===''){person=null;}else{person=Number(value);if(!Number.isSafeInteger(person)||person<0){status('올바른 개인 ID를 입력해 주세요.',true);return;}}load();};
 for(const el of all('[data-origin],[data-destination],[data-purpose],[data-mode]'))el.onchange=apply;
 $('.trip-reset').onclick=()=>{person=null;$('[data-id]').value='';for(const el of all('[data-origin],[data-destination],[data-purpose]'))el.value='';for(const el of all('[data-mode]'))el.checked=true;load();};
 $('.trip-play').onclick=()=>{if(time>=bounds.end)time=bounds.start;setPlaying(!playing);};
 $('[data-seek]').oninput=e=>{time=Number(e.target.value);lastMinute=-1;updateActive();};
 $('[data-prev]').onclick=()=>{page--;renderTable();};$('[data-next]').onclick=()=>{page++;renderTable();};
 function renderTable(){
  const pages=Math.ceil(rows.length/50);$('[data-page]').textContent=`${pages?page+1:0} / ${fmt(pages)}`;$('[data-prev]').disabled=page<=0;$('[data-next]').disabled=page>=pages-1;
  $('tbody').innerHTML=rows.slice(page*50,page*50+50).map((r,i)=>`<tr data-row="${page*50+i}" aria-selected="${selected===r}"><td><button aria-label="개인 ${r.id} 통행 ${r.seq} 상세">${r.id} / ${r.seq}</button></td><td style="color:${MODE_COLORS[r.mode]}">${r.mode}</td><td>${escape(manifest.regions[r.origin])} → ${escape(manifest.regions[r.destination])}</td><td>${clock(r.start)} → ${clock(r.end)}</td><td>${escape(manifest.purposes[r.purpose])}</td><td>${routeState(r,geo.anchors)==='route'?'추정':routeState(r,geo.anchors)==='external'?'외부 포함':'미표시'}</td></tr>`).join('')||'<tr><td colspan="6" class="trip-empty">조건에 맞는 기록이 없습니다.</td></tr>';
 }
 $('tbody').onclick=e=>{const row=e.target.closest('[data-row]');if(row)select(rows[Number(row.dataset.row)]);};
 function select(r){
  selected=r;time=r.start;lastMinute=-1;setPlaying(false);const path=route(r),state=routeState(r,geo.anchors);
  $('.trip-detail').hidden=false;$('.trip-detail').innerHTML=`<button class="detail-close" aria-label="통행 상세 닫기">×</button><h3>개인 ${r.id} · 통행 ${r.seq}</h3><p class="detail-path">${escape(manifest.regions[r.origin])} → ${escape(manifest.regions[r.destination])}</p><p>${clock(r.start)} 출발 → ${clock(r.end)} 도착 (${r.end-r.start}분)</p><p>이동수단 <b style="color:${MODE_COLORS[r.mode]}">${r.mode}</b> · 목적 ${escape(manifest.purposes[r.purpose])}</p><p>성별 코드 ${r.gender} · 연령 그룹 ${r.age}<br>거주 지역 ${escape(manifest.regions[r.home])}<br>출발지 유형 ${r.originType} · 도착지 유형 ${r.destinationType}</p><p class="detail-source">${descriptions[state]}${path&&state==='route'?`<br>추정 도로 거리 ${(path.meters/1000).toFixed(2)} km`:''}${r.start===r.end?'<br>원본 소요시간 0분 · 이동 재생 제외':''}</p><button data-person="${r.id}">이 개인의 하루 통행 보기</button>`;
  $('.detail-close').onclick=()=>{selected=null;$('.trip-detail').hidden=true;renderTable();};
  $('[data-person]').onclick=()=>{person=r.id;$('[data-id]').value=r.id;for(const el of all('[data-origin],[data-destination],[data-purpose]'))el.value='';for(const el of all('[data-mode]'))el.checked=true;load();};
  if(path&&state==='route')fitPoints(path.points);renderTable();updateActive();
 }
 function updateActive(){
  $('[data-seek]').value=time;$('[data-time]').textContent=clock(time);
  if(!geo||lastMinute===Math.floor(time))return;lastMinute=Math.floor(time);
  const active=activeTrips(rows,time);eligible=active.filter(r=>routeState(r,geo.anchors)==='route'&&geo.routes[`${r.origin}:${r.destination}`]);shown=displaySample(eligible,800);
  $('[data-active]').textContent=fmt(active.length);$('[data-drawn]').textContent=`${fmt(shown.length)} / ${fmt(eligible.length)}`;
  $('[data-map-count]').textContent=`통행 중 ${fmt(active.length)}건 · 경로 가능 ${fmt(eligible.length)}건 중 ${fmt(shown.length)}건 표시`;
 }
 function fitPoints(points){if(!points.length)return;let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;for(const [x,z] of points){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);}cx=(minX+maxX)/2;cz=(minZ+maxZ)/2;scale=Math.min(width/Math.max(1000,maxX-minX),height/Math.max(1000,maxZ-minZ))*.78;dirty=true;}
 function fit(){if(geo)fitPoints(geo.anchors.filter(a=>a.point).map(a=>a.point));}
 $('[data-fit]').onclick=fit;for(const el of all('[data-zoom]'))el.onclick=()=>{scale=Math.min(3,Math.max(.002,scale*Number(el.dataset.zoom)));dirty=true;};
 const screen=p=>[(p[0]-cx)*scale+width/2,(p[1]-cz)*scale+height/2];
 function line(context,points){if(!points.length)return;context.moveTo(...screen(points[0]));for(let i=1;i<points.length;i++)context.lineTo(...screen(points[i]));}
 function drawBase(){
  bg.fillStyle='#10232b';bg.fillRect(0,0,width,height);if(!geo)return;
  bg.strokeStyle='#365058';bg.lineWidth=.7;bg.beginPath();for(const points of geo.roads)line(bg,points);bg.stroke();
  bg.font='11px system-ui';bg.textAlign='center';for(const a of geo.anchors){if(!a.point)continue;const [x,y]=screen(a.point);bg.fillStyle='#b9d4d0';bg.beginPath();bg.arc(x,y,2.5,0,Math.PI*2);bg.fill();bg.fillText(a.name,x,y-7);}dirty=false;
 }
 function draw(){
  if(dirty)drawBase();ctx.drawImage(background,0,0,width,height);if(!geo)return;
  if(selected&&routeState(selected,geo.anchors)==='route'){const path=route(selected);if(path){ctx.strokeStyle=MODE_COLORS[selected.mode];ctx.lineWidth=3;ctx.beginPath();line(ctx,path.points);ctx.stroke();for(const p of [path.points[0],path.points.at(-1)]){ctx.beginPath();ctx.arc(...screen(p),5,0,Math.PI*2);ctx.stroke();}}}
  for(const r of shown){const path=route(r);if(!path)continue;ctx.fillStyle=MODE_COLORS[r.mode];ctx.beginPath();ctx.arc(...screen(positionOnRoute(path,(time-r.start)/(r.end-r.start))),2.7,0,Math.PI*2);ctx.fill();}
  if(selected&&selected.end>selected.start&&selected.start<=time&&time<selected.end&&routeState(selected,geo.anchors)==='route'){const path=route(selected);if(path){ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(...screen(positionOnRoute(path,(time-selected.start)/(selected.end-selected.start))),5,0,Math.PI*2);ctx.fill();}}
 }
 function resize(){const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;width=rect.width;height=rect.height;const dpr=Math.min(devicePixelRatio,2);for(const c of [canvas,background]){c.width=Math.round(width*dpr);c.height=Math.round(height*dpr);}ctx.setTransform(dpr,0,0,dpr,0,0);bg.setTransform(dpr,0,0,dpr,0,0);if(scale===1)fit();dirty=true;}
 new ResizeObserver(resize).observe(canvas);
 let pointer=null;canvas.onpointerdown=e=>{pointer={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);};canvas.onpointermove=e=>{if(!pointer||e.pointerId!==pointer.id)return;cx-=(e.clientX-pointer.x)/scale;cz-=(e.clientY-pointer.y)/scale;pointer.x=e.clientX;pointer.y=e.clientY;dirty=true;};canvas.onpointerup=canvas.onpointercancel=()=>{pointer=null;};
 canvas.addEventListener('wheel',e=>{e.preventDefault();const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left-width/2,y=e.clientY-rect.top-height/2,old=scale;scale=Math.min(3,Math.max(.002,scale*Math.exp(-e.deltaY*.001)));cx+=x/old-x/scale;cz+=y/old-y/scale;dirty=true;},{passive:false});
 function frame(now){requestAnimationFrame(frame);const dt=Math.min(.15,(now-previous)/1000);previous=now;if(!dialog.open||document.hidden)return;if(playing){time=Math.min(bounds.end,time+dt*Number($('[data-rate]').value)/60);if(time>=bounds.end)setPlaying(false);}updateActive();draw();}requestAnimationFrame(frame);
}

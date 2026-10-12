import {project} from './map.js';
export function setupRecording({renderer,camera,controls,places,data,getMobility}){
 const W=1280,H=720,params=new URLSearchParams(location.search),END=Number(params.get('end')||330),START=Number(params.get('start')||0);
 const out=document.createElement('canvas');out.width=W;out.height=H;out.style='position:fixed;inset:0;width:100vw;height:100vh;object-fit:contain;background:#08151b;z-index:9999';document.body.append(out);const c=out.getContext('2d');
 const button=document.createElement('button');button.textContent='새 영상 녹화 시작';button.style='position:fixed;z-index:10001;right:24px;top:22px;padding:14px';document.body.append(button);
 renderer.setPixelRatio(1);renderer.setSize(W,H,false);camera.aspect=W/H;camera.updateProjectionMatrix();controls.enabled=false;controls.enableDamping=false;controls.maxPolarAngle=Math.PI*.65;
 const frames={};for(const [key,url] of [['traffic','/traffic.html'],['sumo','/sumo.html?filming=1']]){const f=document.createElement('iframe');f.src=url;f.style='position:fixed;left:0;top:0;width:1280px;height:720px;border:0;z-index:9990';document.body.append(f);frames[key]=f;}
 const roads=[774914675,219071320].map(id=>{const e=data.elements.find(x=>x.id===id);const points=e.geometry.map(p=>project(p,data.center));const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths[i-1]+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));return {points,lengths,total:lengths.at(-1),name:e.tags.name};});
 function at(road,dist){dist=Math.max(0,Math.min(road.total-.01,dist));let i=road.lengths.findIndex(v=>v>dist);i=Math.max(1,i);const a=road.points[i-1],b=road.points[i],u=(dist-road.lengths[i-1])/(road.lengths[i]-road.lengths[i-1]);return [a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u];}
 const chapters=[
 [0,18,'SEJONGSCAPE','도시를 살펴보고, 교통의 흐름을 읽다','세종시 3D 탐색과 교통 기능 시연'],
 [18,42,'01  도시 탐색','세종의 공간 구조를 한눈에','조감도에서 도로와 건물, 주요 장소를 살펴봅니다'],
 [42,72,'02  거리 시점','한누리대로를 따라','차도 중심으로 낮은 시점에서 이동합니다'],
 [72,102,'02  거리 시점','다솜1로에서 보는 도시','거리 시점에서는 방향키 또는 WASD로 이동할 수 있습니다'],
 [102,132,'03  주요 장소','공간을 가까이 살펴보기','주요 장소로 이동하고 드래그와 휠로 시점을 조절합니다'],
 [132,156,'04  도시의 움직임','시간대를 바꾸면 달라지는 풍경','보행자와 차량 수는 시간대별 시뮬레이션입니다'],
 [156,177,'05  실제 교통정보','도로별 관측값 확인','ITS의 구간 속도와 통행시간을 조회합니다'],
 [177,198,'05  실제 교통정보','색상을 읽기 전에, 관측 시각부터','현재 녹화는 9월 29일 12:30에 관측된 자료입니다'],
 [198,216,'05  실제 교통정보','도로를 선택해 자세히 보기','구간 경계와 진행 방향의 추가 검증이 필요합니다'],
 [216,240,'06  SUMO 교통 실험','계산된 차량 움직임을 재생','임의 생성 수요를 이용한 SUMO 실행 결과입니다'],
 [240,264,'06  SUMO 교통 실험','재생 속도를 바꾸고, 구간을 탐색','운행 중 차량 수와 평균 속도, 정지 차량을 확인합니다'],
 [264,285,'06  SUMO 교통 실험','실측 자료와 시뮬레이션의 구분','화면의 차량은 실제 개별 차량 위치가 아닙니다'],
 [285,315,'07  OD 설정 점검','실험을 시작하기 전, 입력 자료 확인','설정 파일과 필요한 도로망 및 통행 파일을 점검합니다'],
 [315,330,'SEJONGSCAPE','도시를 탐색하고, 교통을 이해하다','관측자료와 시뮬레이션을 구분하며 발전시키겠습니다']];
 let start=null,recorder,chunks=[],lastShot=-1;
 const doc=k=>frames[k].contentDocument;
 function action(i){if(i===4){document.querySelector('[data-place="library"]')?.click();}if(i===5){const s=document.querySelector('#period');s.value='morning';s.dispatchEvent(new Event('change'));}if(i===7){const d=doc('traffic'),p=d.querySelector('#past');p.checked=true;p.dispatchEvent(new Event('change'));}if(i===8){const d=doc('traffic'),s=d.querySelector('#search');s.value='다정북로';s.dispatchEvent(new Event('input'));d.querySelector('#roads button')?.click();}if(i===9)doc('sumo').querySelector('#play')?.click();if(i===10){const d=doc('sumo');d.querySelector('#rate').value='5';}if(i===11){const d=doc('sumo'),s=d.querySelector('#seek');s.value='300';s.dispatchEvent(new Event('input'));d.querySelector('#overview')?.click();}if(i===12)doc('sumo').querySelector('.scenario-open')?.click();}
 function pose(t){if(t>=42&&t<102){const r=roads[t<72?0:1],u=((t-42)%30)/30,dist=r.total*(.08+.78*u),a=at(r,dist),b=at(r,dist+35);camera.position.set(a[0],3.4,a[1]);controls.target.set(b[0],3,b[1]);camera.lookAt(controls.target);return;}const p=t<18?places.government:t<42?places.overview:t<132?places.library:t<156?places.government:places.overview;const angle=Math.sin(t*.016)*.2,[x,y,z]=p.offset;camera.position.set(p.target[0]+x*Math.cos(angle)+z*Math.sin(angle),p.target[1]+y,p.target[2]+z*Math.cos(angle)-x*Math.sin(angle));controls.target.set(...p.target);camera.lookAt(controls.target);}
 function text(s,x,y,size=23,color='#eef5f3'){c.fillStyle=color;c.font=`${size>=32?'600':'400'} ${size}px "Malgun Gothic",sans-serif`;c.fillText(s,x,y);}
 function panel(title,lines){c.fillStyle='rgba(8,23,31,.94)';c.fillRect(32,104,350,lines.length*45+82);text(title,52,141,26,'#b4ecd5');lines.forEach((s,i)=>text(s,52,190+i*43,19));}
 button.onclick=()=>{if(!doc('sumo')?.querySelector('#play:not(:disabled)')||!doc('traffic')?.querySelector('#roads button')){button.textContent='자료 로딩 후 다시 시작';return;}const stream=out.captureStream(30);const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8'].find(x=>MediaRecorder.isTypeSupported(x));recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:8000000});chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recorder.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());button.hidden=false;button.textContent='영상 저장 중';const r=await fetch('/__save_video_v2'+(START?'?clip=sumo':''),{method:'POST',body:new Blob(chunks,{type:mime})});button.textContent=r.ok?'새 영상 저장 완료':'영상 저장 실패';document.title=button.textContent;};lastShot=-1;start=performance.now();recorder.start(1000);button.hidden=true;};
 return now=>{const t=start===null?Number(new URLSearchParams(location.search).get('preview')||0):Math.min(END,START+(now-start)/1000),i=chapters.findIndex(s=>t>=s[0]&&t<s[1]),index=i<0?chapters.length-1:i,shot=chapters[index];if(index!==lastShot){action(index);lastShot=index;}
 c.fillStyle='#10232c';c.fillRect(0,0,W,H);const key=t>=156&&t<216?'traffic':t>=216&&t<315?'sumo':null;const source=key?doc(key)?.querySelector('canvas'):renderer.domElement;if(source)c.drawImage(source,0,0,W,H);
 c.fillStyle='rgba(8,21,27,.90)';c.fillRect(0,0,W,78);text('SEJONGSCAPE',32,35,22,'#b5e7d2');text(shot[2],32,65,20);c.textAlign='right';text(shot[0]===0?'FEATURE TOUR / 2026':shot[1]===330?'THANK YOU':shot[2].includes('OD')?'실험 준비':'기능 시연',1248,40,16,'#9db9bc');c.textAlign='left';
 if(t>=156&&t<216){const d=doc('traffic');panel('ITS 관측자료',[(d.querySelector('#stamp')?.textContent||'').replace('관측 기준 ',''),t<177?'15분이 지난 자료는 회색 표시':'지난 관측값 색상 표시 모드','15km/h 미만  /  빨강','15~25km/h 미만  /  노랑','25km/h 이상  /  초록']);if(t>=198){panel('다정북로 구간 조회',[d.querySelector('#speed')?.textContent||'',d.querySelector('#travel')?.textContent||'','관측값이며 현재 상황과 다를 수 있음']);}}
 if(t>=216&&t<285){const d=doc('sumo');panel('SUMO 실행 결과',[`운행 중  ${d.querySelector('#count')?.textContent}대`,`평균 속도  ${d.querySelector('#speed')?.textContent} km/h`,`정지 차량  ${d.querySelector('#stopped')?.textContent}대`,`재생  ${d.querySelector('#time')?.textContent}`,t<240?'재생 속도  1배':'재생 속도  5배']);}
 if(t>=285&&t<315){c.fillStyle='rgba(9,25,33,.96)';c.fillRect(135,110,1010,420);text('세종 OD 통행 배정 / 실행 전 점검',175,158,30,'#b4ecd5');['25시간 실행 설정 / 1초 계산 간격 / 중시적 모델','LLM 생성 OD 수요: 실측 차량 궤적과 구분','필수 입력: 도로망, 차량 통행, 보행 통행, 공간 자료, TAZ','경로 오류 무시 및 정체 차량 강제 이동 설정 확인','현재 기능: 설정과 파일명 점검 / 실제 실행은 별도 준비'].forEach((s,j)=>text(s,175,218+j*56,23));}
 c.fillStyle='rgba(6,17,24,.91)';c.fillRect(24,572,1232,111);text(shot[1]===330?'다음 단계':shot[3],48,611,27,'#b4ecd5');text(shot[4],48,651,24);
 c.fillStyle='#78dcb5';c.fillRect(24,681,1232*(t/END),3);text('지도 출처: OSM contributors / ODbL     |     건물 외관과 도시 움직임 일부는 추정',30,709,13,'#adc2c5');
 const edge=Math.min(t-shot[0],shot[1]-t);if(edge<.45){c.fillStyle=`rgba(5,15,22,${Math.max(0,1-edge/.45)})`;c.fillRect(0,0,W,H);}
 if(start!==null&&t>=END&&recorder.state==='recording'){recorder.stop();start=null;return;}pose(t);
 };
}

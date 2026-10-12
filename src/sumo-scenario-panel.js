import {inspectScenario,parseScenarioXml} from './sumo-scenario.js';

const assignment={
 'net-file':'sejong_koti.net.xml','route-files':'sejong_od.rou.xml,sejong_persons.rou.xml',
 'additional-files':'sejong_koti.poly.xml,sejong.taz.xml',begin:'0',end:'90000','step-length':'1',
 mesosim:'true','ignore-route-errors':'true','time-to-teleport':'300','pedestrian.model':'striping'
};

export function mountScenarioPanel() {
 const panel=document.createElement('dialog');panel.id='scenario-dialog';
 panel.innerHTML=`<div class="scenario-heading"><div><div class="kicker">실험 준비와 검증</div><h2>세종 OD 통행 배정</h2></div><button id="close-scenario" aria-label="설정 점검 닫기">닫기</button></div>
 <p class="badge">참고 설정 분석 · 현재 지도는 기존 임의 수요 시험 결과</p>
 <p>과제 문서의 수요는 <strong>LLM으로 생성한 OD 통행</strong>입니다. 실측 차량 궤적이 아닙니다. KTDB 도로망에 OSM 보행·자전거 연결을 보완하고, 행정동별 출발·도착 구간을 배정하는 연구 시나리오입니다.</p>
 <ol class="scenario-flow"><li>행정동별 OD와 TAZ 준비</li><li>방향별 도로·회전·보행 연결 검증</li><li>통행 배정과 SUMO 실행</li><li>실측 속도·교통량으로 비교 검증</li></ol>
 <h3>설정 파일 점검</h3><p>첨부된 설정을 기본으로 표시합니다. 다른 설정과 관련 파일을 함께 선택하면 누락 여부를 확인합니다. 파일은 브라우저에서만 읽으며 서버로 전송하지 않습니다.</p>
 <label class="file-picker">SUMO 설정 및 관련 파일 선택 <input id="scenario-files" type="file" multiple accept=".sumocfg,.xml"></label>
 <p id="scenario-message" role="status"></p><div id="scenario-report"></div>
 <h3>실행 전 확인할 내용</h3><ul><li>KTDB 양방향 링크를 방향별로 분리하고 회전 허용과 연결성을 확인합니다.</li><li>TAZ별 출발·도착 분포와 통행 수요의 생성 방식·난수를 기록합니다.</li><li>문서의 초기 경로 비용은 길이 ÷ 제한속도입니다. 혼잡을 반영한 재배정 여부는 별도 확인이 필요합니다.</li><li>실제 신호 자료가 없으면 신호 대기와 교차로 통과 결과를 실측으로 표시할 수 없습니다.</li><li>처음에는 짧은 구간을 실행하여 출발·도착·미완료·경로 오류·강제 이동을 확인한 뒤 전체 기간으로 확장합니다.</li></ul>
 <p class="note">파일이 모두 있어도 실행 성공을 보장하지 않습니다. 이 화면은 설정과 파일명만 점검하며 SUMO를 실행하거나 현재 재생 자료를 교체하지 않습니다.</p>
 <a href="https://eclipse.dev/sumo/docs/Simulation/Meso.html" target="_blank" rel="noreferrer">SUMO 중시적 모델 공식 문서 ↗</a>`;
 document.body.append(panel);
 const opener=document.createElement('button');opener.textContent='OD 설정과 입력 파일 점검';opener.className='scenario-open';
 document.querySelector('.panel .actions').after(opener);opener.onclick=()=>panel.showModal();
 panel.querySelector('#close-scenario').onclick=()=>panel.close();
 let options=assignment;
 function render(names=[]) {
  const result=inspectScenario(options,names),root=panel.querySelector('#scenario-report');root.replaceChildren();
  const add=(tag,text,parent=root)=>{const el=document.createElement(tag);el.textContent=text;parent.append(el);return el;};
  add('p',`${result.meso?'중시적 모델 (meso)':'미시적 모델 (micro)'} / ${result.duration?`${(result.duration/3600).toFixed(2)}시간`:'기간 확인 필요'} / 계산 간격 ${result.step}초`);
  add('h4',`참조 파일 ${result.files.length}개 중 ${result.missing.length}개 미선택`);
  const list=add('ul','');for(const f of result.files)add('li',`${f.present?'선택됨':'미선택'} — ${f.path}`,list);
  const warnings=add('ul','');warnings.className='scenario-warnings';for(const w of result.warnings)add('li',w,warnings);
 }
 render();
 panel.querySelector('#scenario-files').onchange=async e=>{
  const files=Array.from(e.target.files),configs=files.filter(f=>f.name.toLowerCase().endsWith('.sumocfg')),msg=panel.querySelector('#scenario-message');
  try {
   if(configs.length>1)throw Error('설정 파일은 한 번에 하나만 선택해 주세요.');
   if(configs[0]){if(configs[0].size>1024*1024)throw Error('설정 파일은 1MB 이하로 선택해 주세요.');options=parseScenarioXml(await configs[0].text());}
   render(files.map(f=>f.name));msg.textContent=configs[0]?`${configs[0].name} 설정을 점검했습니다.`:'표시된 설정을 기준으로 파일명을 점검했습니다.';
  }catch(err){msg.textContent=err.message;}
 };
}

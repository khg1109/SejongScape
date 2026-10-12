// Inspect configuration metadata only. File presence is not simulation validation.
export function inspectScenario(options, availableNames = []) {
 const required = ['net-file','route-files','additional-files'].flatMap(key =>
  (options[key] || '').split(',').map(s=>s.trim()).filter(Boolean).map(path=>({kind:key,path})));
 const names = new Set(availableNames.map(s=>s.replaceAll('\\','/')));
 const files = required.map(f=>({...f,present:names.has(f.path.replaceAll('\\','/'))}));
 const begin=Number(options.begin ?? 0),end=Number(options.end ?? -1),step=Number(options['step-length'] ?? 1);
 const duration=Number.isFinite(begin)&&Number.isFinite(end)&&end>begin?end-begin:null;
 const meso=['true','1'].includes(options.mesosim);
 const warnings=[];
 if(!options['net-file'])warnings.push('도로망 파일 설정이 없습니다.');
 if(!options['route-files'])warnings.push('차량 또는 보행자 통행 파일 설정이 없습니다.');
 if(!duration)warnings.push('시작·종료 시간을 확인하세요. 유한한 시험 구간이 필요합니다.');
 if(!Number.isFinite(step)||step<=0)warnings.push('계산 간격은 0보다 큰 수여야 합니다.');
 if(['true','1'].includes(options['ignore-route-errors']))warnings.push('경로 오류를 무시하도록 설정되어 있습니다. 누락된 통행을 로그에서 확인해야 합니다.');
 if(Number(options['time-to-teleport'] ?? 300)>0)warnings.push('장시간 정체 차량의 강제 이동이 활성화되어 있습니다. 발생 건수를 검증 지표에 포함하세요.');
 if(meso)warnings.push('중시적 모델의 차량 위치는 구간·대기열 기반 결과입니다. 미시적 차로 변경이나 실제 차량 궤적으로 해석하지 마세요.');
 if(meso&&options['pedestrian.model'])warnings.push('보행자 모델이 함께 지정되어 있습니다. 설치한 SUMO 버전과 도로망의 보행 허용·횡단 연결을 별도로 실행 검증해야 합니다.');
 return {files,missing:files.filter(f=>!f.present),duration,step,meso,warnings};
}

export function parseScenarioXml(xml, Parser = DOMParser) {
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('DTD·외부 엔티티가 없는 SUMO 설정 파일을 선택해 주세요.');
 const doc=new Parser().parseFromString(xml,'application/xml');
 if(doc.querySelector('parsererror')||doc.documentElement.tagName!=='configuration')throw Error('올바른 SUMO configuration XML이 아닙니다.');
 const options={};
 for(const section of ['input','time','processing','mesoscopic','routing','report']) {
  const node=Array.from(doc.documentElement.children).find(n=>n.tagName===section);
  if(node)for(const option of node.children)if(option.hasAttribute('value'))options[option.tagName]=option.getAttribute('value');
 }
 return options;
}

const $ = id => document.getElementById(id);
const svg = $('map');
const ns = 'http://www.w3.org/2000/svg';
const secondsPerMeter = 3.6 / 30;
const pairKey = (a,b) => [a,b].sort((x,y)=>x-y).join('-');
const meters = n => Math.round(n).toLocaleString('ko-KR')+' m';
function clock(seconds){
  return new Date(seconds*1000).toISOString().slice(11,19);
}
function el(tag, attrs, parent=svg){
  const node=document.createElementNS(ns,tag);
  for(const [k,v] of Object.entries(attrs)) node.setAttribute(k,v);
  parent.append(node);
  return node;
}
function points(edge){return edge[2].map(p=>p.join(',')).join(' ');}
function makeSelectable(node,label,onClick){
  node.setAttribute('role','button');node.setAttribute('aria-label',label);node.setAttribute('tabindex','0');
  node.addEventListener('click',onClick);
  node.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onClick();}});
}

async function init(){
  const response=await fetch('/data/2026-11-03-road-lab.json');
  if(!response.ok)throw Error('도로망을 불러오지 못했습니다.');
  const d=await response.json();
  let city=null, flat=false;
  const geom={...d.edges};
  for(const key of Object.keys(d.results)){
    if(!key.startsWith('open-'))continue;
    const [,a,b]=key.split('-').map((s,i)=>i?Number(s):s);
    geom['new'+a+'_'+b]=[a,b,[d.nodes[a],d.nodes[b]]];
    geom['new'+b+'_'+a]=[b,a,[d.nodes[b],d.nodes[a]]];
  }
  const lengths={};
  for(const [id,[,,shape]] of Object.entries(geom))
    lengths[id]=shape.reduce((n,p,i)=>i?n+Math.hypot(p[0]-shape[i-1][0],p[1]-shape[i-1][1]):0,0);
  const distance=path=>path.reduce((s,id)=>s+lengths[id],0);
  const baseLength=distance(d.base);
  let mode='open',chosen=[],isolated=false,applied=false,route=d.base,progress=0,playing=false,last=0,frame=0;
  const coords=Object.values(d.nodes);
  const xs=coords.map(p=>p[0]),ys=coords.map(p=>p[1]);
  const minX=Math.min(...xs)-45,minY=Math.min(...ys)-45;
  const vbWidth=Math.max(...xs)-minX+45,vbHeight=Math.max(...ys)-minY+45;
  svg.setAttribute('viewBox',[minX,minY,vbWidth,vbHeight].join(' '));
  const roads=el('g',{}),layers=el('g',{'pointer-events':'none'}),selection=el('g',{}),markers=el('g',{'pointer-events':'none'});
  const car=el('circle',{r:8,fill:'#143c32',stroke:'white','stroke-width':3},markers);
  const size=Math.max(vbWidth,vbHeight)/90;
  car.setAttribute('r',size*.65);
  const selectedKey=()=>isolated?'isolate':chosen.length===2?mode+'-'+pairKey(...chosen):'';
  function drawLine(group,edge,attrs){
    return el('polyline',{points:points(edge),fill:'none','stroke-linecap':'round','stroke-linejoin':'round',...attrs},group);
  }
  for(const edge of Object.values(d.edges))drawLine(roads,edge,{stroke:'#becac1','stroke-width':size*.28});
  function position(){
    let remaining=progress;
    for(let i=0;i<route.length;i++){
      const id=route[i];
      if(remaining>lengths[id] && i<route.length-1){remaining-=lengths[id];continue;}
      const shape=geom[id][2];
      for(let j=1;j<shape.length;j++){
        const a=shape[j-1],b=shape[j],len=Math.hypot(b[0]-a[0],b[1]-a[1]);
        if(remaining<=len || j===shape.length-1){
          const t=Math.max(0,Math.min(1,remaining/(len||1)));
          return {i,a,b,t,xy:[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]};
        }
        remaining-=len;
      }
    }
    const origin=d.nodes[d.start];return {i:0,xy:origin,a:origin,b:origin,t:0};
  }
  function paintCar(){
    const {xy,a,b,t}=position();city?.drive(xy,a,b,t);car.setAttribute('cx',xy[0]);car.setAttribute('cy',xy[1]);
    $('clock').textContent=clock(d.depart*60+progress*secondsPerMeter);
  }
  function stop(){playing=false;cancelAnimationFrame(frame);$('play').textContent='차량 재생';}
  function tick(now){
    if(!playing)return;
    progress=Math.min(distance(route),progress+(now-last)/1000*10/secondsPerMeter);last=now;paintCar();
    if(progress>=distance(route)){stop();$('play').disabled=true;$('apply').disabled=true;return;}
    frame=requestAnimationFrame(tick);
  }
  function select(v){
    if(applied)return;
    isolated=false;
    if(mode==='close')chosen=v;
    else if(chosen.length===1 && chosen[0]!==v)chosen=[chosen[0],v];
    else chosen=[v];
    draw();
  }
  function draw(){
    layers.replaceChildren();selection.replaceChildren();
    const key=selectedKey(),valid=!!d.results[key];
    $('open').setAttribute('aria-pressed',mode==='open');$('close').setAttribute('aria-pressed',mode==='close');
    for(const id of d.base)drawLine(layers,geom[id],{stroke:'#37669c','stroke-width':size*.64,'stroke-dasharray':size+' '+size*.35});
    if(key && valid){
      if(mode==='open')drawLine(layers,geom['new'+chosen[0]+'_'+chosen[1]],{stroke:'#378859','stroke-width':size*.65,'stroke-dasharray':'5 5'});
      else for(const edge of Object.values(d.edges)){
        if(isolated?edge[1]===d.end:pairKey(edge[0],edge[1])===pairKey(...chosen))drawLine(layers,edge,{stroke:'#a32f47','stroke-width':size*.9,'stroke-dasharray':'4 4'});
      }
    }
    if(applied)for(const id of route)drawLine(layers,geom[id],{stroke:'#db682e','stroke-width':size*.34});
    if(!applied && mode==='close'){
      const seen=new Set();
      for(const [a,b,shape] of Object.values(d.edges)){
        const k=pairKey(a,b);if(seen.has(k))continue;seen.add(k);
        const hit=drawLine(selection,[a,b,shape],{class:'hit',stroke:'transparent','stroke-width':size,'pointer-events':'stroke'});
        makeSelectable(hit,'구간 '+k+' 폐쇄 선택',()=>select([a,b]));
      }
    }
    if(!applied && mode==='open')for(const v of d.candidates){
      const [cx,cy]=d.nodes[v];
      const circ=el('circle',{class:'junction',cx,cy,r:size*.65,stroke:'#346457','stroke-width':2,fill:chosen.includes(v)?'#f4ad54':'#f8fff9'},selection);
      makeSelectable(circ,'교차로 '+v+' 선택',()=>select(v));
    }
    for(const [v,text] of [[d.start,'출발'],[d.end,'도착']]){
      const [x,y]=d.nodes[v];el('text',{x:x+size*.9,y:y-size*.6,'font-size':size*1.2,'font-weight':700,'paint-order':'stroke',stroke:'#f7faf6','stroke-width':4,fill:'#23483b','pointer-events':'none'},selection).textContent=text;
    }
    $('apply').disabled=applied||!valid||progress>=distance(route);
    $('isolate').hidden=mode!=='close';
    for(const id of ['open','close','example','isolate'])$(id).disabled=applied;
    $('hint').textContent=applied?'다른 구간을 실험하려면 처음부터를 누르세요.':isolated?'도착지로 진입하는 모든 도로를 폐쇄합니다.':chosen.length===2?(valid?'선택한 구간에 변경을 적용하세요.':'이미 연결된 두 지점입니다. 다른 두 교차로를 선택하세요.'):mode==='open'?(chosen.length?'연결할 두 번째 교차로를 선택하세요.':'지도에서 흰색 교차로 두 곳을 선택하세요.'):'지도에서 폐쇄할 도로 구간을 선택하세요.';
    city?.update({mode,chosen,applied,valid,isolated,route});
    paintCar();
  }
  function reset(){
    if($('fleet-link'))$('fleet-link').hidden=true;
    stop();route=d.base;progress=0;chosen=[];isolated=false;applied=false;$('after').textContent='—';$('play').disabled=false;
    $('result').textContent='출발 전 또는 차량 재생 중에 도로를 변경할 수 있습니다.';draw();
  }
  for(const kind of ['open','close'])$(kind).onclick=()=>{mode=kind;chosen=[];isolated=false;draw();};
  function departureIndex(){return progress>0?position().i+1:0;}
  function anchorAt(i){return i?geom[d.base[i-1]][1]:d.start;}
  $('isolate').onclick=()=>{isolated=true;chosen=[];draw();};
  $('example').onclick=()=>{
    isolated=false;
    const i=departureIndex(),anchor=anchorAt(i),rest=d.base.slice(i);
    const entries=Object.entries(d.results).filter(([key])=>key.startsWith(mode+'-'));
    const best=entries.filter(([,v])=>v[anchor] && v[anchor].join()!==rest.join()).sort((a,b)=>distance(a[1][anchor])-distance(b[1][anchor]))[0]||entries[0];
    chosen=best[0].split('-').slice(1).map(Number);draw();
  };
  $('apply').onclick=()=>{
    const key=selectedKey();if(!d.results[key]||applied)return;
    const i=departureIndex(),suffix=d.results[key][anchorAt(i)],prefix=d.base.slice(0,i);
    let fleetLink=$('fleet-link');
    if(!fleetLink){fleetLink=document.createElement('a');fleetLink.id='fleet-link';$('result').after(fleetLink);}
    fleetLink.textContent='이 도로 조건으로 CSV 차량 비교 ↗';fleetLink.href='?scenario='+encodeURIComponent(key);fleetLink.hidden=false;
    applied=true;route=prefix.concat(suffix||[]);
    if(!suffix){$('after').textContent='도달 불가';$('result').textContent='이 구역 안에서 목적지까지 연결되는 경로가 없습니다.';if(!route.length){stop();$('play').disabled=true;}}
    else{
      const delta=distance(route)-baseLength;
      $('after').textContent=meters(distance(route));$('result').textContent=(i?'현재 도로를 지난 뒤 다음 교차로부터 비교합니다. ':'')+
        (route.join()===d.base.join()?'기존 경로를 유지합니다.':Math.abs(delta)<.5?'같은 거리의 다른 경로를 이용합니다.':meters(Math.abs(delta))+(delta<0?' 짧은':' 긴')+' 경로로 이동합니다.');
    }
    draw();
  };
  $('play').onclick=()=>{if(playing){stop();return;}playing=true;last=performance.now();$('play').textContent='일시정지';frame=requestAnimationFrame(tick);};
  $('reset').onclick=reset;
  $('before').textContent=meters(baseLength);
  $('trip').textContent='도담동 → 도담동　'+clock(d.depart*60).slice(0,5)+' 출발 · CSV 기록상 '+clock(d.arrive*60).slice(0,5)+' 도착';
  $('engine').textContent=d.engine+' / 사전 계산한 변경 조건 '+Object.keys(d.results).length+'개';
  function switchView(kind){
    flat=kind==='flat';
    $('map').toggleAttribute('hidden',!flat);$('app').hidden=flat;city?.show(!flat);
    if(!flat)city?.view(kind==='near');
    for(const [id,k] of [['city-over','overview'],['city-near','near'],['plan-view','flat']])
      $(id).setAttribute('aria-pressed',String(k===kind));
  }
  $('city-over').onclick=()=>switchView('overview');
  $('city-near').onclick=()=>switchView('near');
  $('plan-view').onclick=()=>switchView('flat');
  reset();
  try{
    const {createExperimentCity}=await import('./2026-11-03-road-lab-3d.js');
    city=await createExperimentCity($('app'),d,geom,select);
    $('city-loading').remove();
    $('city-over').disabled=$('city-near').disabled=false;
    switchView(flat?'flat':'overview');draw();
  }catch(error){
    console.error(error);switchView('flat');
    $('plan-view').insertAdjacentText('afterend','3D 지도를 열 수 없어 평면도로 표시합니다.');
  }
}
const query=new URLSearchParams(location.search);
if(!query.has('view')&&!query.has('scenario'))location.replace('/2026-11-04-full-sumo.html');
else (query.get('view')==='edit'?init():import('./2026-11-03-csv-fleet.js').then(m=>m.startFleet())).catch(err=>{ $('trip').textContent='실험 자료를 열 수 없습니다.';$('result').textContent=err.message;});

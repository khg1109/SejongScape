import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {Line2} from 'three/addons/lines/Line2.js';
import {LineGeometry} from 'three/addons/lines/LineGeometry.js';
import {LineMaterial} from 'three/addons/lines/LineMaterial.js';
import {createTwinWorld} from './2026-10-16-twin-world.js';
import {createTwinVehicles} from './2026-10-16-twin-vehicles.js';
import {ribbon} from './2026-10-16-twin-geometry.js';

export async function createExperimentCity(host, data, geom, select, fleet=null) {
  const renderer = new THREE.WebGLRenderer({antialias:true, logarithmicDepthBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  renderer.domElement.setAttribute('aria-label','도담동 도시 모형. 드래그로 회전하고 휠로 확대합니다.');
  host.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const world = await createTwinWorld(scene, renderer);
  const camera = new THREE.PerspectiveCamera(44,1,.25,180000);
  const controls = new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true;
  controls.maxPolarAngle=Math.PI*.48;
  controls.minDistance=14;
  controls.maxDistance=5000;
  const overlay=new THREE.Group();
  scene.add(overlay);
  const vehicle=fleet ? null : createTwinVehicles(scene,1,{97:0xffc338});
  fleet?.mount(scene);
  const positions=new Float32Array(3);
  const routePoints=data.base.flatMap(id=>geom[id][2]);
  const bounds=new THREE.Box3().setFromPoints(routePoints.map(([x,z])=>new THREE.Vector3(x,0,z)));
  const center=bounds.getCenter(new THREE.Vector3());
  const size=bounds.getSize(new THREE.Vector3());
  let state, active=true, follow=false, position=data.nodes[data.start], leg=[position,position], fraction=0;
  const tracked=new THREE.Vector3(position[0],0,position[1]);
  const projected=new THREE.Vector3();
  function label(text,cls){
    const n=document.createElement('span');
    n.className='city-label '+cls;n.textContent=text;host.append(n);return n;
  }
  const startTag=label('출발','origin'), endTag=label('도착','destination'), carTag=label('차량','vehicle');
  const forkTag=fleet?label('경로 분기','fork'):null;
  if(forkTag)forkTag.hidden=true;
  function project(p,y=1){
    const v=projected.set(p[0],y,p[1]).project(camera);
    return [(v.x+1)*host.clientWidth/2,(1-v.y)*host.clientHeight/2,v.z];
  }
  function placeLabel(tag,point,height){
    const [x,y,z]=project(point,height);
    tag.hidden=z < -1 || z>1 || x<0 || x>host.clientWidth || y<0 || y>host.clientHeight;
    tag.style.left=x+'px';tag.style.top=y+'px';
  }
  function resize(){
    if(!host.clientWidth||!host.clientHeight)return;
    camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix();
    renderer.setSize(host.clientWidth,host.clientHeight,false);
    overlay.traverse(o=>o.material?.resolution?.set(host.clientWidth,host.clientHeight));
  }
  new ResizeObserver(resize).observe(host);
  function view(near){
    follow=near;resize();
    const p=new THREE.Vector3(position[0],0,position[1]);
    const span=Math.max(size.z,size.x/Math.max(.5,camera.aspect),250)*1.22;
    controls.target.copy(near?p:center);
    camera.position.copy(controls.target).add(near?new THREE.Vector3(19,28,32):new THREE.Vector3(span*.22,span*.76,span*.7));
    controls.update();tracked.copy(p);
  }
  function line(group,shape,color,width,height,dashed=false){
    if(shape.length<2)return;
    const geometry=new LineGeometry();
    geometry.setPositions(shape.flatMap(([x,z],i)=>{
      const adjacent=i===0?shape[1]:shape[i-1];
      const roadHeight=world.roadAt(shape[i],adjacent)?.y ?? .26;
      return [x,roadHeight+height,z];
    }));
    const mat=new LineMaterial({color,linewidth:width,dashed,dashSize:9,gapSize:6,toneMapped:false});
    mat.resolution.set(host.clientWidth||1,host.clientHeight||1);
    const path=new Line2(geometry,mat);path.computeLineDistances();group.add(path);
  }
  function pavement(shape,width,height,color,offset=0){
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(ribbon(shape,width,height,offset),3));
    const mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide}));
    overlay.add(mesh);
  }
  function barrier(shape){
    const i=Math.max(1,Math.floor(shape.length/2)),a=shape[i-1],b=shape[i];
    const rail=new THREE.Mesh(new THREE.BoxGeometry(7,1.1,.55),new THREE.MeshBasicMaterial({color:0xc03037}));
    rail.position.set((a[0]+b[0])/2,1.3,(a[1]+b[1])/2);
    rail.rotation.y=Math.atan2(b[0]-a[0],b[1]-a[1]);overlay.add(rail);
    for(const x of [-2,0,2]){
      const stripe=new THREE.Mesh(new THREE.BoxGeometry(.75,1.12,.58),new THREE.MeshBasicMaterial({color:0xffffff}));
      stripe.position.x=x;rail.add(stripe);
    }
  }
  const dot=document.createElement('canvas');dot.width=dot.height=48;
  const ctx=dot.getContext('2d');
  ctx.beginPath();ctx.arc(24,24,19,0,Math.PI*2);
  ctx.fillStyle='#fff';ctx.fill();ctx.lineWidth=6;ctx.strokeStyle='#294c45';ctx.stroke();
  const dotTexture=new THREE.CanvasTexture(dot);
  function update(next){
    state=next;
    overlay.traverse(o=>{if(!o.isSprite)o.geometry?.dispose();o.material?.dispose();});overlay.clear();
    const join=ids=>ids.flatMap((id,i)=>i?geom[id][2].slice(1):geom[id][2]);
    const {mode,chosen,applied,valid,isolated,route}=state;
    if(valid && mode==='open'){
      const shape=chosen.map(v=>data.nodes[v]);
      pavement(shape,8,.52,0x465459);
      for(const side of [-1,1])pavement(shape,.23,.58,0xf5eee1,side*3.6);
      line(overlay,shape,0xf2ce6b,1,.36,true);
      if(!applied)line(overlay,shape,0x229863,3,.45,true);
    }
    const closed=new Set();
    for(const [a,b,shape] of Object.values(data.edges)){
      if(mode!=='close')break;
      const key=[a,b].sort((x,y)=>x-y).join('-');
      if(closed.has(key))continue;
      const selected=valid&&(isolated?b===data.end:chosen.includes(a)&&chosen.includes(b));
      if(selected){line(overlay,shape,0xc33649,7,.19,true);barrier(shape);closed.add(key);}
      else if(!applied)line(overlay,shape,0x669893,1.5,.12);
    }
    line(overlay,join(next.original || data.base),0x246ee3,5,.19,true);
    if(applied)line(overlay,join(route),0xff7a25,3,.4);
    if(!applied && mode==='open')for(const v of data.candidates){
      const marker=new THREE.Sprite(new THREE.SpriteMaterial({map:dotTexture,color:chosen.includes(v)?0xffa329:0xffffff,sizeAttenuation:false,depthTest:false,toneMapped:false}));
      marker.scale.setScalar(11*2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/Math.max(240,host.clientHeight));
      const p=data.nodes[v];marker.position.set(p[0],7,p[1]);overlay.add(marker);
    }
  }
  const canvas=renderer.domElement;
  let down;
  canvas.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];});
  canvas.addEventListener('pointerup',e=>{
    if(!state||state.applied||e.button!==0||!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;
    const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
    let found=null,best=state.mode==='open'?16:10;
    function consider(a,b,id){
      if(a[2]>1||b[2]>1||a[2]<-1||b[2]<-1)return;
      const dx=b[0]-a[0],dy=b[1]-a[1];
      const t=THREE.MathUtils.clamp(((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1),0,1);
      const dist=Math.hypot(x-a[0]-dx*t,y-a[1]-dy*t);
      if(dist<best){best=dist;found=id;}
    }
    if(state.mode==='open')for(const v of data.candidates){const p=project(data.nodes[v],7);consider(p,p,v);}
    else for(const [a,b,shape] of Object.values(data.edges)){
      let prev=project(shape[0]);for(let i=1;i<shape.length;i++){const curr=project(shape[i]);consider(prev,curr,[a,b]);prev=curr;}
    }
    if(found!==null)select(found);
  });
  function drive(p,a,b,t){position=p;leg=[a,b];fraction=t;}
  resize();view(false);
  renderer.setAnimationLoop(()=>{
    if(!active||document.hidden)return;
    if(fleet?.focus)position=fleet.focus;
    const p=new THREE.Vector3(position[0],0,position[1]);
    if(follow){const shift=p.clone().sub(tracked);controls.target.add(shift);camera.position.add(shift);}
    tracked.copy(p);controls.update();
    world.update(camera,controls.target);
    const length=Math.hypot(leg[1][0]-leg[0][0],leg[1][1]-leg[0][1]);
    vehicle?.update([{row:{mode:97,start:0,end:1},path:{points:leg,cumulative:[0,length]}}],fraction,camera,controls.target,positions,world.revision+position[0]+position[1],world.roadAt);
    fleet?.render(camera,controls.target);
    renderer.render(scene,camera);
    placeLabel(startTag,data.nodes[state?.origin ?? data.start],6);placeLabel(endTag,data.nodes[state?.destination ?? data.end],6);placeLabel(carTag,position,4);
    if(fleet && !fleet.selectedActive)carTag.hidden=true;
    if(forkTag){if(state?.fork!=null)placeLabel(forkTag,data.nodes[state.fork],2);else forkTag.hidden=true;}
  });
  return {update,drive,view,show(value){active=value;if(value)resize();}};
}

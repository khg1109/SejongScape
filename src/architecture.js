import * as THREE from 'three';
import { buildingHeight, contains } from './map.js';
import {createBuildingDetails} from './building-detail.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export function footprintFrame(points) {
  let longest=0,angle=0;
  for(let i=1;i<points.length;i++){const dx=points[i][0]-points[i-1][0],dz=points[i][1]-points[i-1][1],l=Math.hypot(dx,dz);if(l>longest){longest=l;angle=Math.atan2(dz,dx);}}
  const c=Math.cos(angle),s=Math.sin(angle),local=points.map(([x,z])=>[x*c+z*s,-x*s+z*c]);
  const minX=Math.min(...local.map(p=>p[0])),maxX=Math.max(...local.map(p=>p[0])),minZ=Math.min(...local.map(p=>p[1])),maxZ=Math.max(...local.map(p=>p[1]));
  const x=(minX+maxX)/2,z=(minZ+maxZ)/2;
  return {x:x*c-z*s,z:x*s+z*c,width:maxX-minX,depth:maxZ-minZ,angle};
}
export function libraryProfile(u){const curve=(u*2-1)**2;return {top:17+9*curve,bottom:4.8+7*curve};}

export function createArchitecture() {
  const detailed=createBuildingDetails();
  const allMaterials=[],emissive=[];
  function mat(options){const m=new THREE.MeshStandardMaterial(options);allMaterials.push(m);return m;}
  const concrete=mat({color:0xd9d6ca,roughness:.85}),roof=mat({color:0xb9bcb7,roughness:.9});
  const greenRoof=mat({color:0x668150,roughness:1});
  const metal=mat({color:0xb0b9b9,metalness:.65,roughness:.34});
  const glass=mat({color:0x789aab,roughness:.21,metalness:.65,emissive:0xddc393,emissiveIntensity:.15});emissive.push(glass);
  const facades={};
  for(const kind of ['office','apartments','other']) {
    const maps=facadeMaps(kind);
    const m=mat({map:maps.color,emissiveMap:maps.light,emissive:0xffd69b,emissiveIntensity:.7,roughness:kind==='office'?.4:.8,metalness:kind==='office'?.25:.08});
    facades[kind]=m;emissive.push(m);
  }
  const unit=new THREE.BoxGeometry(1,1,1);
  function box(group,x,y,z,w,h,d,material){const m=new THREE.Mesh(unit,material);m.position.set(x,y,z);m.scale.set(w,h,d);m.castShadow=m.receiveShadow=true;group.add(m);return m;}
  function make(item,points) {
    const tags=item.tags||{},group=new THREE.Group(),height=buildingHeight(tags);
    const government=/\(\d+(?:-\d+)?동\)/.test(tags.name||'')&&tags.building==='office';
    const type=tags.building==='apartments'?'apartments':tags.building==='office'||tags.office?'office':'other';
    group.userData={name:tags.name||'이름 없는 건물',height:height.value,estimated:height.estimated,id:item.id,description:'OSM 외곽선 · 입면 연출'};
    if(tags.name==='국립세종도서관') {
      const frame=footprintFrame(points);group.position.set(frame.x,.5,frame.z);group.rotation.y=-frame.angle;
      const w=frame.width,d=frame.depth;
      box(group,0,-.28,0,w+14,.12,d+12,concrete);
      const vertices=[],indices=[];
      for(let i=0;i<=48;i++){const u=i/48,x=(u-.5)*w,{top}=libraryProfile(u);vertices.push(x,top,-d/2,x,top,d/2,x,top-1.15,-d/2,x,top-1.15,d/2);}
      for(let i=0;i<48;i++){const k=i*4,n=k+4;indices.push(k,n,k+1,n,n+1,k+1,k+2,k+3,n+2,n+2,k+3,n+3,k,k+2,n,n,k+2,n+2,k+1,n+1,k+3,n+1,n+3,k+3);}
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setIndex(indices);geo.computeVertexNormals();
      const canopy=new THREE.Mesh(geo,concrete);canopy.material=concrete.clone();canopy.material.side=THREE.DoubleSide;canopy.castShadow=canopy.receiveShadow=true;group.add(canopy);
      box(group,0,2,0,w*.85,4,d*.77,glass);
      for(let i=0;i<40;i++){
        const u=(i+.5)/40,x=(u-.5)*w,{top,bottom}=libraryProfile(u),h=top-bottom-1.2;
        for(const side of [-1,1]){box(group,x,bottom+h/2,side*(d/2-.9),w/40-.08,h,.16,glass);box(group,x-w/80,bottom+h/2,side*(d/2-.7),.11,h,.25,metal);}
        box(group,x,bottom-.4,0,w/40+.02,.85,d,concrete);
      }
      for(const side of [-1,1]){box(group,side*(w/2-.8),18,0,1.4,14,d,concrete);}
      group.userData.height=26;group.userData.estimated=true;group.userData.description='설계사 사진 기반 곡면 지붕·유리 입면 · 세부 치수 추정';
    } else if(tags.name==='대통령기록관') {
      const frame=footprintFrame(points);group.position.set(frame.x,.5,frame.z);group.rotation.y=-frame.angle;
      const w=frame.width,d=frame.depth,h=(w+d)/2;
      box(group,0,.7,0,w+3,1.4,d+3,concrete);
      box(group,0,h/2,0,w*.78,h*.9,d*.78,mat({color:0x9c947f,roughness:.9}));
      const skin=new THREE.MeshPhysicalMaterial({color:0xa9c0ba,metalness:.15,roughness:.16,transparent:true,opacity:.35,depthWrite:false,side:THREE.DoubleSide});
      box(group,0,h/2,0,w,h,d,skin);
      for(let i=0;i<=12;i++){
        const x=(i/12-.5)*w,z=(i/12-.5)*d;
        for(const side of [-1,1]){box(group,x,h/2,side*d/2,.09,h,.09,metal);box(group,side*w/2,h/2,z,.09,h,.09,metal);box(group,0,i/12*h,side*d/2,w,.07,.07,metal);box(group,side*w/2,i/12*h,0,.07,.07,d,metal);}
      }
      group.userData.height=h;group.userData.description='공식 소개 기반 석재 내부·유리 큐브 · 세부 치수 추정';
    } else if(!government) {
      group.add(detailed.build([{item,points}]));
      group.userData.description='OSM 외곽선·층수 우선 · 창호·외장·옥상 설비는 유형별 추정';
    } else {
      const shape=new THREE.Shape(points.map(p=>new THREE.Vector2(p[0],-p[1])));
      const cap=new THREE.ShapeGeometry(shape);cap.rotateX(-Math.PI/2);
      const top=new THREE.Mesh(cap,government?greenRoof:roof);top.position.y=height.value+.5;top.receiveShadow=true;group.add(top);
      const positions=[],uv=[];
      for(let i=1;i<points.length;i++){
        const a=points[i-1],b=points[i],l=Math.hypot(b[0]-a[0],b[1]-a[1]);
        positions.push(a[0],.5,a[1],b[0],.5,b[1],b[0],height.value+.5,b[1],a[0],.5,a[1],b[0],height.value+.5,b[1],a[0],height.value+.5,a[1]);
        uv.push(0,0,l,0,l,height.value,0,0,l,height.value,0,height.value);
      }
      const sides=new THREE.BufferGeometry();sides.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));sides.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));sides.computeVertexNormals();
      facades[type].side=THREE.DoubleSide;const walls=new THREE.Mesh(sides,facades[type]);walls.castShadow=walls.receiveShadow=true;group.add(walls);
      if(government){
        group.userData.description='OSM 외곽선 · 정부청사 옥상정원 특징 반영';
        const floors=Math.max(1,Number.parseInt(tags['building:levels'])||Math.round(height.value/3.2));
        const bands=[];
        for(let i=1;i<points.length;i++){
          const a=points[i-1],b=points[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<2)continue;
          for(let f=1;f<=floors;f++){
            const band=new THREE.BoxGeometry(length,.18,.35);band.rotateY(-Math.atan2(dz,dx));band.translate((a[0]+b[0])/2,f*height.value/floors+.5,(a[1]+b[1])/2);bands.push(band);
          }
        }
        if(bands.length){group.add(new THREE.Mesh(mergeGeometries(bands),concrete));bands.forEach(g=>g.dispose());}
        const edge=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(p[0],height.value+1.4,p[1]))),new THREE.LineBasicMaterial({color:0xc6cfbc}));group.add(edge);
      }
    }
    return group;
  }
  return {make,setNight(night){detailed.setNight(night);emissive.forEach(m=>m.emissiveIntensity=night?(m===glass?.3:.7):0);}};
}

function facadeMaps(kind) {
  const color=document.createElement('canvas'),light=document.createElement('canvas');color.width=light.width=256;color.height=light.height=256;
  const c=color.getContext('2d'),e=light.getContext('2d');c.fillStyle=kind==='apartments'?'#d4d0c3':kind==='office'?'#a1acae':'#c1bbae';c.fillRect(0,0,256,256);e.fillStyle='#000';e.fillRect(0,0,256,256);
  for(let y=0;y<4;y++)for(let x=0;x<4;x++){
    const X=x*64,Y=y*64,lit=(x*11+y*7)%7<2;
    c.fillStyle=kind==='office'?'#5b7785':'#536977';c.fillRect(X+10,Y+9,kind==='office'?52:31,40);
    c.fillStyle='#9caaac';c.fillRect(X+23,Y+9,1,40);c.fillRect(X+10,Y+29,kind==='office'?52:31,1);
    if(lit){e.fillStyle='#ffdc9e';e.fillRect(X+10,Y+9,kind==='office'?52:31,40);}
    c.fillStyle='#e0dfd4';c.fillRect(X,Y+57,64,4);
    if(kind==='apartments'){c.fillStyle='#b3b7b2';c.fillRect(X+8,Y+47,36,5);}
  }
  function texture(canvas){const t=new THREE.CanvasTexture(canvas);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(1/16,1/12.8);t.colorSpace=THREE.SRGBColorSpace;return t;}
  return {color:texture(color),light:texture(light)};
}

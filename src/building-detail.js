import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {buildingHeight,contains} from './map.js';

export function buildingStyle(tags){
  if(['apartments','dormitory'].includes(tags.building))return 'apartments';
  if(tags.office||['office','commercial'].includes(tags.building))return 'office';
  if(tags.shop||tags.building==='retail')return 'retail';
  if(['industrial','warehouse','hangar','barn','shed','garage','garages'].includes(tags.building))return 'industrial';
  if(['house','detached','semidetached_house','bungalow'].includes(tags.building))return 'house';
  return 'other';
}

export function detailGeometry(item,input){
  const tags=item.tags||{},style=buildingStyle(tags),points=[...input];
  if(points.length<3)return null;
  if(points[0][0]!==points.at(-1)[0]||points[0][1]!==points.at(-1)[1])points.push(points[0]);
  const height=buildingHeight(tags).value,levels=Math.max(1,Math.min(100,Number.parseInt(tags['building:levels'])||Math.round(height/(style==='industrial'?5:3.2)))),floor=height/levels;
  const seed=Number(item.id)||1,shade=[0xe5e1d7,0xd8d8ce,0xc8c9c3,0xd8cbb9,0xbcc7c9][seed%5];
  const wallColor=new THREE.Color(/^#[0-9a-f]{6}$/i.test(tags['building:colour']||'')?tags['building:colour']:shade);
  const positions=[],uv=[],colors=[],details=[],windows=[];
  const shape=new THREE.Shape(points.map(p=>new THREE.Vector2(p[0],-p[1])));
  let area=0;for(let i=1;i<points.length;i++)area+=points[i-1][0]*points[i][1]-points[i][0]*points[i-1][1];
  const side=area>=0?1:-1;
  function box(x,y,z,w,h,d,yaw=0){const g=new THREE.BoxGeometry(w,h,d).toNonIndexed();g.rotateY(yaw);g.translate(x,y,z);details.push(g);}
  let longest=null;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<.1)continue;
    const nx=dz/length*side,nz=-dx/length*side,yaw=-Math.atan2(dz,dx);
    if(!longest||length>longest.length)longest={a,b,length,nx,nz,yaw};
    positions.push(a[0],.3,a[1],b[0],.3,b[1],b[0],height+.3,b[1],a[0],.3,a[1],b[0],height+.3,b[1],a[0],height+.3,a[1]);
    // Eight bays / floors per texture: windows keep metre-scale proportions.
    const bays=Math.max(1,Math.round(length/(style==='office'?2.1:style==='industrial'?6:3.6)));
    uv.push(0,0,bays/8,0,bays/8,levels/8,0,0,bays/8,levels/8,0,levels/8);
    for(let j=0;j<6;j++)colors.push(wallColor.r,wallColor.g,wallColor.b);
    box((a[0]+b[0])/2,height+.65,(a[1]+b[1])/2,length,.7,.22,yaw);
    // Real geometry for apartment slab edges; the façade texture supplies fine rails and frames.
    if(style==='apartments'&&length>8){
      for(let f=1;f<levels;f++)box((a[0]+b[0])/2+nx*.18,f*floor+.3,(a[1]+b[1])/2+nz*.18,length,.14,.48,yaw);
      for(const u of [.12,.88])box(a[0]+dx*u+nx*.13,height/2,a[1]+dz*u+nz*.13,.25,height,.3,yaw);
    }
  }
  const walls=new THREE.BufferGeometry();walls.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));walls.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));walls.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));walls.computeVertexNormals();
  let roof=new THREE.ShapeGeometry(shape);roof.rotateX(-Math.PI/2);roof.translate(0,height+.3,0);if(roof.index){const g=roof.toNonIndexed();roof.dispose();roof=g;}
  // Keep rooftop equipment inside concave footprints, not at their bounding-box centre.
  const minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0])),minZ=Math.min(...points.map(p=>p[1])),maxZ=Math.max(...points.map(p=>p[1]));
  for(let j=0;j<3;j++){
    const x=minX+(maxX-minX)*(.3+j*.2),z=minZ+(maxZ-minZ)*(.36+(seed%3)*.1),w=style==='apartments'?3:1.5,d=2;
    if([[x-w/2,z-d/2],[x+w/2,z-d/2],[x+w/2,z+d/2],[x-w/2,z+d/2]].every(p=>contains(p,points)))box(x,height+.85,z,w,1.1,d);
  }
  if(longest&&longest.length>4){
    const {a,b,nx,nz,yaw,length}=longest,x=(a[0]+b[0])/2,z=(a[1]+b[1])/2;
    if(['retail','office'].includes(style)){
      const w=Math.min(length*.8,24),h=Math.min(3,height*.8),g=new THREE.BoxGeometry(w,h,.15).toNonIndexed();g.rotateY(yaw);g.translate(x+nx*.18,h/2+.3,z+nz*.18);windows.push(g);
      box(x+nx*.6,h+.45,z+nz*.6,w+.5,.18,1.5,yaw);
      for(let k=-Math.floor(w/4);k<=Math.floor(w/4);k++)box(x+Math.cos(yaw)*k*2+nx*.3,h/2,z-Math.sin(yaw)*k*2+nz*.3,.09,h,.2,yaw);
    }
    else if(style!=='industrial')box(x+nx*.8,2.5,z+nz*.8,2.5,.18,2,yaw);
  }
  return {style,walls,roof,details,windows,height,levels};
}

function facade(style){
  const a=document.createElement('canvas'),b=document.createElement('canvas');a.width=b.width=512;a.height=b.height=512;
  const c=a.getContext('2d'),e=b.getContext('2d');c.fillStyle='#f2f1ec';c.fillRect(0,0,512,512);e.fillStyle='#000';e.fillRect(0,0,512,512);
  for(let row=0;row<8;row++)for(let col=0;col<8;col++){
    const x=col*64,y=row*64,office=style==='office',industrial=style==='industrial',w=office?61:industrial?27:42,h=office?53:industrial?15:39,X=x+(64-w)/2,Y=y+7;
    c.fillStyle=office?'#697f89':'#526877';c.fillRect(X,Y,w,h);
    c.fillStyle=(row*13+col*17)%5===0?'#7c8b8d':'#82959c';c.fillRect(X+2,Y+2,w*.43,h-4);
    c.fillStyle='#ced0c9';c.fillRect(X+w*.5,Y,2,h);c.fillRect(X,Y+h*.55,w,1.5);
    c.fillStyle='#777f7d';c.fillRect(X-1,Y+h,w+2,2);
    c.fillStyle='#b5b9b5';c.fillRect(x,y+61,64,3);
    if(style==='apartments'){c.fillStyle='#c1c6c2';c.fillRect(X-3,Y+h+4,w+6,3);for(let k=0;k<6;k++)c.fillRect(X+k*w/5,Y+h-5,1,10);}
    if((row*19+col*7)%11<3){e.fillStyle=['#ffe3b4','#d1e7ea','#e9c892'][(row+col)%3];e.fillRect(X+2,Y+2,w-4,h-4);e.fillStyle='#000';e.fillRect(X+w*.5,Y,2,h);}
    if(industrial){c.strokeStyle='#c7cbc8';for(let k=0;k<64;k+=6){c.beginPath();c.moveTo(x+k,y);c.lineTo(x+k,y+64);c.stroke();}}
  }
  function texture(canvas){const t=new THREE.CanvasTexture(canvas);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;}
  return {map:texture(a),emissiveMap:texture(b)};
}

export function createBuildingDetails(){
  const materials={};for(const style of ['apartments','office','retail','industrial','house','other'])materials[style]=new THREE.MeshStandardMaterial({...facade(style),vertexColors:true,side:THREE.DoubleSide,roughness:style==='office'?.32:.8,metalness:style==='office'?.3:.05,emissive:0xffdfae,emissiveIntensity:.5});
  const roof=new THREE.MeshStandardMaterial({color:0x929b94,roughness:.95}),trim=new THREE.MeshStandardMaterial({color:0xd1d1c7,roughness:.75}),glass=new THREE.MeshStandardMaterial({color:0x546f79,roughness:.2,metalness:.5,emissive:0xc2c6ad,emissiveIntensity:.1});
  function build(items){
    const group=new THREE.Group(),buckets=new Map();
    function add(g,m){if(!buckets.has(m))buckets.set(m,[]);buckets.get(m).push(g);}
    for(const {item,points}of items){const result=detailGeometry(item,points);if(!result)continue;add(result.walls,materials[result.style]);add(result.roof,roof);result.details.forEach(g=>add(g,trim));result.windows.forEach(g=>add(g,glass));}
    for(const [m,geos]of buckets){const g=mergeGeometries(geos);geos.forEach(v=>v.dispose());if(g){const mesh=new THREE.Mesh(g,m);mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);}}
    return group;
  }
  return {build,setNight(value){Object.values(materials).forEach(m=>m.emissiveIntensity=value?.55:0);glass.emissiveIntensity=value?.25:0;}};
}

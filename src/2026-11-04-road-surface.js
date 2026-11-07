import * as THREE from 'three';

// Shared cross-sections keep both sides of a bend connected. All coordinates
// are projected metres; UVs match the existing asphalt texture scale.
export function roadSurface(points, width, y, {offset=0, caps=false}={}) {
  const pts=[];
  for(const p of points) {
    if(!p.every(Number.isFinite))continue;
    const last=pts.at(-1);
    if(!last||Math.hypot(p[0]-last[0],p[1]-last[1])>=.01)pts.push(p);
  }
  if(pts.length<2||!Number.isFinite(width)||width<=0)return null;
  const closed=pts.length>3&&Math.hypot(pts[0][0]-pts.at(-1)[0],pts[0][1]-pts.at(-1)[1])<.01;
  if(closed)pts.pop();
  const normals=[];
  for(let i=0;i<(closed?pts.length:pts.length-1);i++) {
    const a=pts[i],b=pts[(i+1)%pts.length],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
    normals.push([-dz/len,dx/len]);
  }
  const sections=pts.map((p,i)=>{
    const before=normals[(i-1+normals.length)%normals.length],after=normals[i%normals.length];
    let n;
    if(!closed&&i===0)n=after;
    else if(!closed&&i===pts.length-1)n=before;
    else {
      const sx=before[0]+after[0],sz=before[1]+after[1],len=Math.hypot(sx,sz);
      if(len<.001)n=after;
      else {
        const mx=sx/len,mz=sz/len;
        const scale=Math.min(3,1/Math.max(.001,mx*after[0]+mz*after[1]));
        n=[mx*scale,mz*scale];
      }
    }
    return [offset+width/2,offset-width/2].map(d=>[p[0]+n[0]*d,p[1]+n[1]*d]);
  });
  const vertices=[];
  function tri(a,b,c){
    // Keep upward-facing triangles even at a very sharp/reversing bend.
    if((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])>0)[b,c]=[c,b];
    vertices.push(a[0],y,a[1],b[0],y,b[1],c[0],y,c[1]);
  }
  for(let i=0;i<normals.length;i++) {
    const a=sections[i],b=sections[(i+1)%sections.length];
    tri(a[0],b[0],b[1]);tri(a[0],b[1],a[1]);
  }
  // Rounded end caps cover small wedges where separate mapped ways meet.
  if(caps&&!closed&&offset===0)for(const i of [0,pts.length-1]) {
    const n=normals[i===0?0:normals.length-1];
    const angle=Math.atan2(n[1],n[0])+(i===0?0:Math.PI),p=pts[i],r=width/2;
    for(let j=0;j<8;j++) {
      const a=angle+j*Math.PI/8,b=angle+(j+1)*Math.PI/8;
      tri(p,[p[0]+Math.cos(a)*r,p[1]+Math.sin(a)*r],[p[0]+Math.cos(b)*r,p[1]+Math.sin(b)*r]);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  const uv=[];for(let i=0;i<vertices.length;i+=3)uv.push(vertices[i]*.25,vertices[i+2]*.25);
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.computeVertexNormals();return geometry;
}

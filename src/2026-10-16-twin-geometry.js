// Pure geometry helpers. Lane dimensions are display assumptions when not mapped.
export function roadProfile(tags={}) {
 const pedestrian=['footway','path','steps','pedestrian','cycleway','track'].includes(tags.highway);
 const defaults={motorway:4,trunk:3,primary:3,secondary:2,tertiary:2,residential:2,service:1,living_street:1};
 const lanes=Math.max(1,Math.min(8,Number.parseInt(tags.lanes)||defaults[tags.highway]||2));
 const width=Math.max(1,Math.min(40,Number.parseFloat(tags.width)||(pedestrian?2.4:lanes*3.2+.6)));
 return {width,lanes,pedestrian,oneway:['yes','-1'].includes(tags.oneway)||tags.junction==='roundabout',y:tags.bridge&&tags.bridge!=='no'?1.24:.26};
}
export function ribbon(points,width,y=0,offset=0) {
 const positions=[];
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<.01)continue;
  const nx=-dz/length,nz=dx/length,l=offset-width/2,r=offset+width/2;
  positions.push(a[0]+nx*l,y,a[1]+nz*l,a[0]+nx*r,y,a[1]+nz*r,b[0]+nx*r,y,b[1]+nz*r,a[0]+nx*l,y,a[1]+nz*l,b[0]+nx*r,y,b[1]+nz*r,b[0]+nx*l,y,b[1]+nz*l);
 }
 // Rounded joins also close gaps where separately mapped ways meet at a node.
 // Thin paint ribbons retain their exact line width and do not receive end discs.
 if(width>1&&offset===0)for(const p of points)for(let i=0;i<12;i++){
  const a=i*Math.PI/6,b=(i+1)*Math.PI/6,r=width/2;
  positions.push(p[0],y,p[1],p[0]+Math.cos(b)*r,y,p[1]+Math.sin(b)*r,p[0]+Math.cos(a)*r,y,p[1]+Math.sin(a)*r);
 }
 return positions;
}
export function routePose(route,progress,offset=0) {
 const points=route.points,cumulative=route.cumulative,total=cumulative.at(-1)||0,target=Math.max(0,Math.min(1,progress))*total;
 let lo=1,hi=points.length-1;
 while(lo<hi){const mid=(lo+hi)>>1;if(cumulative[mid]<target)lo=mid+1;else hi=mid;}
 const a=points[Math.max(0,lo-1)],b=points[lo]||a,dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz)||1,f=Math.max(0,Math.min(1,(target-(cumulative[lo-1]||0))/length));
 return {x:a[0]+dx*f-dz/length*offset,z:a[1]+dz*f+dx/length*offset,yaw:Math.atan2(dx,dz),dx:dx/length,dz:dz/length,a,b};
}

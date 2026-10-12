export function sampleFrame(data,time){
 const index=Math.max(0,Math.min(data.frames.length-1,Math.floor(time)));
 const a=data.frames[index],b=data.frames[Math.min(index+1,data.frames.length-1)];
 const next=new Map(b.vehicles.map(v=>[v[0],v]));const fraction=time-index;
 return a.vehicles.map(v=>{const n=next.get(v[0]);if(!n)return v;const turn=((n[3]-v[3]+540)%360)-180;return [v[0],v[1]+(n[1]-v[1])*fraction,v[2]+(n[2]-v[2])*fraction,v[3]+turn*fraction,v[4]+(n[4]-v[4])*fraction];});
}
export function trafficStats(vehicles){return {count:vehicles.length,stopped:vehicles.filter(v=>v[4]<.1).length,meanKmh:vehicles.length?vehicles.reduce((s,v)=>s+v[4],0)/vehicles.length*3.6:0};}

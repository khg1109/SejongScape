"""All CSV records -> anonymous SUMO demand -> continuous whole-day trajectories.
SUMO mesoscopic model for full demand; no sampled vehicles. 5-second FCD snapshots.
Existing source data is read-only. Re-runs resume completed scenario outputs.
"""
import argparse,array,gzip,json,math,os,struct,subprocess,time,uuid
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'public/data'
OUT=DATA/'2026-11-04-full-sumo'
WORK=ROOT/'scripts/.cache/2026-11-04-full-sumo'
BIN=ROOT/'scripts/.cache/2026-11-03-sumo-runtime/sumo/bin'
SOURCE=DATA/'2026-10-16-trips'
PERIOD=5
END=93600 # 26:00, unfinished and waiting vehicles are reported explicitly

def name(s):return '2026-11-04-'+s

def save(path,obj):
 temp=path.with_name(path.name+'.'+uuid.uuid4().hex+'.tmp');temp.write_text(json.dumps(obj,ensure_ascii=False,separators=(',',':')));temp.replace(path)

def run(tool,args,log):
 started=time.monotonic()
 with open(log,'w') as f:
  p=subprocess.run([str(BIN/tool),*map(str,args),'--xml-validation','never'],stdout=f,stderr=f)
 if p.returncode:raise RuntimeError(log.read_text()[-3000:])
 print(tool,round(time.monotonic()-started,1),'seconds',flush=True)

def hashed(person,seq,region,salt):
 h=(person^((seq+1)*0x9e3779b9)^((region+1)*0x85ebca6b)^salt)&0xffffffff
 h=((h^(h>>16))*0x7feb352d)&0xffffffff;h=((h^(h>>15))*0x846ca68b)&0xffffffff
 return (h^(h>>16))&0xffffffff

def prepare(net):
 target=WORK/name('demand.json')
 if target.exists():return json.loads(target.read_text())
 rows=[]
 for file in sorted(SOURCE.glob('*hour-*.bin')):
  raw=file.read_bytes()
  for p in range(0,len(raw),20):
   person,seq=struct.unpack_from('<IB',raw,p)
   origin,dest,depart,arrival,mode,purpose=struct.unpack_from('<BBHHBB',raw,p+10)
   rows.append((seq,person,origin,dest,depart*60,arrival*60,mode,purpose))
 rows.sort(key=lambda r:(r[0],r[1]))
 last={};trips=[];counts=Counter(total=len(rows));pairs=set()
 for seq,person,o,d,dep,arr,mode,purpose in rows:
  op,dp=net['pools'][o],net['pools'][d]
  prior=last.get(person)
  a=(prior[1] if prior and prior[0]==o and prior[1] is not None else op[hashed(person,seq,o,17)%len(op)]) if op else None
  b=dp[hashed(person,seq,d,73)%len(dp)] if dp else None
  if a==b and b is not None:
   b=dp[(dp.index(b)+1+hashed(person,seq,d,131)%(len(dp)-1))%len(dp)]
  last[person]=(d,b)
  if a is None or b is None:counts['noLocation']+=1;continue
  if arr<=dep:counts['nonpositiveCsvDuration']+=1
  trips.append([dep,arr,a,b,mode,o,d,purpose]);pairs.add((a,b))
 trips.sort(key=lambda r:(r[0],r[2],r[3],r[1],r[4:]))
 counts['mapped']=len(trips)
 assert counts['total']==1111343 and counts['mapped']+counts['noLocation']==counts['total']
 obj=dict(counts=dict(counts),trips=trips,pairs=sorted(pairs));save(target,obj)
 # Public metadata contains anonymous trip indices, never original person IDs.
 with open(OUT/name('trips.bin'),'wb') as f:
  for dep,arr,a,b,mode,o,d,purpose in trips:f.write(struct.pack('<IIHHBBBB',dep,arr,a,b,mode,o,d,purpose))
 save(OUT/name('geometry.json'),{k:net[k] for k in ('center','regions','endpoints','vertices','points','edges')})
 print('Demand',dict(counts),'unique pairs',len(pairs),flush=True)
 return obj

def network(net,key):
 folder=WORK/name(key);folder.mkdir(exist_ok=True)
 result=folder/name('net.xml')
 if result.exists():return folder,result
 nodes=ET.Element('nodes');ways=ET.Element('edges')
 for i,p in enumerate(net['vertices']):
  x,z=net['points'][p];ET.SubElement(nodes,'node',id=str(i),x=str(x),y=str(-z),type='priority')
 for i,(a,b,length,points) in enumerate(net['edges']):
  if a==b or (key=='close' and {a,b}=={1529,1530}):continue
  ET.SubElement(ways,'edge',id=f'e{i}',**{'from':str(a),'to':str(b)},speed='8.333333',numLanes='1',shape=' '.join(f'{net["points"][p][0]},{-net["points"][p][1]}' for p in points))
 if key=='open':
  for a,b in ((1529,1531),(1531,1529)):
   ET.SubElement(ways,'edge',id=f'new{a}_{b}',**{'from':str(a),'to':str(b)},speed='8.333333',numLanes='1')
 for filename,tree in (('nodes.xml',nodes),('edges.xml',ways)):ET.ElementTree(tree).write(folder/name(filename),encoding='utf-8')
 run('netconvert',['-n',folder/name('nodes.xml'),'-e',folder/name('edges.xml'),'-o',result,'--no-turnarounds','--offset.disable-normalization','--no-warnings'],folder/name('net.log'))
 return folder,result

def route(net,demand,folder,netfile):
 routecache=folder/name('routes.json')
 if routecache.exists():return json.loads(routecache.read_text())
 pairs=folder/name('pairs.xml');routed=folder/name('routed.xml')
 with open(pairs,'w') as f:
  f.write('<routes>\n')
  for a,b in demand['pairs']:f.write(f'<trip id="p{a}_{b}" depart="0" fromJunction="{net["endpoints"][a]["vertex"]}" toJunction="{net["endpoints"][b]["vertex"]}"/>\n')
  f.write('</routes>')
 run('duarouter',['-n',netfile,'-r',pairs,'-o',routed,'--junction-taz','--ignore-errors','--bulk-routing','--routing-threads','2','--no-warnings','--no-step-log'],folder/name('route.log'))
 routes={}
 for _,e in ET.iterparse(routed,events=('end',)):
  if e.tag=='vehicle':routes[e.get('id')[1:]]=e.find('route').get('edges');e.clear()
 save(routecache,routes)
 return routes

def simulation(net,demand,key,until):
 folder,netfile=network(net,key);routes=route(net,demand,folder,netfile)
 public=OUT/name(key);public.mkdir(exist_ok=True)
 final=public/name('index.json')
 if final.exists():print('Already complete',key,flush=True);return
 req=folder/name('vehicles.xml');info=folder/name('tripinfo.xml');summary=folder/name('summary.xml')
 with open(req,'w') as f:
  f.write('<routes>\n<vType id="assumedPassenger" vClass="passenger" length="4.4" minGap="2.5" maxSpeed="8.333333" speedDev="0"/>\n')
  for pair,path in routes.items():f.write(f'<route id="r{pair}" edges="{path}"/>\n')
  routed_count=0
  for i,(dep,arr,a,b,*_) in enumerate(demand['trips']):
   if f'{a}_{b}' not in routes:continue
   f.write(f'<vehicle id="v{i}" type="assumedPassenger" depart="{dep}" route="r{a}_{b}"/>\n');routed_count+=1
  f.write('</routes>')
 # One uninterrupted simulation, no independent hourly restarts and no teleports.
 # Bound departure queue waiting to 30 minutes; every uninserted trip is reported.
 command=[str(BIN/'sumo'),'-n',str(netfile),'-r',str(req),'--mesosim','--meso-interpolate-pos','--meso-junction-control',
  '--begin','21600','--end',str(until),'--seed','42','--time-to-teleport','-1','--max-depart-delay','1800',
  '--fcd-output','stdout','--device.fcd.period',str(PERIOD),'--fcd-output.attributes','id,x,y,angle,speed',
  '--tripinfo-output',str(info),'--tripinfo-output.write-unfinished','--tripinfo-output.write-undeparted',
  '--summary-output',str(summary),'--summary-output.period','300','--no-step-log','--duration-log.disable','--xml-validation','never','--no-warnings']
 print('START',key,'routed',routed_count,'end',until,flush=True)
 started=time.monotonic()
 converter=WORK/name('pack-fcd')
 if not converter.exists():
  subprocess.run(['clang++','-O3','-std=c++17',str(ROOT/'scripts/2026-11-04-pack-fcd.cpp'),'-o',str(converter)],check=True)
 with open(folder/name('sumo.log'),'w') as log:
  proc=subprocess.Popen(command,stdout=subprocess.PIPE,stderr=log)
  packed=subprocess.Popen([str(converter),str(public),key],stdin=proc.stdout)
  proc.stdout.close()
  packcode=packed.wait();simcode=proc.wait()
  if packcode or simcode:raise RuntimeError('FCD/SUMO failed: '+log.name+' '+Path(log.name).read_text()[-2000:])
 frameindex=json.loads((public/name('frame-index.json')).read_text())
 chunks,maxcars=frameindex['chunks'],frameindex['maxActive']
 # SUMO writes self-closing XML for empty snapshots. Supply explicit zero frames
 # so a reset to 06:00 and cross-block seeks remain valid even with no vehicles.
 byblock={int(c['frames'][0][0])//300:c for c in chunks if c['frames']}
 for t in range(21600,until,PERIOD):
  block=t//300
  c=byblock.setdefault(block,dict(file=name(f'frames-{block:03d}.bin'),frames=[]))
  if not any(f[0]==t for f in c['frames']):
   path=public/c['file']
   if not c['frames']:
    with open(path,'wb'):pass
   with open(path,'ab') as f:
    offset=f.tell();f.write(struct.pack('<II',t,0))
   c['frames'].append([t,offset,0])
 chunks=sorted(byblock.values(),key=lambda c:min(f[0] for f in c['frames']))
 for c in chunks:c['frames'].sort()
 statuses=bytearray([0]*len(demand['trips'])); metrics=array.array('f',[-1]*(len(statuses)*4))
 for i,(_,_,a,b,*_) in enumerate(demand['trips']):
  if f'{a}_{b}' not in routes:statuses[i]=1 # no route
 counts=Counter()
 for _,e in ET.iterparse(info,events=('end',)):
  if e.tag!='tripinfo':continue
  i=int(e.get('id')[1:]);depart=float(e.get('depart'));arrival=float(e.get('arrival'))
  status=2 if depart<0 else 3 if arrival<0 else 4
  statuses[i]=status
  for j,k in enumerate(('depart','arrival','duration','routeLength')):metrics[i*4+j]=float(e.get(k))
  e.clear()
 counts.update(statuses)
 # Native SUMO may omit vehicles discarded after excessive departure delay.
 # status 0 = routed but not reported, shown as not inserted (never counted as arrived).
 with open(public/name('status.bin'),'wb') as f:f.write(statuses)
 with open(public/name('metrics.bin'),'wb') as f:metrics.tofile(f)
 summaries=[]
 for _,e in ET.iterparse(summary,events=('end',)):
  if e.tag=='step':summaries.append(dict(e.attrib));e.clear()
 stats=dict(routed=routed_count,noRoute=counts[1],notInserted=counts[0]+counts[2],unfinished=counts[3],arrived=counts[4],maxActive=maxcars,wallSeconds=round(time.monotonic()-started,1))
 assert sum(stats[k] for k in ('noRoute','notInserted','unfinished','arrived'))==len(statuses)
 save(public/name('index.json'),dict(key=key,begin=21600,end=until,period=PERIOD,recordBytes=16,chunks=chunks,stats=stats,summary=summaries))
 print('FINISHED',key,stats,flush=True)

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--scenario',choices=['base','open','close','all'],default='all');parser.add_argument('--end',type=int,default=END);args=parser.parse_args()
 OUT.mkdir(exist_ok=True);WORK.mkdir(exist_ok=True)
 net=json.loads((DATA/'2026-10-16-dispersal/2026-10-16-network.json').read_text());demand=prepare(net)
 for key in (['base','open','close'] if args.scenario=='all' else [args.scenario]):simulation(net,demand,key,args.end)
 available={k:json.loads((OUT/name(k)/name('index.json')).read_text())['stats'] for k in ('base','open','close') if (OUT/name(k)/name('index.json')).exists()}
 save(OUT/name('manifest.json'),dict(counts=demand['counts'],engine=subprocess.check_output([str(BIN/'sumo'),'--version'],text=True).splitlines()[0],model='mesoscopic',period=PERIOD,scenarios=available,regions=net['regions'],source='260316 - Mode&Purpose.csv',assumptions=['통행 1건을 승용차 1대로 가정','출발 및 도착 위치는 지역 내 추정 지점','제한속도 시속 30 km 및 방향별 1개 차로','실제 신호 주기와 관측 교통량 미보정','출발 대기 30분 초과는 미진입 처리','26시 종료 시 미도착 별도 집계']))
if __name__=='__main__':main()

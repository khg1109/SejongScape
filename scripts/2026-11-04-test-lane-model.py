"""Check source rules, all three network exports, and real microscopic lane use."""
import json,math,runpy,subprocess,gzip
from pathlib import Path
from collections import Counter
from xml.etree import ElementTree as ET
ROOT=Path(__file__).resolve().parents[1];N=lambda s:'2026-11-04-'+s
WORK=ROOT/'scripts/.cache/2026-11-04-lane-sumo';OUT=ROOT/'public/data/2026-11-04-lane-sumo'
h=runpy.run_path(str(ROOT/'scripts/2026-11-04-road-attributes.py'));attrs=h['attributes']
assert attrs({'lanes':'6'},True)['lanes']==3
assert attrs({'lanes':'6','lanes:forward':'4'},False)['lanes']==2
assert attrs({'lanes':'3','oneway':'-1'},False)['lanes']==3
assert abs(attrs({'maxspeed':'30 mph'},True)['speed']*3.6-48.28032)<.001
assert attrs({},True)['laneSource']=='estimated-direction'
net=json.loads((WORK/N('network.json')).read_text());report={'scenarios':{}}
for key in ('base','open','close'):
 tree=ET.parse(WORK/N(key)/N('net.xml')).getroot();edges={e.get('id'):e for e in tree.findall('edge') if e.get('function')!='internal'}
 data=json.loads((OUT/N(key)/N('lanes.json')).read_text());xml_lanes={l.get('id'):l for e in edges.values() for l in e.findall('lane')}
 assert len(xml_lanes)==len(data['lanes'])
 for eid,e in edges.items():
  if not eid.startswith('e'):continue
  p=net['roadProfiles'][int(eid[1:])];lanes=e.findall('lane');assert len(lanes)==p['lanes']
  assert all(abs(float(l.get('speed'))-p['speed'])<.011 and abs(float(l.get('width','3.2'))-p['width'])<.011 for l in lanes)
 for lane in data['lanes']:
  xml=xml_lanes[lane['id']];points=[[float(x),-float(y)] for x,y,*_ in (p.split(',') for p in xml.get('shape').split())]
  assert points==lane['centerline']
 report['scenarios'][key]={'lanes':len(xml_lanes),'connections':len(data['connections']),'laneGeometry':'matches SUMO XML'}
print(json.dumps(report),flush=True)
# Real CSV demand, first 30 simulation minutes, unmodified SUMO microscopic default.
test=WORK/N('lane-proof.xml.gz');base=WORK/N('base')
subprocess.run([str(ROOT/'scripts/.cache/2026-11-03-sumo-runtime/sumo/bin/sumo'),'-n',str(base/N('net.xml')),'-r',str(base/N('vehicles.xml')),'--begin','21600','--end','23400','--seed','42','--time-to-teleport','-1','--max-depart-delay','1800','--fcd-output',str(test),'--device.fcd.period','5','--fcd-output.attributes','id,x,y,lane,speed','--no-step-log','--no-warnings','--duration-log.disable'],check=True,stdout=subprocess.DEVNULL)
lanes={l.get('id'):l for e in ET.parse(base/N('net.xml')).getroot().findall('edge') for l in e.findall('lane')}
used=Counter();ids=set();maxspeed=0;maxdistance=0;checked=0;example=None
for _,e in ET.iterparse(gzip.open(test,'rb'),events=('end',)):
 if e.tag=='vehicle':
  lid=e.get('lane');l=lanes[lid];speed=float(e.get('speed'));maxspeed=max(maxspeed,speed)
  if not lid.startswith(':'):
   used[int(l.get('index'))]+=1
   if int(l.get('index'))>0:
    ids.add(e.get('id'));p=(float(e.get('x')),float(e.get('y')));points=[tuple(map(float,s.split(',')[:2])) for s in l.get('shape').split()]
    def distance(a,b):
     dx,dy=b[0]-a[0],b[1]-a[1];den=dx*dx+dy*dy;t=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/den)) if den else 0
     return math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)
    d=min(distance(a,b) for a,b in zip(points,points[1:]));maxdistance=max(maxdistance,d);checked+=1
    if example is None:example=dict(vehicle=e.get('id'),lane=lid,x=p[0],z=-p[1],speed=speed)
  e.clear()
assert ids,'Vehicles never use nonzero lanes'
assert maxdistance<.05,(maxdistance,'FCD does not follow exported lane centres')
assert maxspeed>8.34,'All vehicles unexpectedly capped at 30km/h'
report['microProof']=dict(period='06:00–06:30',samplesByLaneIndex=dict(used),vehiclesUsingAdditionalLanes=len(ids),checked=checked,maxCentrelineDistanceMetres=maxdistance,maxSpeedKmh=maxspeed*3.6,example=example)
report['validation']='passed';(OUT/N('lane-proof.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False,indent=2))

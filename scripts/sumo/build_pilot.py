"""Reproducible SUMO pilot: OSM roads, synthetic demand, uncalibrated signals."""
import argparse,datetime,json,math,os,pathlib,shutil,subprocess,sys,xml.etree.ElementTree as ET
ROOT=pathlib.Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser();p.add_argument('--period',type=float,default=2);p.add_argument('--duration',type=int,default=600);p.add_argument('--seed',type=int,default=42);args=p.parse_args()
if not 0.5<=args.period<=30 or not 60<=args.duration<=1800: p.error('period 0.5..30, duration 60..1800 required')
sumo=shutil.which('sumo');netconvert=shutil.which('netconvert')
if not sumo or not netconvert:raise SystemExit('SUMO and netconvert must be installed and on PATH')
home=pathlib.Path(sumo).resolve().parents[1];sys.path.insert(0,str(home/'tools'))
import traci,sumolib
work=ROOT/'scripts/.cache/sumo';work.mkdir(parents=True,exist_ok=True)
data=json.loads((ROOT/'public/data/sejong.json').read_text(encoding='utf8'));center=data['center']
def project(lon,lat):return [round((lon-center[1])*111320*math.cos(math.radians(center[0])),2),round(-(lat-center[0])*111320,2)]
ways=[e for e in data['elements'] if e.get('type')=='way' and e.get('tags',{}).get('highway') in {'primary','secondary','tertiary','residential','unclassified','service','primary_link','secondary_link','tertiary_link'} and len(e.get('nodes',[]))==len(e.get('geometry',[])) and len(e.get('nodes',[]))>1]
nodes={}
for way in ways:
 for nid,pos in zip(way['nodes'],way['geometry']):nodes[nid]=pos
node_tags={e['id']:e.get('tags',{}) for e in data['elements'] if e.get('type')=='node'}
traffic=json.loads((ROOT/'public/data/traffic.json').read_text(encoding='utf8'))
for e in traffic['elements']:
 if e.get('type')=='node':node_tags.setdefault(e['id'],{}).update(e.get('tags',{}))
osm=ET.Element('osm',version='0.6',generator='SejongScape SUMO pilot')
for nid,pos in nodes.items():
 node=ET.SubElement(osm,'node',id=str(nid),lat=str(pos['lat']),lon=str(pos['lon']),version='1')
 for k,v in node_tags.get(nid,{}).items():ET.SubElement(node,'tag',k=k,v=str(v))
for source in ways:
 way=ET.SubElement(osm,'way',id=str(source['id']),version='1')
 for nid in source['nodes']:ET.SubElement(way,'nd',ref=str(nid))
 for k,v in source.get('tags',{}).items():ET.SubElement(way,'tag',k=k,v=str(v))
ET.ElementTree(osm).write(work/'roads.osm.xml',encoding='utf-8',xml_declaration=True)
def run(command,name):
 with (work/(name+'.log')).open('w',encoding='utf8') as log:
  result=subprocess.run([str(x).replace(str(work)+os.sep,'') for x in command],cwd=work,stdout=log,stderr=subprocess.STDOUT)
 if result.returncode:raise RuntimeError(name+' failed: '+str(work/(name+'.log')))
run([netconvert,'--osm-files',work/'roads.osm.xml','--output-file',work/'network.net.xml','--geometry.remove','--junctions.join','--tls.discard-simple','--no-warnings','--keep-edges.components','1'],'netconvert')
end=120+args.duration
os.environ['PYTHONUTF8']='1'
ET.parse(work/'network.net.xml').write(work/'network.net.xml',encoding='ascii',xml_declaration=True)
run([sys.executable,'-X','utf8',home/'tools/randomTrips.py','-n',work/'network.net.xml','-o',work/'trips.xml','-r',work/'routes.rou.xml','--begin','0','--end',end,'--period',args.period,'--seed',args.seed,'--validate','--min-distance','300','--trip-attributes','departLane="best" departSpeed="desired"'],'trips')
net=sumolib.net.readNet(str(work/'network.net.xml'))
roads=[]
for edge in net.getEdges():
 for lane in edge.getLanes():
  if lane.allows('passenger'):roads.append({'id':lane.getID(),'width':lane.getWidth(),'shape':[project(*net.convertXY2LonLat(*point)) for point in lane.getShape()]})
frames=[];idmap={};teleports=0;arrived=0;departed=0;signals=[]
traci.start([sumo,'-n',str(work/'network.net.xml'),'-r',str(work/'routes.rou.xml'),'--step-length','1','--seed',str(args.seed),'--no-step-log','true','--duration-log.disable','true','--log',str(work/'simulation.log'),'--error-log',str(work/'warnings.log')])
try:
 for tls in traci.trafficlight.getIDList():
  seen=set()
  for index,links in enumerate(traci.trafficlight.getControlledLinks(tls)):
   for incoming,outgoing,via in links:
    if (incoming,index) in seen:continue
    seen.add((incoming,index));shape=traci.lane.getShape(incoming)
    if shape:signals.append({'tls':tls,'index':index,'point':project(*traci.simulation.convertGeo(*shape[-1]))})
 for step in range(end):
  traci.simulationStep();teleports+=traci.simulation.getStartingTeleportNumber();arrived+=traci.simulation.getArrivedNumber();departed+=traci.simulation.getDepartedNumber()
  if step<120:continue
  vehicles=[]
  for vid in traci.vehicle.getIDList():
   if vid not in idmap:idmap[vid]=len(idmap)
   lon,lat=traci.simulation.convertGeo(*traci.vehicle.getPosition(vid));x,z=project(lon,lat)
   vehicles.append([idmap[vid],x,z,round(traci.vehicle.getAngle(vid),1),round(traci.vehicle.getSpeed(vid),2)])
  frames.append({'t':step-120,'vehicles':vehicles,'signals':{tls:traci.trafficlight.getRedYellowGreenState(tls) for tls in traci.trafficlight.getIDList()}})
finally:traci.close()
result={'meta':{'engine':'Eclipse SUMO','version':subprocess.check_output([sumo,'--version'],text=True).splitlines()[0],'generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'mapDate':data.get('fetchedAt'),'center':center,'area':'정부세종청사·세종호수공원 일대 도로망','source':'OpenStreetMap contributors / ODbL-1.0','observed':False,'demand':'synthetic randomTrips','seed':args.seed,'departurePeriodSeconds':args.period,'warmupSeconds':120,'duration':args.duration,'teleports':teleports,'departed':departed,'arrived':arrived,'vehicles':len(idmap),'laneCount':len(roads),'signalControllers':len({s['tls'] for s in signals})},'roads':roads,'signals':signals,'frames':frames}
out=ROOT/'public/data/sumo-pilot.json';out.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')),encoding='utf8')
print(json.dumps(result['meta'],ensure_ascii=True));print('bytes',out.stat().st_size)

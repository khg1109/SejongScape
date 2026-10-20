"""Read the source CSV unchanged; export local replay data and assumed road routes.

Mode codes are opaque labels. Routes are NOT a SUMO run or observed trajectories.
Run once into a new dated directory. Never overwrite an existing export.
"""
import collections, csv, hashlib, heapq, json, math, pathlib, struct, sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
if len(sys.argv) != 2:
 raise SystemExit('Usage: python3 scripts/2026-10-16-build-trip-data.py /path/to/input.csv')
SOURCE = pathlib.Path(sys.argv[1])
OUT = ROOT / 'public/data/2026-10-16-trips'
OUT.mkdir(exist_ok=False)
PREFIX = '2026-10-16-'
CENTER = (36.501, 127.269)
# Approximate, deliberately chosen regional anchors, NOT individual addresses or
# administrative centroids. Some rural anchors use offices found in local OSM.
ANCHORS = {
 '고운동':(36.519,127.236), '종촌동':(36.504,127.246), '새롬동':(36.485,127.250),
 '다정동':(36.494,127.246), '아름동':(36.512,127.246), '도담동':(36.515,127.262),
 '소담동':(36.485,127.301), '보람동':(36.480,127.289), '한솔동':(36.479,127.254),
 '반곡동':(36.491,127.314), '대평동':(36.470,127.279), '해밀동':(36.531,127.268),
 '금남면':(36.4643103,127.2809875), '연서면':(36.5925516,127.271456),
 '장군면':(36.4967169,127.205506), '부강면':(36.5297953,127.3709732),
 '전의면':(36.6813763,127.1960324), '전동면':(36.655229,127.2641654),
 '연동면':(36.559,127.328), '연기면':(36.5418592,127.2737871),
 '소정면':(36.7223917,127.1582023), '조치원읍':(36.6045391,127.298462)
}
REGIONS = sorted(ANCHORS) + ['세종시 외부']
PURPOSES = ['등교','귀가','출근','업무','기타']
MODES = [1,2,3,4,97]
def project(lat, lon):
 return [(lon-CENTER[1])*111320*math.cos(math.radians(CENTER[0])), -(lat-CENTER[0])*111320]
def write_json(name, value):
 with (OUT/(PREFIX+name+'.json')).open('x',encoding='utf8') as f: json.dump(value,f,ensure_ascii=False,separators=(',',':'))

# Build a generic public-road graph, retaining OSM directionality. Mode-specific
# restrictions, turn restrictions, signals and congestion are not modeled.
allowed = {'primary','secondary','tertiary','unclassified','residential','service','primary_link','secondary_link','tertiary_link','living_street'}
ways = {}
for path in sorted((ROOT/'public/data/tiles').glob('*.json')):
 for e in json.loads(path.read_text())['elements']:
  tags=e.get('tags',{})
  if e.get('type')=='way' and tags.get('highway') in allowed and tags.get('access') not in ('private','no') and len(e.get('nodes',[]))==len(e.get('geometry',[])):
   ways[e['id']]=e
nodes={}; graph=collections.defaultdict(dict); reverse=collections.defaultdict(dict); background=[]
for w in ways.values():
 pts=[project(p['lat'],p['lon']) for p in w['geometry']]
 background.append([[round(x,1),round(y,1)] for x,y in pts])
 nodes.update(zip(w['nodes'],pts))
 one=w['tags'].get('oneway'); forward=one!='-1'; back=one not in ('yes','1','true','-1') and w['tags'].get('junction')!='roundabout'
 for a,b in zip(w['nodes'],w['nodes'][1:]):
  dist=math.dist(nodes[a],nodes[b])
  if forward: graph[a][b]=dist; reverse[b][a]=dist
  if back or one=='-1': graph[b][a]=dist; reverse[a][b]=dist
seed=min(nodes,key=lambda n:math.dist(nodes[n],project(36.501,127.269)))
def reachable(g,start):
 seen={start}; todo=[start]
 while todo:
  for n in g[todo.pop()]:
   if n not in seen:seen.add(n);todo.append(n)
 return seen
connected=reachable(graph,seed)&reachable(reverse,seed)
anchors=[]; snapped={}
for name in REGIONS:
 if name not in ANCHORS:anchors.append({'name':name,'point':None,'kind':'external'});continue
 target=project(*ANCHORS[name]); node=min(connected,key=lambda n:math.dist(nodes[n],target)); distance=math.dist(nodes[node],target)
 usable=distance<=2000
 anchors.append({'name':name,'point':[round(v,1) for v in nodes[node]] if usable else None,'approximateLatLon':ANCHORS[name],'snapMeters':round(distance),'kind':'assumed-road-anchor' if usable else 'unmapped'})
 if usable:snapped[name]=node
routes={}
for origin,start in snapped.items():
 dist={start:0}; previous={}; queue=[(0,start)]
 while queue:
  cost,node=heapq.heappop(queue)
  if cost!=dist[node]:continue
  for other,length in graph[node].items():
   new=cost+length
   if new<dist.get(other,float('inf')):dist[other]=new;previous[other]=node;heapq.heappush(queue,(new,other))
 for dest,end in snapped.items():
  if dest==origin or end not in dist:continue
  ids=[end]
  while ids[-1]!=start:ids.append(previous[ids[-1]])
  points=[[round(v,1) for v in nodes[n]] for n in reversed(ids)]
  routes[f'{REGIONS.index(origin)}:{REGIONS.index(dest)}']={'points':points,'meters':round(dist[end])}
city=json.loads((ROOT/'public/data/city.json').read_text())
write_json('routes',{'center':CENTER,'anchors':anchors,'routes':routes,'roads':background,'boundary':city['boundary'],'source':'Existing local OpenStreetMap tiles / ODbL-1.0','assumptions':'Approximate regional road anchors; shortest directed distance; no mode-specific or turn restrictions, signals or traffic assignment. Same-region and external trips have no route.'})

# Fixed 20-byte records: id:u32, seq/gender/age/home/origin-type/destination-type/
# origin-region/destination-region:u8, departure/arrival minutes:u16,
# opaque mode/purpose:u8, 2 padding bytes. Full records, never a sampled dataset.
record=struct.Struct('<I8B2H2B2x'); assert record.size==20
files={}; summary=collections.Counter(); mode_counts=collections.Counter(); purpose_counts=collections.Counter(); regions_counts=collections.Counter(); hourly=[0]*24; people=set(); keys=set(); same=external=zero=total=0
def stream(name):
 if name not in files:files[name]=(OUT/(PREFIX+name+'.bin')).open('xb')
 return files[name]
def minute(value):
 h,m=map(int,value.split(':'));assert 0<=h<=23 and 0<=m<60;return h*60+m
try:
 with SOURCE.open(encoding='utf-8-sig',newline='') as f:
  for r in csv.DictReader(f):
   pid=int(r['person_id']);seq=int(r['trip_sequence']); key=(pid,seq)
   assert key not in keys, f'Duplicate trip key {key}'
   keys.add(key);people.add(pid)
   o=REGIONS.index(r['origin_address']);d=REGIONS.index(r['destination_address']);dep=minute(r['start_time']);arr=minute(r['end_time']);mode=int(r['mode']);purpose=PURPOSES.index(r['purpose'])
   assert arr>=dep and mode in MODES
   packed=record.pack(pid,seq,int(r['gender']),int(r['age_group']),REGIONS.index(r['home_address']),int(r['origin']),int(r['destination']),o,d,dep,arr,mode,purpose)
   stream(f'hour-{dep//60:02d}').write(packed);stream(f'people-{pid//10000:03d}').write(packed)
   total+=1;hourly[dep//60]+=1;mode_counts[mode]+=1;purpose_counts[r['purpose']]+=1;regions_counts[r['home_address']]+=1;same+=o==d;external+=REGIONS[o]=='세종시 외부' or REGIONS[d]=='세종시 외부';zero+=arr==dep
finally:
 for f in files.values():f.close()
write_json('manifest',{'version':1,'sourceName':SOURCE.name,'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'recordBytes':20,'regions':REGIONS,'purposes':PURPOSES,'modes':MODES,'total':total,'people':len(people),'hourly':hourly,'modeCounts':mode_counts,'purposeCounts':purpose_counts,'homeCounts':regions_counts,'sameRegion':same,'external':external,'zeroDuration':zero,'minPerson':min(people),'maxPerson':max(people),'files':{name:{'url':'/data/2026-10-16-trips/'+PREFIX+name+'.bin','records':(OUT/(PREFIX+name+'.bin')).stat().st_size//20} for name in files},'routesUrl':'/data/2026-10-16-trips/'+PREFIX+'routes.json'})
print(json.dumps({'records':total,'people':len(people),'routes':len(routes),'roadWays':len(ways),'sameRegion':same,'external':external,'zeroDuration':zero,'anchors':anchors,'output':str(OUT)},ensure_ascii=False))

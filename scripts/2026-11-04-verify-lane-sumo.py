"""Audit actual SUMO artifacts; exit nonzero for truncated or inconsistent results."""
import argparse,collections,json,math,struct
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/data/2026-11-04-lane-sumo'
WORK=ROOT/'scripts/.cache/2026-11-04-lane-sumo'
N=lambda s:'2026-11-04-'+s
parser=argparse.ArgumentParser();parser.add_argument('--allow-partial',action='store_true');args=parser.parse_args()
demand=json.loads((WORK/N('demand.json')).read_text());count=len(demand['trips'])
assert count==876907
assert demand['counts']['total']==count+demand['counts']['noLocation']==1111343
assert (OUT/N('trips.bin')).stat().st_size==count*16
base=json.loads((WORK/N('base')/N('routes.json')).read_text())
report={'input':demand['counts'],'scenarios':{},'complete':True}
for key in ('base','open','close'):
 folder=OUT/N(key);final=folder/N('index.json')
 complete=final.exists()
 if not complete:assert args.allow_partial,'Calculation not complete: '+key
 index=json.loads((final if complete else folder/N('progress-index.json')).read_text())
 frames=0;car_records=0;times=[]
 for chunk in index['chunks']:
  path=folder/chunk['file'];size=path.stat().st_size
  with path.open('rb') as f:
   for t,offset,n in chunk['frames']:
    assert offset+8+n*16<=size,(path,offset,n,size)
    f.seek(offset);assert struct.unpack('<II',f.read(8))==(t,n)
    for sample in ([0,n-1] if n else []):
     f.seek(offset+8+sample*16);v,x,z,speed,angle=struct.unpack('<IffHH',f.read(16))
     assert v<count and math.isfinite(x) and math.isfinite(z) and angle<36000 and speed<=10000
    times.append(t);frames+=1;car_records+=n
 assert len(times)==len(set(times)),'Duplicate output timestamps'
 if complete:
  assert sorted(times)==list(range(21600,93600,5)),('Missing frame',key)
  statuses=(folder/N('status.bin')).read_bytes();assert len(statuses)==count
  assert (folder/N('metrics.bin')).stat().st_size==count*16
  tally=collections.Counter(statuses);s=index['stats']
  assert tally[4]==s['arrived'] and tally[3]==s['unfinished'] and tally[0]+tally[2]==s['notInserted']
  assert sum(s[k] for k in ['arrived','unfinished','notInserted','noRoute'])==count
 routes=json.loads((WORK/N(key)/N('routes.json')).read_text())
 assert len(routes)==len(demand['pairs'])==224933
 changed={p for p in base if base[p]!=routes[p]}
 changedtrips=sum(f'{t[2]}_{t[3]}' in changed for t in demand['trips'])
 if key=='open':
  import xml.etree.ElementTree as ET
  tree=ET.parse(WORK/N(key)/N('net.xml')).getroot()
  assert all(tree.find(f"edge[@id='{eid}']") is not None for eid in ('new1529_1531','new1531_1529'))
  assert any(c.get('to','').startswith('new') for c in tree.findall('connection'))
  report['newRoadRoutePairs']=sum('new1529_1531' in r or 'new1531_1529' in r for r in routes.values())
 if key=='close':
  geo=json.loads((OUT/N('geometry.json')).read_text())
  closed={f'e{i}' for i,e in enumerate(geo['edges']) if {e[0],e[1]}=={1529,1530}}
  assert all(not (closed&set(r.split())) for r in routes.values()),'Closed edge used'
 report['complete'] &= complete
 report['scenarios'][key]=dict(complete=complete,frames=frames,vehicleSamples=car_records,routePairs=len(routes),changedPairs=len(changed),changedTrips=changedtrips,stats=index['stats'])
report['validation']='passed'
dest=OUT/N('verification.json');dest.write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False,indent=2))

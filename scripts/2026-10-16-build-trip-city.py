"""Create lightweight 3D building envelopes from existing OSM tiles, unchanged."""
import json, math, pathlib, struct
root=pathlib.Path(__file__).resolve().parents[1]
center=(36.501,127.269)
def project(p):return [(p['lon']-center[1])*111320*math.cos(math.radians(center[0])),-(p['lat']-center[0])*111320]
buildings={}
for path in sorted((root/'public/data/tiles').glob('*.json')):
 for e in json.loads(path.read_text())['elements']:
  tags=e.get('tags',{});points=e.get('geometry',[])
  if not tags.get('building') or len(points)<4:continue
  ps=[project(p) for p in points];xs=[p[0] for p in ps];zs=[p[1] for p in ps]
  w=max(xs)-min(xs);d=max(zs)-min(zs)
  if not 1<w<600 or not 1<d<600:continue
  try:h=float(tags.get('height',''))
  except ValueError:
   try:h=float(tags.get('building:levels',''))*3.2
   except ValueError:h={'apartments':64,'office':28,'commercial':24,'house':6.4,'detached':6.4,'warehouse':8,'industrial':10}.get(tags['building'],14)
  buildings[e['id']]=[round((max(xs)+min(xs))/2,1),round((max(zs)+min(zs))/2,1),round(w,1),round(d,1),round(max(2,min(h,250)),1)]
m=json.loads((root/'public/data/2026-10-16-trips/2026-10-16-manifest.json').read_text());events=[0]*1441;departures=[0]*1440;arrivals=[0]*1440
for k,f in m['files'].items():
 if not k.startswith('hour-'):continue
 for r in struct.iter_unpack('<I8B2H2B2x',(root/'public'/f['url'].lstrip('/')).read_bytes()):
  departures[r[9]]+=1;arrivals[r[10]]+=1
  if r[10]>r[9]:events[r[9]]+=1;events[r[10]]-=1
active=[];n=0
for delta in events:n+=delta;active.append(n)
out=root/'public/data/2026-10-16-trip-city.json'
with out.open('x') as f:json.dump({'buildings':list(buildings.values()),'peakActive':max(active),'activeByMinute':active,'departures':departures,'arrivals':arrivals,'source':'OpenStreetMap / ODbL','geometry':'Simplified bounding boxes; floors x 3.2 m when height missing; otherwise assumed height'},f,separators=(',',':'))
print(json.dumps({'buildings':len(buildings),'peakActive':max(active),'bytes':out.stat().st_size}))

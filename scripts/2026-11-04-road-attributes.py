"""Recover directed OSM attributes from the exact geometry used by the demand graph."""
import json,math,re
from pathlib import Path
from collections import Counter
ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'public/data'
OUT=DATA/'2026-11-04-lane-sumo'
WORK=ROOT/'scripts/.cache/2026-11-04-lane-sumo'
ALLOWED={'primary','secondary','tertiary','unclassified','residential','service','primary_link','secondary_link','tertiary_link','living_street'}
def point(p):return (round((p['lon']-127.269)*111320*math.cos(math.radians(36.501)),2),round(-(p['lat']-36.501)*111320,2))
def number(v):
 s=str(v or '');return float(s) if re.fullmatch(r'\d+(\.\d+)?',s) else None
def attributes(tags,forward):
 one=tags.get('oneway') in ('yes','1','true','-1') or tags.get('junction')=='roundabout'
 direction='forward' if forward else 'backward'
 total=number(tags.get('lanes'));direct=number(tags.get('lanes:'+direction));other=number(tags.get('lanes:'+('backward' if forward else 'forward')));both=number(tags.get('lanes:both_ways')) or 0
 source='mapped-direction'
 if direct is not None:lanes=direct
 elif total and one:lanes=total;source='mapped-total'
 elif total and other is not None:lanes=total-other-both;source='mapped-total-minus-opposite'
 elif total and total>=2 and (total-both)%2==0:lanes=(total-both)/2;source='mapped-total-equal-split'
 else:lanes=1 if not total else max(1,math.floor((total-both)/2));source='estimated-direction'
 lanes=int(max(1,min(8,lanes)))
 raw=tags.get('maxspeed:'+direction,tags.get('maxspeed'));speed=number(raw)
 if speed is None and isinstance(raw,str) and re.fullmatch(r'\d+(\.\d+)?\s*mph',raw):speed=float(raw.split('mph')[0])*1.609344
 speedSource='mapped' if speed and 5<=speed<=130 else 'estimated-class'
 if speedSource!='mapped':speed={'primary':50,'secondary':50,'tertiary':40,'residential':30,'service':20,'living_street':20}.get(tags.get('highway'),30)
 width=number(tags.get('width'));totalWidthLanes=total or (lanes if one else lanes*2)
 laneWidth=width/totalWidthLanes if width and 2.5<=width/totalWidthLanes<=4.5 else 3.2
 return dict(lanes=lanes,speed=round(speed/3.6,6),width=round(laneWidth,3),oneway=one,laneSource=source,speedSource=speedSource,widthSource='mapped-width' if width and laneWidth==width/totalWidthLanes else 'estimated-3.2m',priority={'primary':6,'secondary':5,'tertiary':4,'residential':3,'unclassified':3,'service':2,'living_street':1}.get(tags.get('highway'),2))
def build():
 OUT.mkdir(exist_ok=True);WORK.mkdir(exist_ok=True)
 target=WORK/'2026-11-04-network.json'
 if target.exists():return json.loads(target.read_text())
 net=json.loads((DATA/'2026-10-16-dispersal/2026-10-16-network.json').read_text());ways={};relations={}
 for f in [DATA/'sejong.json',*sorted((DATA/'tiles').glob('*.json'))]:
  for e in json.loads(f.read_text())['elements']:
   t=e.get('tags',{});g=e.get('geometry',[])
   if e['type']=='relation' and t.get('type')=='restriction':relations[e['id']]=e
   if e['type']=='way' and t.get('highway') in ALLOWED and t.get('access') not in ('private','no') and t.get('area')!='yes' and len(e.get('nodes',[]))==len(g) and len(g)>1:ways[e['id']]=e
 segments={}
 for wid,e in ways.items():
  t=e['tags'];one=t.get('oneway');forward=one!='-1';back=one not in ('yes','1','true','-1') and t.get('junction')!='roundabout'
  for a,b in zip(e['geometry'],e['geometry'][1:]):
   a,b=point(a),point(b)
   if forward:segments[a,b]=dict(attributes(t,True),way=wid)
   if back or one=='-1':segments[b,a]=dict(attributes(t,False),way=wid)
 vertices=net['vertices'];vid={p:i for i,p in enumerate(vertices)};edges=[];profiles=[];counts=Counter();used=set()
 def vertex(p):
  if p not in vid:vid[p]=len(vertices);vertices.append(p)
  return vid[p]
 for old,(a,b,length,ps) in enumerate(net['edges']):
  groups=[]
  for p,q in zip(ps,ps[1:]):
   attr=segments.get((tuple(net['points'][p]),tuple(net['points'][q])))
   if attr is None:raise ValueError(f'Missing source road for edge {old}, {p}->{q}')
   # Split at changes in way/attributes; preserve end-point indices and geometry.
   if groups and groups[-1][0]==attr:groups[-1][1].append(q)
   else:groups.append((attr,[p,q]))
  for attr,path in groups:
   length=sum(math.dist(net['points'][p],net['points'][q]) for p,q in zip(path,path[1:]))
   edges.append([vertex(path[0]),vertex(path[-1]),round(length,3),path]);profiles.append(attr);used.add(attr['way'])
   counts['lanes_'+str(attr['lanes'])]+=1;counts[attr['laneSource']]+=1;counts['speed_'+attr['speedSource']]+=1
 net['edges']=edges;net['roadProfiles']=profiles;net['sourceWayIds']=sorted(used)
 report=dict(directionalEdges=len(edges),vertices=len(vertices),sourceWays=len(used),counts=dict(counts),restrictionRelations=len(relations),limitations=['No surveyed signal timing','Turn permissions inferred by netconvert; no verified turn restrictions','Missing direction/width/speed attributes are explicitly estimated','Existing connected demand graph does not include every road in Sejong'])
 (OUT/'2026-11-04-road-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
 target.write_text(json.dumps(net,separators=(',',':'),ensure_ascii=False));print(json.dumps(report,ensure_ascii=False),flush=True);return net
if __name__=='__main__':build()

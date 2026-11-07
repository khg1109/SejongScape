"""SUMO lane geometry is the single source for simulation and rendering."""
import json
from xml.etree import ElementTree as ET

def build_network(h,net,key):
 folder=h['WORK']/h['name'](key);folder.mkdir(exist_ok=True)
 result=folder/h['name']('net.xml')
 if not result.exists():
  nodes=ET.Element('nodes');ways=ET.Element('edges')
  for i,p in enumerate(net['vertices']):
   x,z=net['points'][p];ET.SubElement(nodes,'node',id=str(i),x=str(x),y=str(-z),type='priority')
  for i,((a,b,length,points),attr) in enumerate(zip(net['edges'],net['roadProfiles'])):
   if a==b or (key=='close' and {a,b}=={1529,1530}):continue
   ET.SubElement(ways,'edge',id=f'e{i}',**{'from':str(a),'to':str(b)},speed=str(attr['speed']),numLanes=str(attr['lanes']),width=str(attr['width']),priority=str(attr['priority']),spreadType='center' if attr['oneway'] else 'right',shape=' '.join(f'{net["points"][p][0]},{-net["points"][p][1]}' for p in points))
  if key=='open':
   for a,b in ((1529,1531),(1531,1529)):
    ET.SubElement(ways,'edge',id=f'new{a}_{b}',**{'from':str(a),'to':str(b)},speed='8.333333',numLanes='1',width='3.2',spreadType='right',priority='3')
  for filename,tree in (('nodes.xml',nodes),('edges.xml',ways)):ET.ElementTree(tree).write(folder/h['name'](filename),encoding='utf-8')
  h['run']('netconvert',['-n',folder/h['name']('nodes.xml'),'-e',folder/h['name']('edges.xml'),'-o',result,'--no-turnarounds','--offset.disable-normalization','--no-warnings'],folder/h['name']('net.log'))
 export_geometry(h,net,key,result)
 return folder,result

def export_geometry(h,net,key,file):
 dest=h['OUT']/h['name'](key);dest.mkdir(exist_ok=True)
 out=dest/h['name']('lanes.json')
 if out.exists():return
 tree=ET.parse(file).getroot();lanes=[];junctions=[]
 for e in tree.findall('edge'):
  if e.get('function')=='internal':continue
  eid=e.get('id');p=net['roadProfiles'][int(eid[1:])] if eid.startswith('e') else dict(lanes=1,oneway=False,laneSource='virtual-road',speedSource='virtual-road')
  for lane in e.findall('lane'):
   lanes.append(dict(id=lane.get('id'),edge=eid,index=int(lane.get('index')),width=float(lane.get('width','3.2')),speed=float(lane.get('speed')),centerline=[[float(x),-float(y)] for x,y,*_ in (s.split(',') for s in lane.get('shape').split())],inner=int(lane.get('index'))==p['lanes']-1,oneway=p['oneway'],laneSource=p['laneSource'],speedSource=p['speedSource']))
 for j in tree.findall('junction'):
  if j.get('type')=='internal' or not j.get('shape'):continue
  junctions.append([[float(x),-float(y)] for x,y,*_ in (s.split(',') for s in j.get('shape').split())])
 connections=[dict(c.attrib) for c in tree.findall('connection') if not c.get('from','').startswith(':')]
 h['save'](out,dict(lanes=lanes,junctions=junctions,sourceWayIds=net['sourceWayIds'],connections=connections))
 print('Exported',key,len(lanes),'lanes',len(connections),'connections',flush=True)

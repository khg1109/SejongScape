"""Build anonymous CSV-derived vehicle trajectories with native SUMO. Outputs are static."""
import json
import math
import os
import runpy
import struct
import subprocess
import tempfile
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from xml.etree import ElementTree as ET

helpers = runpy.run_path(str(Path(__file__).with_name('2026-11-03-build-road-lab.py')))
DATA, NET, slot, exe, write = (helpers[k] for k in ('DATA','NET','slot','exe','xml_file'))
lab = json.loads((DATA/'2026-11-03-road-lab.json').read_text())
out = DATA/'2026-11-03-csv-fleet'
out.mkdir(exist_ok=True)
def save(name, data):
    path = out/('2026-11-03-'+name+'.json')
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
    os.replace(tmp,path)

def demand():
    region = NET['regions'].index('도담동')
    pool = NET['pools'][region]
    trips = []
    raw = (DATA/'2026-10-16-trips/2026-10-16-hour-07.bin').read_bytes()
    for p in range(0,len(raw),20):
        person,seq = struct.unpack_from('<IB',raw,p)
        origin,dest,depart,arrive,mode = struct.unpack_from('<BBHHB',raw,p+10)
        if origin!=region or dest!=region or seq!=1 or arrive<=depart: continue
        a,b = [pool[slot(person,region,salt)%len(pool)] for salt in (17,73)]
        if a==b: b=pool[(pool.index(b)+1+slot(person,region,131)%(len(pool)-1))%len(pool)]
        a,b = [NET['endpoints'][i]['vertex'] for i in (a,b)]
        if all(str(i) in lab['nodes'] for i in (a,b)):
            trips.append(dict(a=a,b=b,depart=depart*60,csvArrival=arrive*60,mode=mode))
    return sorted(trips,key=lambda t:(t['depart'],t['a'],t['b']))

trips=demand()
def simulate(key):
    edges=lab['edges'].copy()
    if key.startswith('open-'):
        _,a,b=key.split('-')
        for f,t in [(a,b),(b,a)]: edges[f'new{f}_{t}']=[int(f),int(t),[lab['nodes'][f],lab['nodes'][t]]]
    if key.startswith('close-'):
        pair=set(map(int,key.split('-')[1:]))
        edges={k:e for k,e in edges.items() if set(e[:2])!=pair}
    if key=='isolate': edges={k:e for k,e in edges.items() if e[1]!=lab['end']}
    with tempfile.TemporaryDirectory(prefix='sejong-csv-sumo-') as temp:
        folder=Path(temp)
        def run(name,*args):
            proc=subprocess.run([exe(name),*args,'--xml-validation','never','--no-warnings'],cwd=temp,capture_output=True,text=True)
            if proc.returncode: raise RuntimeError(key+' '+proc.stderr[-1000:])
        nodes=ET.Element('nodes')
        for v,(x,z) in lab['nodes'].items(): ET.SubElement(nodes,'node',id=v,x=str(x),y=str(-z),type='priority')
        ways=ET.Element('edges')
        for eid,(a,b,points) in edges.items():
            ET.SubElement(ways,'edge',id=eid,**{'from':str(a),'to':str(b)},speed='8.333333',shape=' '.join(f'{x},{-z}' for x,z in points))
        write(folder/'nodes',nodes);write(folder/'ways',ways)
        run('netconvert','-n','nodes','-e','ways','-o','net','--no-turnarounds','--offset.disable-normalization')
        routes=ET.Element('routes')
        for i,t in enumerate(trips):
            ET.SubElement(routes,'trip',id=f'v{i}',depart=str(t['depart']),fromJunction=str(t['a']),toJunction=str(t['b']))
        write(folder/'trips',routes)
        run('duarouter','-n','net','-r','trips','-o','routed','--junction-taz','--ignore-errors')
        planned={int(v.get('id')[1:]):v.find('route').get('edges').split() for v in ET.parse(folder/'routed').findall('vehicle')}
        run('sumo','-n','net','-r','routed','--begin',str(trips[0]['depart']),'--seed','42','--default.speeddev','0','--time-to-teleport','-1','--end',str(trips[-1]['depart']+3600),'--fcd-output','fcd','--tripinfo-output','info','--no-step-log')
        tracks=[None]*len(trips)
        for info in ET.parse(folder/'info').findall('tripinfo'):
            i=int(info.get('id')[1:])
            tracks[i]=dict(start=int(float(info.get('depart'))),end=int(float(info.get('arrival'))),route=planned[i],samples=[])
        assert len(planned)==sum(t is not None for t in tracks),key+' unfinished trips'
        for _,step in ET.iterparse(folder/'fcd',events=('end',)):
            if step.tag!='timestep':continue
            time=int(float(step.get('time')))
            for v in step:
                track=tracks[int(v.get('id')[1:])]
                assert time==track['start']+len(track['samples'])//4
                track['samples'].extend([round(float(v.get('x'))*10),-round(float(v.get('y'))*10),round(float(v.get('speed'))*100),round(float(v.get('angle')))%360])
            step.clear()
        assert all(not t or len(t['samples'])==4*(t['end']-t['start']) for t in tracks),key
        return tracks

if __name__=='__main__':
    base=simulate('base')
    version=subprocess.check_output([exe('sumo'),'--version'],text=True).splitlines()[0]
    save('base',dict(trips=trips,tracks=base,engine=version))
    print(version,'CSV trips',len(trips),'completed',sum(t is not None for t in base),flush=True)
    def change(k):
        tracks=simulate(k)
        delta={str(i):t for i,t in enumerate(tracks) if t!=base[i]}
        if delta: save(k,delta)
        return k,dict(delta=bool(delta),changed=sum(bool(a and b and a['route']!=b['route']) for a,b in zip(base,tracks)),unreachable=sum(t is None for t in tracks))
    with ThreadPoolExecutor(max_workers=5) as workers:
        index=dict(workers.map(change,lab['results']))
    save('index',index)
    print('Validated scenarios:',len(index),flush=True)

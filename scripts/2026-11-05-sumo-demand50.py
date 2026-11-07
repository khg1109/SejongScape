"""Versioned official-lane experiment. Existing runs are never overwritten.

prepare -> launch -> publish --watch. Every scenario uses the same seeded 50 percent sample of mapped CSV trips.
The existing binary schema's 2026-11-04 prefix is retained inside a new dated folder.
"""
import argparse, gzip, json, os, re, runpy, struct, subprocess, sys, time, random, shutil, hashlib
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/data/2026-11-05-sumo-demand50'
WORK=ROOT/'scripts/.cache/2026-11-05-sumo-demand50'
N=lambda s:'2026-11-04-'+s
KEYS=('base','open','close')

def engine():
    module=runpy.run_path(str(ROOT/'scripts/2026-11-04-build-lane-sumo.py'))
    g=module['prepare'].__globals__
    g.update(OUT=OUT,WORK=WORK)
    OUT.mkdir(exist_ok=True);WORK.mkdir(exist_ok=True)
    return g

def prepare():
    # Sample whole trips before SUMO, not merely the rendered cars. Preserve order.
    sourceWork=ROOT/'scripts/.cache/2026-11-05-sourced-sumo'
    sourceOut=ROOT/'public/data/2026-11-05-sourced-sumo'
    if (WORK/N('demand.json')).exists():
        raise RuntimeError('Prepared dataset already exists; refusing to overwrite it.')
    g=engine()
    source=json.loads((sourceWork/N('demand.json')).read_text())
    original=source['trips']; keep=round(len(original)*.5); seed=20261105
    chosen=sorted(random.Random(seed).sample(range(len(original)),keep))
    trips=[original[i] for i in chosen]
    counts={**source['counts'], 'originalMapped':len(original), 'mapped':keep,
            'sampleExcluded':len(original)-keep,
            'nonpositiveCsvDuration':sum(t[1]<=t[0] for t in trips)}
    sampling=dict(keepFraction=.5,removeFraction=.5,seed=seed,originalCount=len(original),
                  selectedCount=keep,excludedCount=len(original)-keep,
                  selectedIndicesSha256=hashlib.sha256(struct.pack('<'+'I'*len(chosen),*chosen)).hexdigest())
    demand=dict(counts=counts,trips=trips,pairs=sorted({(t[2],t[3]) for t in trips}),sampling=sampling)
    g['save'](WORK/N('demand.json'),demand)
    g['save'](OUT/'2026-11-05-sampling.json',sampling)
    g['save'](WORK/'2026-11-05-original-trip-indices.json',chosen)
    with (OUT/N('trips.bin')).open('wb') as f:
        for t in trips:f.write(struct.pack('<IIHHBBBB',*t))
    shutil.copy2(sourceWork/N('network.json'),WORK/N('network.json'))
    for name in ('geometry.json','road-audit.json'):
        shutil.copy2(sourceOut/N(name),OUT/N(name))
    for key in KEYS:
        (WORK/N(key)).mkdir(); (OUT/N(key)).mkdir()
        for name in ('net.xml','routes.json'):
            shutil.copy2(sourceWork/N(key)/N(name),WORK/N(key)/N(name))
        for path in (sourceOut/N(key)).iterdir():
            if path.name.endswith('lanes.json') or 'routes-' in path.name:
                shutil.copy2(path,OUT/N(key)/path.name)
        routes=json.loads((WORK/N(key)/N('routes.json')).read_text())
        assert all(f'{t[2]}_{t[3]}' in routes for t in trips)
    assert len(set(chosen))==keep and len(trips)==438454
    assert all(trips[i]==original[j] for i,j in enumerate(chosen))
    assert (OUT/N('trips.bin')).stat().st_size==keep*16
    g['save'](OUT/'2026-11-05-sampling-proof.json',dict(validation='passed',
        uniqueSelectedTrips=keep,excludedTrips=len(original)-keep,seed=seed,
        originalOrderPreserved=True,allScenariosShareSameDemand=True,allSelectedTripsHaveRoutes=True,
        sourceDemandSha256=hashlib.sha256((sourceWork/N('demand.json')).read_bytes()).hexdigest()))
    print(json.dumps(sampling),flush=True)

def run(key):
    g=engine()
    net=json.loads((WORK/N('network.json')).read_text())
    demand=json.loads((WORK/N('demand.json')).read_text())
    g['simulation'](net,demand,key,g['END'])

def launch():
    # No duplicate process launch on repeated calls.
    state=WORK/'2026-11-05-processes.json'
    if state.exists():
        previous=json.loads(state.read_text())
        for item in previous.values():
            try: os.kill(item['pid'],0)
            except ProcessLookupError: continue
            raise RuntimeError('An existing run is still active; use publish, not launch.')
    converter=WORK/N('pack-fcd')
    if not converter.exists():
        subprocess.run(['clang++','-O3','-std=c++17',str(ROOT/'scripts/2026-11-04-pack-fcd.cpp'),'-o',str(converter)],check=True)
    jobs={}
    for key in KEYS:
        if (OUT/N(key)/N('index.json')).exists():continue
        log=WORK/f'2026-11-05-{key}-run.log'
        with log.open('w') as f:
            p=subprocess.Popen([sys.executable,__file__,'run','--scenario',key],stdout=f,stderr=subprocess.STDOUT,start_new_session=True)
        jobs[key]=dict(pid=p.pid,log=str(log))
    with (WORK/'2026-11-05-publisher.log').open('w') as f:
        p=subprocess.Popen([sys.executable,__file__,'publish','--watch'],stdout=f,stderr=subprocess.STDOUT,start_new_session=True)
    jobs['publisher']=dict(pid=p.pid)
    state.write_text(json.dumps(jobs,indent=2));print(json.dumps(jobs),flush=True)

def publish():
    g=engine();scenarios={};ends=[];done=True
    demand=json.loads((WORK/N('demand.json')).read_text())
    for key in KEYS:
        folder=OUT/N(key);final=folder/N('index.json');partial=folder/N('progress-index.json')
        if final.exists():
            index=json.loads(final.read_text());index['complete']=True;g['save'](final,index)
        else:
            done=False
            prior=json.loads(partial.read_text()) if partial.exists() else {'chunks':[],'stats':{'maxActive':0}}
            chunks=prior['chunks'];known={c['file'] for c in chunks};maximum=prior['stats']['maxActive']
            # Writer is allowed to append only to its last block. Publish closed blocks only.
            files=sorted(folder.glob(N('frames-*.bin')))[:-1]
            for path in files:
                if path.name in known:continue
                frames=[];size=path.stat().st_size
                with path.open('rb') as f:
                    while f.tell()<size:
                        offset=f.tell();header=f.read(8)
                        if len(header)!=8:raise ValueError('Truncated closed block '+str(path))
                        t,n=struct.unpack('<II',header)
                        if t%5 or f.tell()+n*16>size:raise ValueError('Invalid FCD block '+str(path))
                        frames.append([t,offset,n]);maximum=max(maximum,n);f.seek(n*16,1)
                if frames:chunks.append(dict(file=path.name,frames=frames))
            if not chunks:return False
            end=max(f[0] for c in chunks for f in c['frames'])+5
            # Empty intervals preceding the first emitted snapshot need explicit empty frames.
            byblock={c['frames'][0][0]//300:c for c in chunks}
            for t in range(21600,end,5):
                c=byblock.setdefault(t//300,dict(file=N(f'frames-{t//300:03d}.bin'),frames=[]))
                if not any(frame[0]==t for frame in c['frames']):
                    with (folder/c['file']).open('ab') as f:
                        offset=f.tell();f.write(struct.pack('<II',t,0))
                    c['frames'].append([t,offset,0])
            chunks=sorted(byblock.values(),key=lambda c:c['file'])
            for c in chunks:c['frames'].sort()
            text=(WORK/N(key)/N('summary.xml')).read_text()
            steps=[ET.fromstring(s).attrib for s in re.findall(r'<step .*?/>',text)]
            steps=[s for s in steps if float(s['time'])<end];last=steps[-1] if steps else {}
            routes=json.loads((WORK/N(key)/N('routes.json')).read_text())
            routed=sum(f'{a}_{b}' in routes for _,_,a,b,*_ in demand['trips'])
            stats=dict(routed=routed,noRoute=len(demand['trips'])-routed,maxActive=maximum,
                at=float(last.get('time',21600)),arrived=int(last.get('arrived',0)),
                notInserted=int(last.get('discarded',0)),unfinished=int(last.get('running',0)),waiting=int(last.get('waiting',0)))
            index=dict(key=key,complete=False,begin=21600,end=end,period=5,recordBytes=16,chunks=chunks,stats=stats)
            g['save'](partial,index)
        scenarios[key]=dict(index['stats'],complete=index['complete']);ends.append(index['end'])
    audit=json.loads((OUT/N('road-audit.json')).read_text())
    manifest=dict(counts=demand['counts'],engine='SUMO 1.28.0',model='microscopic',complete=done,
        availableEnd=min(ends),period=5,scenarios=scenarios,dataset='official-lanes-demand50-2026-11-05',sampling=demand['sampling'],
        geometryDate=audit['geometryDate'],regions=json.loads((OUT/N('geometry.json')).read_text())['regions'],
        source='260316 - Mode&Purpose.csv',assumptions=['위치 배정 통행 중 무작위 50%를 동일한 표본으로 세 조건에 투입 (난수 시드 20261105)','통행 1건을 승용차 1대로 가정','출발 및 도착 위치는 지역 내 추정 지점',
        '표준노드링크 차로 수는 공간 대응이 확인된 구간에 적용; 나머지는 OpenStreetMap 또는 추정',
        '차로 폭 3.2m는 추정값','교차로 우선순위 모형, 실제 신호와 회전 제한 및 교통량 미보정',
        '출발 대기 30분 초과는 미진입 처리','26시 종료 시 미도착 별도 집계'])
    g['save'](OUT/N('progress.json'),manifest)
    if done:g['save'](OUT/N('manifest.json'),manifest)
    print('Complete' if done else 'Calculating',min(ends),flush=True)
    return done

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('action',choices=['prepare','launch','run','publish']);p.add_argument('--scenario',choices=KEYS);p.add_argument('--watch',action='store_true');args=p.parse_args()
    if args.action=='prepare':prepare()
    elif args.action=='launch':launch()
    elif args.action=='run':
        if not args.scenario:p.error('--scenario is required')
        run(args.scenario)
    else:
        while True:
            if publish() or not args.watch:break
            time.sleep(30)

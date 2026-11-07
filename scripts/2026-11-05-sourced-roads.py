"""Conservative directional matching of official node/link LANES to existing OSM roads.

Run with the project road-tools Python. Unmatched roads retain their old, explicitly
labelled OSM/fallback attributes. This does not infer capacity from a pretty map.
"""
import json, math, runpy, zipfile
from collections import Counter
from pathlib import Path
from shapely.geometry import LineString, Point
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'public/data'
WORK = ROOT / 'scripts/.cache/2026-11-05-sourced-sumo'
OUT = DATA / '2026-11-05-sourced-sumo'
SOURCE = ROOT / 'scripts/.cache/2026-11-05-official-roads'
DATE = '2026-10-14'
URL = 'https://www.its.go.kr/opendata/nodelinkFileSDownload/DF_221/0'
N = lambda s: '2026-11-04-' + s  # replay schema version, shared with the existing player

def local(lon, lat):
    return [(lon-127.269)*111320*math.cos(math.radians(36.501)), -(lat-36.501)*111320]

def extract():
    """Retain only the simulation bounds; the nationwide SHP stays in the private cache."""
    import shapefile
    from pyproj import Transformer
    target = SOURCE / '2026-11-05-sejong-links.json'
    if target.exists():
        return json.loads(target.read_text())
    with zipfile.ZipFile(SOURCE / '2026-11-05-nodelink-complete.zip') as z:
        # Do not unpack arbitrary archive paths.
        names = [n for n in z.namelist() if Path(n).stem.upper() == 'MOCT_LINK']
        for name in names:
            suffix = Path(name).suffix.lower()
            if suffix in ('.shp', '.shx', '.dbf', '.prj'):
                (SOURCE / ('2026-11-05-links'+suffix)).write_bytes(z.read(name))
    path = SOURCE / '2026-11-05-links'
    transform = Transformer.from_crs(path.with_suffix('.prj').read_text(), 'EPSG:4326', always_xy=True)
    net = json.loads((ROOT / 'scripts/.cache/2026-11-04-lane-sumo' / N('network.json')).read_text())
    xs, zs = zip(*net['points'])
    bounds = (min(xs)-100, min(zs)-100, max(xs)+100, max(zs)+100)
    links = []
    reader = shapefile.Reader(str(path), encoding='cp949')
    for item in reader.iterShapeRecords():
        box = item.shape.bbox
        corners = [local(*transform.transform(x,y)) for x in (box[0],box[2]) for y in (box[1],box[3])]
        if max(p[0] for p in corners)<bounds[0] or min(p[0] for p in corners)>bounds[2] or max(p[1] for p in corners)<bounds[1] or min(p[1] for p in corners)>bounds[3]:
            continue
        r = item.record.as_dict()
        coords = [local(*transform.transform(x,y)) for x,y,*_ in item.shape.points]
        if len(coords)<2 or not 1<=int(r['LANES'])<=8:
            continue
        links.append(dict(id=r['LINK_ID'], name=r['ROAD_NAME'], lanes=int(r['LANES']),
            rank=r['ROAD_RANK'], roadType=r.get('ROAD_TYPE'), speed=r.get('MAX_SPD'),
            fromNode=r['F_NODE'], toNode=r['T_NODE'], points=coords))
    result = dict(sourceUrl=URL, geometryDate=DATE, bounds=bounds, links=links)
    target.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')))
    return result

class Matcher:
    def __init__(self, links):
        self.links = links
        self.segments = []
        self.owners = []
        for i, link in enumerate(links):
            for a,b in zip(link['points'],link['points'][1:]):
                if math.dist(a,b)>.1:
                    self.segments.append(LineString([a,b])); self.owners.append(i)
        self.tree = STRtree(self.segments)

    def match(self, points, tags):
        # Parking aisles and minor unnamed access roads must not inherit arterial lanes.
        if tags.get('highway') not in ('primary','secondary','tertiary','unclassified'):
            return None
        line = LineString(points)
        if line.length<8:
            return None
        name = str(tags.get('name','')).replace(' ','')
        hits = []
        for fraction in (.1,.3,.5,.7,.9):
            at = line.length*fraction
            a,b = line.interpolate(max(0,at-2)),line.interpolate(min(line.length,at+2))
            dx,dz=b.x-a.x,b.y-a.y; length=math.hypot(dx,dz)
            if length<.1:
                return None
            p = line.interpolate(at); candidates={}
            for idx in self.tree.query(p.buffer(25)):
                segment=self.segments[idx]; link=self.links[self.owners[idx]]
                officialName=str(link['name']).replace(' ','')
                if name and name!=officialName:
                    continue
                distance=segment.distance(p)
                if distance>(25 if name else 5):
                    continue
                (ax,az),(bx,bz)=segment.coords
                dot=((bx-ax)*dx+(bz-az)*dz)/(segment.length*length)
                if dot<.92:  # directional, never match the opposing carriageway
                    continue
                score=distance+20*(1-dot)
                if link['id'] not in candidates or score<candidates[link['id']][0]:
                    candidates[link['id']]=(score,distance,link)
            choices=sorted(candidates.values(),key=lambda c:c[0])
            if not choices:
                continue
            best=choices[0]
            if any(c[2]['lanes']!=best[2]['lanes'] and c[0]-best[0]<4 for c in choices[1:]):
                continue  # competing parallel roads, do not guess
            hits.append(best)
        if len(hits)<4 or len({h[2]['lanes'] for h in hits})!=1:
            return None
        mean=sum(h[1] for h in hits)/len(hits)
        if mean>15:
            return None
        return dict(lanes=hits[0][2]['lanes'], ids=sorted({h[2]['id'] for h in hits}),
            meanDistance=round(mean,2), sampleCoverage=len(hits)/5)

def build():
    OUT.mkdir(exist_ok=True); WORK.mkdir(exist_ok=True)
    target=WORK/N('network.json')
    if target.exists():
        return json.loads(target.read_text())
    old=runpy.run_path(str(ROOT/'scripts/2026-11-04-road-attributes.py'))['build']()
    links=extract(); matcher=Matcher(links['links']); tags={}
    for file in [DATA/'sejong.json',*sorted((DATA/'tiles').glob('*.json'))]:
        for e in json.loads(file.read_text())['elements']:
            if e['type']=='way': tags[e['id']]=e.get('tags',{})
    counts=Counter(); changes=[]; matches=[]
    for i,(edge,profile) in enumerate(zip(old['edges'],old['roadProfiles'])):
        match=matcher.match([old['points'][p] for p in edge[3]],tags.get(profile['way'],{}))
        if match:
            before=profile['lanes']
            profile.update(lanes=match['lanes'],laneSource='official-spatial-match',
                originalLanes=before,originalLaneSource=profile['laneSource'],
                officialLinks=match['ids'],geometryDate=DATE,matchDistance=match['meanDistance'],
                matchCoverage=match['sampleCoverage'])
            # Width is not present in the official LANES field. Preserve the explicit estimate.
            profile.update(width=3.2,widthSource='estimated-3.2m')
            row=dict(edge=f'e{i}',way=profile['way'],name=tags.get(profile['way'],{}).get('name',''),before=before,**match)
            matches.append(row)
            if before!=profile['lanes']: changes.append(row)
        counts['lanes_'+str(profile['lanes'])]+=1;counts[profile['laneSource']]+=1
    report=dict(geometryDate=DATE,sourceUrl=URL,officialLinks=len(links['links']),
        directionalEdges=len(old['edges']),matchedEdges=len(matches),changedEdges=len(changes),counts=dict(counts),
        matching='Same road name where present; forward heading cosine >= .92; >= 4/5 samples; mean distance <= 15m; conflicting parallel links rejected.',
        limitations=['Spatial correspondence is not a field survey','Unmatched roads retain OSM attributes or one-lane fallback','Lane widths are 3.2m estimates','Signals and turning permissions remain uncalibrated','Existing demand network omits some major roads'])
    target.write_text(json.dumps(old,ensure_ascii=False,separators=(',',':')))
    for filename,obj in [('road-audit.json',report),('road-matches.json',dict(matches=matches,changes=changes))]:
        (OUT/N(filename)).write_text(json.dumps(obj,ensure_ascii=False,indent=2))
    print(json.dumps(report,ensure_ascii=False),flush=True)
    return old

if __name__=='__main__': build()

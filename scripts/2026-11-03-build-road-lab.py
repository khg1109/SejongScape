"""Generate a static Sejong pilot with Eclipse SUMO netconvert and duarouter.

Run with the SUMO bin directory on PATH. Only derived, anonymous trip fields
are published. Junction-to-junction scenarios use one passenger car and a
uniform 30 km/h assumption; they do not model observed congestion.
"""
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from itertools import combinations
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import math
import shutil
import struct
import subprocess
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public/data"
OUT = DATA / "2026-11-03-road-lab.json"
NET = json.loads((DATA / "2026-10-16-dispersal/2026-10-16-network.json").read_text())
BIN = ROOT / "scripts/.cache/2026-11-03-sumo-runtime/sumo/bin"
EDGES = NET["edges"]
POINTS = NET["points"]
VERTICES = NET["vertices"]
SPEED = 30 / 3.6


def exe(name):
    return shutil.which(name) or str(BIN / name)


def slot(person, region, salt):
    # Same unsigned hash as TripDispersal.assign for the first trip of a day.
    mask = 0xffffffff
    h = (person ^ (2 * 0x9e3779b1) ^ ((region + 1) * 0x85ebca6b) ^ salt) & mask
    h = ((h ^ (h >> 16)) * 0x7feb352d) & mask
    h = ((h ^ (h >> 15)) * 0x846ca68b) & mask
    return (h ^ (h >> 16)) & mask


def select_trip():
    region = NET["regions"].index("도담동")
    pool = NET["pools"][region]
    records = (DATA / "2026-10-16-trips/2026-10-16-hour-07.bin").read_bytes()
    for pos in range(0, len(records), 20):
        person, seq = struct.unpack_from("<IB", records, pos)
        origin, dest, depart, arrive = struct.unpack_from("<BBHH", records, pos + 10)
        if seq != 1 or origin != region or dest != region or arrive <= depart:
            continue
        a = pool[slot(person, region, 17) % len(pool)]
        b = pool[slot(person, region, 73) % len(pool)]
        route = NET["localRoutes"].get(f"{a}:{b}", [])
        if 7 <= len(route) <= 12 and 900 < sum(EDGES[e][2] for e in route) < 1500:
            return depart, arrive, route
    raise ValueError("No suitable CSV trip")


def xml_file(path, root):
    ET.ElementTree(root).write(path, encoding="utf-8", xml_declaration=True)


def command(args, cwd):
    r = subprocess.run(args, cwd=cwd, capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(r.stderr[-2000:])


def build():
    depart, arrive, original = select_trip()
    start, end = EDGES[original[0]][0], EDGES[original[-1]][1]
    corridor = [POINTS[p] for e in original for p in EDGES[e][3]]
    xs, ys = zip(*corridor)
    def inside(vertex):
        x, y = POINTS[VERTICES[vertex]]
        return min(xs)-240 <= x <= max(xs)+240 and min(ys)-240 <= y <= max(ys)+240
    edges = {f"e{i}": e for i, e in enumerate(EDGES) if inside(e[0]) and inside(e[1]) and e[0] != e[1]}
    nodes = sorted({v for e in edges.values() for v in e[:2]})
    geometry = {k: [e[0], e[1], [POINTS[i] for i in e[3]]] for k, e in edges.items()}
    pairs = {tuple(sorted(e[:2])) for e in edges.values()}
    # Make both directions of one physical segment close together.
    def solve(key, change, starts):
        with TemporaryDirectory(prefix="sejong-road-") as temp:
            tmp = Path(temp)
            ns = ET.Element("nodes")
            for v in nodes:
                x, y = POINTS[VERTICES[v]]
                ET.SubElement(ns, "node", id=str(v), x=str(x), y=str(-y), type="priority")
            xml_file(tmp/"n.xml", ns)
            es = ET.Element("edges")
            layout = dict(geometry)
            a, b = change if change else (None, None)
            if key.startswith("open"):
                for f, t in [(a,b),(b,a)]:
                    layout[f"new{f}_{t}"] = [f,t,[POINTS[VERTICES[f]],POINTS[VERTICES[t]]]]
            for eid, (f,t,shape) in layout.items():
                if (key == "isolate" and t == end) or (key.startswith("close") and {f,t} == {a,b}):
                    continue
                ET.SubElement(es, "edge", id=eid, **{"from":str(f),"to":str(t)}, speed=str(SPEED),
                              shape=" ".join(f"{x},{-y}" for x,y in shape))
            xml_file(tmp/"e.xml", es)
            command([exe("netconvert"),"-n","n.xml","-e","e.xml","-o","net.xml","--no-warnings","--no-turnarounds","--xml-validation","never"],tmp)
            requests = ET.Element("routes")
            for v in starts:
                if v != end:
                    ET.SubElement(requests,"trip",id=f"v{v}",depart=str(depart*60),fromJunction=str(v),toJunction=str(end))
            xml_file(tmp/"in.xml", requests)
            command([exe("duarouter"),"-n","net.xml","-r","in.xml","-o","out.xml","--junction-taz","--ignore-errors","--xml-validation","never","--no-warnings"],tmp)
            result = {str(v):None for v in starts}
            result[str(end)] = []
            for car in ET.parse(tmp/"out.xml").getroot().findall("vehicle"):
                path = car.find("route").get("edges").split()
                if not path or any(k not in layout for k in path):
                    raise ValueError("Invalid SUMO route")
                result[car.get("id")[1:]] = path
            return key, result
    base = solve("base",None,[start])[1][str(start)]
    if not base: raise ValueError("Disconnected baseline")
    checkpoints = [start]+[geometry[k][1] for k in base]
    degree = Counter(v for p in pairs for v in p)
    candidates = list(dict.fromkeys([start,end]+[v for v in checkpoints if degree[v]>=3]))
    for v in sorted(nodes, key=lambda v: (abs(POINTS[VERTICES[v]][0]-sum(xs)/len(xs)), v)):
        if degree[v]>=3 and v not in candidates and len(candidates)<12:
            candidates.append(v)
    tasks = [(f"close-{a}-{b}", (a,b)) for a,b in sorted(pairs)]
    tasks.append(("isolate", None))
    tasks += [(f"open-{a}-{b}", (a,b)) for a,b in combinations(sorted(candidates),2) if (a,b) not in pairs]
    def run(task): return solve(*task,checkpoints)
    with ThreadPoolExecutor(max_workers=4) as workers:
        results = dict(workers.map(run,tasks))
    model = dict(nodes={v:POINTS[VERTICES[v]] for v in nodes},edges=geometry,candidates=candidates,
                 start=start,end=end,depart=depart,arrive=arrive,base=base,results=results,
                 engine=subprocess.check_output([exe("duarouter"),"--version"],text=True).splitlines()[0])
    OUT.write_text(json.dumps(model,ensure_ascii=False,separators=(",",":")))
    print(f"{len(nodes)} junctions, {len(tasks)} scenarios; {len(base)} baseline edges; {OUT}")


if __name__ == "__main__":
    build()

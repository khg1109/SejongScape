"""Build reproducible, bounded-region road endpoints; never edit source CSV/map data.

OSM administrative polygons determine membership. Locations are synthetic, not
observed addresses. Directed roads are contracted without straight-line shortcuts.
"""
import array, collections, gzip, hashlib, heapq, json, math, pathlib, time

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/data/2026-10-16-dispersal'
CENTER = (36.501, 127.269)
COUNT = 24
def project(p):
    return [round((p['lon']-CENTER[1])*111320*math.cos(math.radians(CENTER[0])), 2), round(-(p['lat']-CENTER[0])*111320, 2)]
def inside(p, ring):
    x, y = p; result = False
    for a, b in zip(ring, ring[1:]+ring[:1]):
        if (a[1]>y)!=(b[1]>y) and x < (b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]: result = not result
    return result
def bounds(ring):
    return [min(p[0] for p in ring), min(p[1] for p in ring), max(p[0] for p in ring), max(p[1] for p in ring)]
def in_box(p, b): return b[0]<=p[0]<=b[2] and b[1]<=p[1]<=b[3]
def rings(parts):
    pending = [list(p) for p in parts]; output = []
    while pending:
        ring = pending.pop()
        while ring[-1] != ring[0]:
            found = next((i for i,p in enumerate(pending) if p[0]==ring[-1] or p[-1]==ring[-1]), None)
            if found is None: raise ValueError('Unclosed administrative boundary')
            p = pending.pop(found)
            if p[-1]==ring[-1]: p.reverse()
            ring.extend(p[1:])
        output.append(ring)
    return output
def reachable(g, start, allowed=None):
    seen={start}; todo=[start]
    while todo:
        for n in g.get(todo.pop(), {}):
            if n not in seen and (allowed is None or n in allowed): seen.add(n); todo.append(n)
    return seen
def largest_scc(g, reverse, allowed):
    # Iterative Kosaraju, no recursion depth dependency on long rural roads.
    seen=set(); order=[]
    for seed in sorted(allowed):
        if seed in seen: continue
        seen.add(seed); stack=[(seed, iter(g.get(seed, {})))]
        while stack:
            n,it=stack[-1]; nxt=next(it, None)
            if nxt is None: order.append(n); stack.pop()
            elif nxt in allowed and nxt not in seen: seen.add(nxt); stack.append((nxt, iter(g.get(nxt, {}))))
    remaining=set(allowed); best=set()
    for seed in reversed(order):
        if seed not in remaining: continue
        component=reachable(reverse, seed, remaining); remaining.difference_update(component)
        if len(component)>len(best): best=component
    return best

def main():
    started=time.time()
    manifest=json.loads((ROOT/'public/data/2026-10-16-trips/2026-10-16-manifest.json').read_text())
    names=manifest['regions']; polygons={}; provenance=[]
    for file in sorted((ROOT/'public/data/2026-10-16-dispersal-source').glob('*.json')):
        data=json.loads(file.read_text()); by={(e['type'],e['id']):e for e in data['elements']}
        relation=by['relation',int(file.stem.split('-')[-1])]; name=relation['tags']['name']
        if name not in names: continue
        parts={'outer':[], 'inner':[]}
        for member in relation['members']:
            if member['type']=='way' and member['role'] in ('outer','inner',''):
                parts[member['role'] or 'outer'].append(by['way',member['ref']]['nodes'])
        shape={role:[[project(by['node',n]) for n in ring] for ring in rings(parts[role])] for role in parts}
        shape['boxes']=[bounds(r) for r in shape['outer']]; polygons[names.index(name)]=shape
        provenance.append({'region':name,'relation':relation['id'],'version':relation.get('version'),'timestamp':relation.get('timestamp'),'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
    assert len(polygons)==22, 'Every source region must have a boundary'
    def in_region(p, r):
        s=polygons[r]
        return any(in_box(p,b) and inside(p,ring) for ring,b in zip(s['outer'],s['boxes'])) and not any(inside(p,ring) for ring in s['inner'])

    allowed={'primary','secondary','tertiary','unclassified','residential','service','primary_link','secondary_link','tertiary_link','living_street'}
    ways={}; obstacles={}; building_centers=[]
    for file in [ROOT/'public/data/sejong.json',*sorted((ROOT/'public/data/tiles').glob('*.json'))]:
        for e in json.loads(file.read_text())['elements']:
            tags=e.get('tags',{}); geometry=e.get('geometry',[])
            if e['type']=='way' and tags.get('highway') in allowed and tags.get('access') not in ('private','no') and not tags.get('area')=='yes' and len(e.get('nodes',[]))==len(geometry) and len(geometry)>1:
                ways[e['id']]=e
            if e['type']=='way' and len(geometry)>3 and (tags.get('building') or tags.get('natural')=='water' or tags.get('water') or tags.get('landuse')=='reservoir'):
                ring=[project(p) for p in geometry]; obstacles[e['id']]=ring
                if tags.get('building'): building_centers.append([sum(p[i] for p in ring)/len(ring) for i in (0,1)])
            if e['type']=='relation' and (tags.get('natural')=='water' or tags.get('water')):
                # Outer closed water rings are conservative endpoint exclusions.
                for m in e.get('members',[]):
                    g=m.get('geometry',[])
                    if m.get('role')=='outer' and len(g)>3 and g[0]==g[-1]:obstacles[('water',m['ref'])]=[project(p) for p in g]
    nodes={}; graph=collections.defaultdict(dict); reverse=collections.defaultdict(dict); local_road=set()
    for way in ways.values():
        tags=way['tags']; nodes.update(zip(way['nodes'],map(project,way['geometry'])))
        if tags['highway'] in ('residential','service','living_street','unclassified','tertiary') and tags.get('bridge') not in ('yes','viaduct') and tags.get('tunnel') not in ('yes','building_passage'):
            local_road.update(way['nodes'])
        one=tags.get('oneway'); forward=one!='-1'; back=one not in ('yes','1','true','-1') and tags.get('junction')!='roundabout'
        for a,b in zip(way['nodes'],way['nodes'][1:]):
            length=math.dist(nodes[a],nodes[b])
            if a==b or length==0:continue
            if forward:graph[a][b]=length;reverse[b][a]=length
            if back or one=='-1':graph[b][a]=length;reverse[a][b]=length
    connected=largest_scc(graph,reverse,set(nodes)); print('Connected road nodes',len(connected),'/',len(nodes),flush=True)
    region_nodes={r:{n for n in connected if in_region(nodes[n],r)} for r in polygons}
    # A spatial grid makes building/water exclusion inexpensive.
    obstacle_grid=collections.defaultdict(list); building_grid=collections.defaultdict(list); cell=150
    for ring in obstacles.values():
        b=bounds(ring)
        for x in range(math.floor(b[0]/cell),math.floor(b[2]/cell)+1):
            for y in range(math.floor(b[1]/cell),math.floor(b[3]/cell)+1):obstacle_grid[x,y].append((b,ring))
    for p in building_centers:building_grid[math.floor(p[0]/cell),math.floor(p[1]/cell)].append(p)
    def eligible(n):
        p=nodes[n]; key=math.floor(p[0]/cell),math.floor(p[1]/cell)
        return n in local_road and not any(in_box(p,b) and inside(p,ring) for b,ring in obstacle_grid[key])
    def near_building(n):
        p=nodes[n];x,y=math.floor(p[0]/cell),math.floor(p[1]/cell)
        return any(math.dist(p,b)<180 for dx in (-1,0,1) for dy in (-1,0,1) for b in building_grid[x+dx,y+dy])
    endpoint_nodes=[]; pools=[]; regional_graphs={}; stats=[]
    for r,name in enumerate(names):
        if r not in polygons:pools.append([]);continue
        members=region_nodes[r]; rg={}; rr=collections.defaultdict(dict)
        for a in members:
            rg[a]={}
            for b,d in graph[a].items():
                if b in members and all(in_region([nodes[a][i]+(nodes[b][i]-nodes[a][i])*t/math.ceil(d/30) for i in (0,1)],r) for t in range(1,math.ceil(d/30))):rg[a][b]=d;rr[b][a]=d
        component=largest_scc(rg,rr,members); regional_graphs[r]=rg
        candidates=sorted(n for n in component if eligible(n)); preferred=[n for n in candidates if near_building(n)]
        if len(preferred)>=COUNT:candidates=preferred
        assert len(candidates)>=COUNT, (name,len(candidates))
        # Farthest-point selection spreads candidates throughout mapped settlements.
        center=[sum(nodes[n][i] for n in candidates)/len(candidates) for i in (0,1)]
        chosen=[min(candidates,key=lambda n:(math.dist(nodes[n],center),n))]
        distance={n:math.dist(nodes[n],nodes[chosen[0]]) for n in candidates}
        while len(chosen)<COUNT:
            n=max(candidates,key=lambda n:(distance[n],-n)); chosen.append(n)
            for other in candidates:distance[other]=min(distance[other],math.dist(nodes[other],nodes[n]))
        pools.append(list(range(len(endpoint_nodes),len(endpoint_nodes)+COUNT)));endpoint_nodes.extend(chosen)
        stats.append({'region':name,'endpoints':len(chosen),'candidateNodes':len(candidates),'componentNodes':len(component),'spanMeters':round(max(math.dist(nodes[a],nodes[b]) for a in chosen for b in chosen))})
        print('Endpoints',name,stats[-1],flush=True)

    # Contract degree-two chains while keeping exact road geometry and direction.
    keep=set(endpoint_nodes)
    for n in connected:
        if len((set(graph[n])|set(reverse[n]))&connected)!=2:keep.add(n)
    vertex_nodes=sorted(keep); vertex_id={n:i for i,n in enumerate(vertex_nodes)}
    point_nodes=sorted(connected); point_id={n:i for i,n in enumerate(point_nodes)}
    edges=[]; adjacency=[[] for _ in vertex_nodes]
    for a in vertex_nodes:
        for b,d in sorted(graph[a].items()):
            if b not in connected:continue
            path=[a,b];length=d;previous=a;current=b;visited={a}
            while current not in keep:
                if current in visited:break
                visited.add(current); nexts=[n for n in graph[current] if n in connected and n!=previous]
                if len(nexts)!=1:break
                nxt=nexts[0];length+=graph[current][nxt];path.append(nxt);previous,current=current,nxt
            if current not in keep or current==a:continue
            eid=len(edges);edges.append([vertex_id[a],vertex_id[current],round(length,3),[point_id[n] for n in path]])
            adjacency[vertex_id[a]].append(eid)
    def dijkstra(start, adj=adjacency):
        dist=[math.inf]*len(vertex_nodes); prev=[0]*len(vertex_nodes);dist[start]=0;queue=[(0,start)]
        while queue:
            cost,a=heapq.heappop(queue)
            if cost!=dist[a]:continue
            for eid in adj[a]:
                _,b,length,_=edges[eid];new=cost+length
                if new<dist[b]:dist[b]=new;prev[b]=eid+1;heapq.heappush(queue,(new,b))
        return prev,dist
    regional_adj={}
    for r,rg in regional_graphs.items():
        adj=[[] for _ in vertex_nodes]
        for eid,(a,b,length,path) in enumerate(edges):
            ns=[point_nodes[p] for p in path]
            if all(y in rg.get(x,{}) for x,y in zip(ns,ns[1:])):adj[a].append(eid)
        regional_adj[r]=adj
    endpoints=[{'vertex':vertex_id[n],'point':point_id[n],'region':r} for r,pool in enumerate(pools) for _ in [0] for n in [endpoint_nodes[i] for i in pool]]
    parents=array.array('I'); local_routes={}; local_distances=[]
    for source,endpoint in enumerate(endpoints):
        start=endpoint['vertex'];prev,dist=dijkstra(start);parents.extend(prev)
        assert all(math.isfinite(dist[e['vertex']]) for e in endpoints), 'Disconnected endpoint'
        local_prev,local_dist=dijkstra(start,regional_adj[endpoint['region']])
        for dest in pools[endpoint['region']]:
            if dest==source:continue
            target=endpoints[dest]['vertex'];route=[]
            assert math.isfinite(local_dist[target]), 'Disconnected within-region route'
            while target!=start:
                eid=local_prev[target]-1;assert eid>=0;route.append(eid);target=edges[eid][0]
            route.reverse();local_routes[f'{source}:{dest}']=route;local_distances.append(local_dist[endpoints[dest]['vertex']])
        if source%48==0:print('Routing trees',source,'/',len(endpoints),flush=True)
    if __import__('sys').byteorder!='little':parents.byteswap()
    OUT.mkdir(exist_ok=False)
    tree_bytes=parents.tobytes();(OUT/'2026-10-16-route-trees.bin.gz').write_bytes(gzip.compress(tree_bytes,mtime=0))
    payload={'version':1,'center':CENTER,'regions':names,'pools':pools,'endpoints':endpoints,'vertices':[point_id[n] for n in vertex_nodes],'points':[nodes[n] for n in point_nodes],'edges':edges,'localRoutes':local_routes,'treeUrl':'/data/2026-10-16-dispersal/2026-10-16-route-trees.bin.gz','treeBytes':len(tree_bytes),'treeSha256':hashlib.sha256(tree_bytes).hexdigest(),'source':'OpenStreetMap contributors / ODbL-1.0','boundaries':polygons,'provenance':provenance,'stats':stats,'assumptions':'Synthetic endpoints on public roads inside named OSM boundaries; 24 endpoints per region; same-region routes constrained to boundary; other routes shortest directed distance; no turn restrictions, congestion or mode-specific restrictions.'}
    with (OUT/'2026-10-16-network.json').open('x') as f:json.dump(payload,f,ensure_ascii=False,separators=(',',':'))
    print(json.dumps({'vertices':len(vertex_nodes),'points':len(point_nodes),'edges':len(edges),'endpoints':len(endpoints),'treeBytes':len(tree_bytes),'localRoutes':len(local_routes),'minLocalMeters':min(local_distances),'seconds':round(time.time()-started)},ensure_ascii=False),flush=True)

if __name__=='__main__':main()

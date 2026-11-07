"""Build the city-wide ITS display from official roads, clipped to Sejong boundary."""
import json, math
from pathlib import Path
from collections import Counter
import shapefile
from pyproj import Transformer
from shapely.geometry import shape, mapping, LineString
from shapely.ops import transform, unary_union
ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'2026-11-05-세종전체-ITS-확장'
SOURCE=ROOT/'scripts/.cache/2026-11-05-official-roads/2026-11-05-links'
city=unary_union([shape(f['geometry']) for f in json.loads((WORK/'2026-11-05-세종-시경계-원본.geojson').read_text())['features']])
assert city.is_valid
bbox=[math.floor(city.bounds[0]*10000)/10000,math.floor(city.bounds[1]*10000)/10000,math.ceil(city.bounds[2]*10000)/10000,math.ceil(city.bounds[3]*10000)/10000]
crs=SOURCE.with_suffix('.prj').read_text(); to_geo=Transformer.from_crs(crs,4326,always_xy=True); to_source=Transformer.from_crs(4326,crs,always_xy=True)
source_bounds=transform(to_source.transform,city).buffer(10).bounds
reader=shapefile.Reader(str(SOURCE),encoding='cp949')
links=[]
def lineparts(g):
 if g.geom_type=='LineString':return [g]
 if g.geom_type in ('MultiLineString','GeometryCollection'):return [p for part in g.geoms for p in lineparts(part)]
 return []
for item in reader.iterShapeRecords(bbox=source_bounds):
 r=item.record.as_dict(); g=transform(to_geo.transform,shape(item.shape.__geo_interface__))
 if not g.intersects(city):continue
 clipped=g.intersection(city)
 parts=[[[round(x,6),round(y,6)] for x,y in p.simplify(0.000008,preserve_topology=True).coords] for p in lineparts(clipped) if p.length>0.000008]
 if not parts:continue
 links.append(dict(id=str(r['LINK_ID']),name=str(r['ROAD_NAME'] or '이름 없는 도로'),fromNode=str(r['F_NODE']),toNode=str(r['T_NODE']),rank=str(r['ROAD_RANK']),lanes=int(r['LANES']),length=round(float(r['LENGTH']),1),parts=parts,shape=parts[0],clipped=not city.covers(g)))
links.sort(key=lambda r:r['id']);assert len({r['id'] for r in links})==len(links)
# These are navigation centers, not claims about current 읍면동 administrative boundaries.
regions=[dict(id='government',name='정부청사·신도심',center=[36.501,127.269],distance=6500)]
towns=json.loads((WORK/'2026-11-05-세종-읍면동경계-원본.geojson').read_text())
for f in towns['features']:
 name=f['properties']['EMD_NM']
 if not name.endswith(('읍','면')):continue
 center=shape(f['geometry']).representative_point();regions.append(dict(id=str(f['properties']['EMD_CD']),name=name,center=[round(center.y,6),round(center.x,6)],distance=6500))
result=dict(scope='sejong-city',source='국토교통부 국가교통정보센터 표준노드링크',geometryDate='2026-10-14',sourceUrl='https://www.its.go.kr/opendata/nodelinkFileSDownload/DF_221/0',boundarySource='국가가뭄정보포털 행정경계 공개 지도 서비스',boundarySourceUrl='https://www.drought.go.kr/droughtmap/rest/services/HJD_SEL/MapServer/1',boundaryFetchedAt='2026-11-05',boundaryGeometry=mapping(city.simplify(.000025,preserve_topology=True)),center=[round(city.centroid.y,6),round(city.centroid.x,6)],queryBbox=bbox,regions=regions,links=links)
out=ROOT/'public/data/2026-11-05-sejong-city-its-links.json';out.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')))
ids={r['id'] for r in links};observed=json.loads((ROOT/'scripts/.cache/2026-11-05-sejong-city-its-response.json').read_text())['body']['items'];matching=[r for r in observed if r['linkId'] in ids]
summary=dict(geometryLinks=len(links),queryCount=len(observed),matchedObservations=len(matching),noObservation=len(ids-{r['linkId'] for r in observed}),outsideOrUnmatched=len([r for r in observed if r['linkId'] not in ids]),bbox=bbox,bytes=out.stat().st_size,points=sum(len(p) for r in links for p in r['parts']),navigationRegions=len(regions))
(WORK/'2026-11-05-세종전체-도로생성결과.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
config={'scope':'sejong-city','bbox':bbox,'linkIds':sorted(ids)}
(ROOT/'server/2026-11-05-sejong-traffic-scope.js').write_text('export default '+json.dumps(config,separators=(',',':'))+';\n')
print(json.dumps(summary,ensure_ascii=False))

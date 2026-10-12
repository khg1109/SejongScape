"""Join observed ITS link IDs to the official 2026-09-14 node/link geometry."""
import json
from pathlib import Path
import shapefile
from pyproj import CRS, Transformer

root = Path(__file__).resolve().parents[2]
cache = root / 'scripts/.cache'
source = cache / 'its-nodelink/MOCT_LINK'
observations = json.loads((cache/'its-sejong-pilot-response.json').read_text(encoding='utf-8-sig'))['body']['items']
ids = {row['linkId'] for row in observations}
crs = CRS.from_wkt(source.with_suffix('.prj').read_text())
transform = Transformer.from_crs(crs, 'EPSG:4326', always_xy=True)
reader = shapefile.Reader(str(source), encoding='cp949')
links = []
for record in reader.iterRecords(fields=['LINK_ID']):
    if record['LINK_ID'] not in ids:
        continue
    full = reader.record(record.oid).as_dict()
    shape = reader.shape(record.oid)
    coordinates = [[round(lon, 7), round(lat, 7)] for lon, lat in (transform.transform(x, y) for x, y in shape.points)]
    assert all(126 < lon < 129 and 35 < lat < 38 for lon, lat in coordinates)
    obs = next(row for row in observations if row['linkId'] == full['LINK_ID'])
    matched = obs['startNodeId'] == full['F_NODE'] and obs['endNodeId'] == full['T_NODE']
    links.append(dict(id=full['LINK_ID'], name=full['ROAD_NAME'], fromNode=full['F_NODE'], toNode=full['T_NODE'],
                      apiFromNode=obs['startNodeId'], apiToNode=obs['endNodeId'], exactNodes=matched,
                      rank=full['ROAD_RANK'], lanes=full['LANES'], length=round(full['LENGTH'], 2),
                      shape=coordinates))
result = dict(source='국토교통부 국가교통정보센터 표준노드링크', geometryDate='2026-09-14',
              sourceUrl='https://www.its.go.kr/opendata/opendataList?service=nodelink',
              center=[36.501, 127.269], queryBbox=[127.252,36.489,127.286,36.513],
              referenceCount=len(ids), links=links, missing=sorted(ids-{link['id'] for link in links}))
(root/'public/data/its-links.json').write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(json.dumps(dict(matchedIds=len(links), exactNodes=sum(x['exactNodes'] for x in links), missingCount=len(result['missing']), bytes=(root/'public/data/its-links.json').stat().st_size)))

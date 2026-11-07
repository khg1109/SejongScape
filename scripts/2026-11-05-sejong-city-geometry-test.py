"""Run with scripts/.cache/2026-11-05-road-tools/bin/python."""
import json
from pathlib import Path
from shapely.geometry import shape, LineString
root = Path(__file__).resolve().parents[1]
boundary = json.loads((root / '2026-11-05-세종전체-ITS-확장/2026-11-05-세종-시경계-원본.geojson').read_text())
city = shape(boundary['features'][0]['geometry']).buffer(0.00001)
geometry = json.loads((root / 'public/data/2026-11-05-sejong-city-its-links.json').read_text())
links = geometry['links']
assert len(links) == 12191
assert len({row['id'] for row in links}) == len(links)
assert len(geometry['regions']) == 11
for row in links:
    assert row['parts']
    for part in row['parts']:
        assert city.covers(LineString(part)), row['id']
print('PASS: 12,191 unique roads; all geometry within city boundary (rounding tolerance ~1m); 11 navigation locations')

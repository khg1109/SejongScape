import { mkdir, writeFile } from 'node:fs/promises';

// south, west, north, east; a compact first scene around the government complex and lake.
const bbox = (process.env.SEJONG_BBOX || '36.489,127.252,36.513,127.286').split(',').map(Number);
if (bbox.length !== 4 || bbox.some(v => !Number.isFinite(v)) || bbox[0] >= bbox[2] || bbox[1] >= bbox[3]) throw new Error('Invalid SEJONG_BBOX');
const query = `[out:json][timeout:90];(way[building](${bbox});way[highway](${bbox});way[natural=water](${bbox});relation[natural=water](${bbox});way[landuse~"^(grass|forest|meadow|recreation_ground)$"](${bbox});way[natural~"^(wood|scrub|tree_row)$"](${bbox});way[leisure~"^(park|garden|pitch)$"](${bbox});node[natural=tree](${bbox});node[highway~"^(street_lamp|crossing|bus_stop|traffic_signals)$"](${bbox});node[amenity~"^(bench|shelter)$"](${bbox});way[amenity=parking](${bbox}););out body geom;`;
console.log('Fetching OpenStreetMap geometry for', bbox.join(','));
const response = await fetch('https://overpass-api.de/api/interpreter', {
  method: 'POST', body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(120_000),
  headers: { 'User-Agent': 'SejongScape-local-prototype/0.1' },
});
if (!response.ok) throw new Error(`Overpass returned ${response.status}`);
const result = await response.json();
if (result.remark) throw new Error(result.remark);
if (!result.elements?.length) throw new Error('No map features received');
const data = { bbox, center: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2], fetchedAt: new Date().toISOString(), source: 'OpenStreetMap / Overpass API', license: 'ODbL-1.0', ...result };
await mkdir('public/data', { recursive: true });
await writeFile('public/data/sejong.json', JSON.stringify(data));
console.log(`Saved ${data.elements.length} features to public/data/sejong.json`);

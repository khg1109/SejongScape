# SUMO pilot

## Assignment reference (2026-09-18)

The supplied `[TP] SUMO Trip Assignment.hwpx` describes LLM-generated zone OD,
KTDB directional links supplemented by OSM pedestrian/bicycle links, and initial
shortest paths using length/speed-limit costs. This is modeled demand, not observed
individual vehicle trajectories. The supplied configuration uses a 0–90000 second
window, 1-second steps, mesoscopic vehicles, striping pedestrians, ignored route
errors and a 300-second teleport threshold. These settings have NOT been executed
with the assignment inputs in this website.

The `/sumo` "OD 설정과 입력 파일 점검" dialog reports those settings and accepts a
local `.sumocfg` plus XML file selections. It reads only the configuration and
compares names locally; it does not upload, run SUMO or replace the pilot replay.
Five referenced inputs were not present in the supplied attachments:
`sejong_koti.net.xml`, `sejong_od.rou.xml`, `sejong_persons.rou.xml`,
`sejong_koti.poly.xml`, and `sejong.taz.xml`.

Before exporting this scenario, validate directional connectivity, TAZ assignment,
pedestrian permissions/crossings and version-specific meso/person behavior. Run a
bounded trial and retain departed/arrived/unfinished, route errors and teleport
counts. Actual signal plans and held-out observed speeds/counts are needed for
calibration. Do not describe the current randomTrips pilot as the assignment run.

This is an offline replay produced by a real Eclipse SUMO run. It is not a live traffic feed and has not been calibrated against measured Sejong traffic.

## Reproduce

Install SUMO with `sumo` and `netconvert` on PATH, including its Python tools. Run from the project root:

    python -X utf8 scripts/sumo/build_pilot.py --period 2 --duration 600 --seed 42

The script uses the existing 2026-09-10 OSM snapshot in `public/data/sejong.json` and mapped signal nodes in `public/data/traffic.json`. It imports roads with netconvert, retains the largest connected component, generates synthetic randomTrips demand, warms up for 120 seconds, and exports 600 seconds of TraCI vehicle and traffic-light states to `public/data/sumo-pilot.json`. Logs and intermediate XML are in ignored `scripts/.cache/sumo/`.

The default departure attempt interval is 2 seconds; this is NOT measured traffic volume. Missing lane counts/speeds and signal plans may be inferred by SUMO. Current run has one imported signal controller; no claim of full city signal coverage. Buildings use existing OSM footprint and approximate height. Network boundary effects and incomplete turn restrictions remain unvalidated. Pedestrians, buses and real-time controls are not included in this first pilot.

## Web integration

`/sumo` displays SUMO lane shapes, vehicles and signal states in the same local geographic projection as SejongScape. Playback, pause, reset, 1x/2x/5x speed and seeking all operate on the same recorded timeline. Statistics describe all vehicles in this pilot, not just the camera viewport. Existing password-per-document and owner-only visit history apply.

The deployed website replays precomputed results and does not require the user's computer to stay on. No continuously running SUMO service has been deployed.

## Actual traffic stage — pending data and hosting

1. ITS access was approved on 2026-09-16 and a pilot-area request returned 464 unique links with observation time 16:15 KST. See `ITS-CHECK.md` for evidence and remaining limits. Verify geometry, direction and units, then match provider link IDs to SUMO directed edges; do not match only by road name. Current monthly quota is 1,000 requests, so continuous frequent polling needs a quota increase and shared caching.
2. Obtain turning counts or an OD demand model and actual signal plans. Segment speed alone cannot determine volume, routes or signal phases.
3. Fit demand and validate speeds, flow and queue length against held-out observations. Keep unavailable/stale data separate from predictions.
4. Run a SUMO/TraCI process on a persistent server. Expose authenticated HTTPS snapshots through the existing site server; keep upstream API keys on the server. Define update frequency, freshness, failure states and compute cost before switching to live mode.
5. Show observation timestamp, source, coverage and simulation label in the UI. Do not label simulated vehicle positions as measured positions.

Official references:
- https://eclipse.dev/sumo/docs/Networks/Import/OpenStreetMap.html
- https://eclipse.dev/sumo/docs/TraCI.html
- https://www.its.go.kr/opendata/intro

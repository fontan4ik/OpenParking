# ParkingUSA Integration Usage Guide

This guide shows how to use the installed Codex, oh-my-codex, Spec Kit, Tavily, and researcher tooling for ParkingUSA.

## 1. Daily Project Commands

Always start from the project root:

```powershell
cd C:\AI\ParkingUSA
```

Run the app:

```powershell
npm run dev
```

Build before considering app changes done:

```powershell
npm run build
```

QA/DevOps baseline before handing off app/shared TypeScript changes:

```powershell
npm install
npm run db:generate
npm run typecheck
npm test
npm run build
```

See `docs/QA_DEVOPS_BASELINE_RUNBOOK.md` for the current Mac mini baseline result, package-lock sync history, PostGIS/Docker notes, temporary process cleanup, and rollback notes.

Routing MVP configuration:

```powershell
$env:VALHALLA_URL="http://127.0.0.1:8002"
npm run dev
```

`POST /api/route` is a server-side Valhalla boundary. The browser should call only `/api/route`; do not expose Valhalla directly to frontend code. The MVP supports `costing: "auto"`, finite lat/lon validation, a 100 km direct-distance cap, a 5 second provider timeout, and GeoJSON `LineString` responses with Valhalla/OpenStreetMap attribution. The map UI uses the same endpoint for selected-parking navigation from map-picked/geolocation/manual starts, point-to-point routes from two clicked map points, and current-location to clicked-destination routes; it intentionally excludes geocoder/autocomplete, turn-by-turn, route history, and location persistence.

Check the installed agent/tooling health:

```powershell
omx doctor
specify check
codex mcp list
```

## 2. Codex Research Runner

Use this when you want ParkingUSA source discovery, dataset evaluation, city parking research, or ingestion notes.

Basic shape:

```powershell
npm run research:codex -- "<research task>"
```

Example:

```powershell
npm run research:codex -- "Find official parking meter, curb regulation, garage, and lot datasets for Boston, MA. Prefer city/state/open-data sources. Return URLs, formats, freshness, license hints, and how each maps to ParkingUSA DataSource and SourceObservation records."
```

The output is saved into:

```text
C:\AI\ParkingUSA\data\research\codex-research-YYYYMMDD-HHmmss.md
```

Good prompt structure:

```text
Find [official data type] for [city/state].
Prefer [official portals/APIs].
Return:
- direct source URLs
- data format/API type
- update frequency or data_as_of
- license/terms notes
- suggested DataSource fields
- suggested SourceObservation fields
- confidence/freshness risks
```

Strong ParkingUSA examples:

```powershell
npm run research:codex -- "Research official curb regulation and parking meter sources for Seattle, WA. Include Socrata/ArcGIS/CKAN/API endpoints if present, not just landing pages."
```

```powershell
npm run research:codex -- "Compare NYC, Boston, Chicago, Seattle, and San Francisco parking data availability. Rank cities by readiness for ParkingUSA ingestion and explain required import workers."
```

```powershell
npm run research:codex -- "Find official documentation for San Francisco parking meter fields in the SFGov dataset 8vzz-qzz9. Explain which fields map to facility id, price/rate, schedule/rules, geometry, data_as_of, and raw_properties."
```

Use this runner instead of setting `OPENAI_API_KEY`. It uses Codex auth/runtime. Tavily is connected through the copied opencode key and Codex MCP config.

## 3. Spec Kit Workflow

Use Spec Kit when a feature needs a structured spec before implementation.

Recommended command flow:

```powershell
specify
```

Then ask Codex to use the local Spec Kit skills. Good command style:

```text
Use speckit-specify for ParkingUSA: define a feature to ingest official city parking meter datasets into PostGIS while preserving source_name, source_id, raw_properties, confidence, last_verified_at, and data_as_of.
```

Next steps:

```text
Use speckit-plan for that ParkingUSA feature. Check Referenss/ first and prefer existing import patterns.
```

```text
Use speckit-tasks for that plan. Split tasks into schema, importer, idempotency, tests, and build verification.
```

```text
Use speckit-implement for the first task only. Keep /api/stats, /api/facilities, and /api/geojson/[layer] compatible.
```

Useful Spec Kit skills installed in this repo:

```text
speckit-specify
speckit-plan
speckit-tasks
speckit-implement
speckit-clarify
speckit-analyze
speckit-checklist
speckit-agent-context-update
```

## 4. oh-my-codex Commands

Use OMX for deeper analysis, review, and multi-step work.

Health check:

```powershell
omx doctor
```

Simple Codex execution through OMX:

```powershell
omx exec --skip-git-repo-check -C C:\AI\ParkingUSA "Analyze the current ParkingUSA data import scripts and list the highest-risk ingestion gaps."
```

Good prompt style for OMX:

```text
Analyze C:\AI\ParkingUSA. Focus on data ingestion and provenance. Read AGENTS.md first. Do not modify files. Return ranked findings with file references.
```

For code review:

```text
Run a code review of ParkingUSA import and normalization code. Prioritize duplicate imports, provenance loss, geometry issues, and tests.
```

For planning:

```text
Plan the next ParkingUSA milestone: PostGIS-backed official city source ingestion. Respect AGENTS.md and reuse Referenss before new code.
```

Note: on Windows, `omx doctor` may warn about the Explore Harness requiring POSIX shell wrappers. That warning is expected; the core OMX/Codex path is working.

## 5. Researcher Repositories

Installed under:

```text
C:\AI\ResearchTools\open_deep_research
C:\AI\ResearchTools\gpt-researcher
```

Current recommendation:

```text
Primary architecture reference: open_deep_research
Secondary report/UI/reference tool: gpt-researcher
Production entry point today: npm run research:codex
```

Why:

```text
ParkingUSA needs structured source discovery, provenance, confidence, freshness, and ingestion decisions. open_deep_research is a better architectural fit for a LangGraph-style worker. gpt-researcher is useful for report-like research, but it is less directly aligned with deterministic ingestion pipelines.
```

The Python repos have `TAVILY_API_KEY` configured in their `.env` files and `OPENAI_API_KEY` intentionally blank. Do not paste Codex OAuth/session tokens into `OPENAI_API_KEY`.

## 6. ParkingUSA Data/Import Commands

Existing scripts:

```powershell
npm run import:sf
npm run fetch:miami-beach
npm run fetch:osm:miami
npm run fetch:osm:sf
npm run fetch:boundary:miami:dry-run
npm run fetch:boundary:miami
npm run fetch:boundary:miami-dade:dry-run
npm run fetch:boundary:miami-dade
npm run fetch:pbf:florida:dry-run
npm run fetch:pbf:florida
npm run import:osm:sf
npm run import:osm:sf:db
npm run import:osm:pbf:dry-run
npm run import:osm:pbf:florida:dry-run
npm run import:osm:pbf:florida:parking:dry-run
npm run import:osm:pbf:florida:parking:docker
npm run normalize:osm:pbf:miami:dry-run
npm run normalize:osm:pbf:miami:boundary:dry-run
npm run normalize:osm:pbf:miami-dade:boundary:dry-run
npm run normalize:street-parking
npm run normalize:street-parking:db
npm run audit:parking-geometry:miami
npm run audit:parking-geometry:miami:refresh
npm run derive:heuristics
npm run derive:heuristics:db
npm run tiles:dry-run
npm run tiles:build
npm run test:street-parking
```

Connector commands:

```powershell
npm run connector:socrata:dry-run
npm run connector:arcgis:dry-run
npm run connector:ckan:dry-run
npm run enrich:premium:dry-run
npm run connector:socrata:import
npm run connector:arcgis:import
npm run connector:ckan:import
npm run enrich:premium:import
```

`connector:arcgis:dry-run` remains non-mutating and fetches a bounded sample/report. The default `connector:arcgis:import` target is Miami Beach ArcGIS: it preserves the foundation records (`DataSource`, `ImportRun`, `SourceObservation`), fetches live GeoJSON layers 1, 3, 5, and 7 for accounting, and promotes only layers 1, 5, and 7 into canonical `ParkingFacility` and `ParkingZone` rows by `sourceName + sourceId`. Layer 3 parking spaces are counted as skipped/non-canonical and are still retained only by `fetch:miami-beach:arcgis` as a raw fixture, not as canonical rows in this slice.

`enrich:premium:dry-run` is the first safe Miami operator enrichment probe. It targets Premium Parking's public Miami client/GraphQL contract and emits bounded `operator_facility_observation` records with evidence URLs and link classification. A live server-side request may return `401 Unauthorized source`; that is expected for this source and means a browser-captured JSON payload should be passed with `tsx apps/backend/scripts/run_premium_enrichment.ts --dry-run --fixture=<market-json>`. The script intentionally keeps canonical `payment_url` and `booking_url` empty for Premium facility pages unless a direct checkout URL is observed and reviewed.

Direct per-record payment links require external parsers, not just static backend fetches. The practical workflow is:

1. Run a bounded browser/network parser for one provider flow (for example Premium, PayByPhone/ParkMobile zone, Parking.com/SP+, MPA commerce, or airport parking) without bypassing CAPTCHA, auth, paywalls, or rate limits.
2. Capture DOM/network evidence, final candidate URL, source page URL, provider zone/location id, content hash or screenshot path, and raw payload.
3. Classify each candidate as `direct_checkout`, `facility_page`, `app_zone`, or `operator_search`.
4. Store the result as `SourceObservation` first. Do not update canonical `payment_url` / `booking_url` from `facility_page`, `operator_search`, or generic app links.
5. Promote only stable `direct_checkout` links after ToS/legal review, repeated-run stability, and a match to one canonical facility/zone with high confidence.

If a source blocks server-side requests with `403`, `401 Unauthorized source`, Incapsula/challenge pages, or client-only GraphQL, mark it `browser_required` or `partner_required` in the parser notes instead of weakening the rules. Preferred long-term path for payment operators is a partner/API feed; browser parsers are for evidence and targeted gap closure.

Before changing import logic:

```text
Ask Codex/OMX to inspect Referenss/parking, Referenss/osm-tag-updater, Referenss/osmtogeojson, Referenss/osm2pgsql, Referenss/martin, and Referenss/tippecanoe for reusable patterns.
```

After changing import logic:

```powershell
npm run build
npm run typecheck
npm run test:street-parking
```

For data import changes, verify idempotency and keep the San Francisco baseline unless intentionally changing ingestion:

```text
33,511 meter facilities
2,889 curb segments
403 OSM zones
```

The app currently defaults to Miami. In DB mode, `city=miami` intentionally reads the `Miami + Miami-Dade` DB scope so the ParkingUSA layer includes OSM/Geofabrik parking candidates that OpenStreetMap renders as `P` icons, including Miami Beach/Muss Park candidates. Official fixtures are still merged as enrichment/fallback: `data/miami_parking_facilities.geojson`, `data/miami_beach_parking_wpgmza.geojson`, `data/miami_beach_parking_arcgis_facilities.geojson`, and 532 renderable official Miami Beach lot/zone polygons. `npm run fetch:miami-beach` refreshes the Miami Beach official marker fixture. `npm run fetch:miami-beach:arcgis` refreshes official ArcGIS meters, street spaces, lots, and zones for file fallback. `npm run connector:arcgis:import` is the DB-backed Miami Beach ArcGIS promotion path for canonical meters, lot centroids, and lot/zone polygons. `npm run fetch:osm:miami` and `npm run fetch:osm:sf` create optional mixed-geometry OSM coverage files (`data/miami_parking_osm.geojson`, `data/sf_parking_osm.geojson`) for file fallback only. Public Overpass may require retry/backoff and can be sparse; Geofabrik PBF through `osm2pgsql` is the preferred production path.

For Miami curb-line correctness, run `npm run audit:parking-geometry:miami:refresh` after changing parking-space grouping or when the OSM road/building cache is stale; otherwise run `npm run audit:parking-geometry:miami`. The refresh command uses Overpass only to cache road centerlines and building polygons in `data/research/fetches/miami-osm-roads-buildings-cache.geojson`. The audit then checks generated curb rows locally against those roads/buildings plus official lot/garage polygons, and writes `data/research/miami-parking-geometry-quality-report.json`. Lines are trusted only if they are straight, parallel to the nearest road, offset from the road centerline, near the road, and do not cross buildings or parking-area interiors; failures stay in review/reference state or are suppressed.

For the production-scale Florida/Miami OSM baseline, use the Geofabrik workflow instead of public Overpass:

```powershell
npm run fetch:pbf:florida:dry-run
npm run fetch:pbf:florida
npm run import:osm:pbf:florida:parking:dry-run
npm run import:osm:pbf:florida:parking:docker
npm run import:osm:pbf -- --input=data/osm/florida-latest.osm.pbf --schema=osm_raw --flex=apps/backend/scripts/osm2pgsql_parking.lua
npm run fetch:boundary:miami
npm run normalize:osm:pbf:miami:dry-run
npm run normalize:osm:pbf:miami:boundary:dry-run
npm run normalize:osm:pbf -- --city=Miami --state=FL
```

The parking-focused import is preferred over the generic import because `apps/backend/scripts/osm2pgsql_parking.lua` creates raw tables that already match ParkingUSA layer semantics:

```text
osm_raw.parking_points   -> Point candidates for facilities, entrances, and spaces
osm_raw.parking_lines    -> road-side or open-way parking candidates for curb/segment lines
osm_raw.parking_polygons -> parking lots, garages, areas, and multipolygon zones
```

`fetch:pbf:florida:dry-run` performs a HEAD check and prints the expected URL, output path, remote size, and last-modified timestamp without downloading. `import:osm:pbf:florida:parking:dry-run` prints the exact external `osm2pgsql --output=flex --style ...osm2pgsql_parking.lua` command and no longer requires `DATABASE_URL` for dry-run. If `osm2pgsql` is not installed on the host, use `import:osm:pbf:florida:parking:docker`, which runs the external tool through the `osm2pgsql` Docker Compose service and mounts `data/osm` plus the ParkingUSA Lua flex config read-only. After raw import, `normalize:osm:pbf` reads `osm_raw.parking_points`, `osm_raw.parking_lines`, and `osm_raw.parking_polygons`, then idempotently upserts them into `ParkingFacility`, `CurbSegment`, and `ParkingZone` with source/provenance and confidence fields.

For real-world Miami boundaries, prefer the Census TIGERweb polygon commands over bbox-only normalization:

```powershell
npm run fetch:boundary:miami:dry-run
npm run fetch:boundary:miami
npm run normalize:osm:pbf:miami:boundary:dry-run
```

For county-wide Miami-Dade coverage, use:

```powershell
npm run fetch:boundary:miami-dade
npm run normalize:osm:pbf:miami-dade:boundary:dry-run
npm run normalize:osm:pbf:miami-dade:boundary
```

The boundary files are stored in `data/boundaries/` with Census provenance metadata. `--boundary-geojson` applies a PostGIS polygon `ST_Intersects` filter; the City of Miami command keeps the old bbox as a fast prefilter, while the Miami-Dade county command uses the county polygon directly.

The package-script real boundary import commands include `--replace-source` so an earlier bbox-only Geofabrik import does not leave stale OSM candidates outside the chosen boundary. Run the dry-run command first, compare counts, then run the real command only for the boundary scope you want to display as the current DB baseline. On 2026-06-13 the local ParkingUSA DB imported the Miami-Dade OSM baseline without replacing rows by running `node apps/backend/scripts/normalize_osm_raw_parking_to_db.mjs --city=Miami-Dade --state=FL --boundary-geojson=data/boundaries/miami_dade_county_boundary.geojson`; it imported 1,425 points, 185 lines, and 6,821 polygons.

## 6.1 Local Site Preview With Zrok

For the practical run/test/share workflow, use `docs/LOCAL_TESTING_AND_ZROK_GUIDE.md`.

Zrok token handling must stay local-only. Do not commit real tokens.

```powershell
C:\zrok\zrok2.exe version
$env:ZROK_ENABLE_TOKEN="<local-token>"
npm run zrok:enable
npm run dev:public
npm run share:zrok
```

ParkingUSA automatically looks for `ZROK_PATH`, `C:\zrok\zrok2.exe`, `C:\zrok\zrok.exe`, and then `zrok` from `PATH`. `dev:public` binds Next.js to `0.0.0.0:3000`, which lets zrok proxy the local site. `share:zrok` shares `localhost:3000` and prints the external URL. The older `frontend:dev:public` and `tunnel:zrok` aliases remain available for compatibility.

## 7. Best Prompt Templates

Research prompt:

```text
Research official parking data sources for [CITY, STATE].
Use official city/state/open-data/API sources first.
Return direct URLs, API endpoints, formats, update frequency, license/terms notes, field mapping, confidence, freshness, and suggested ParkingUSA DataSource/SourceObservation records.
```

Implementation prompt:

```text
Implement [FEATURE] in C:\AI\ParkingUSA.
Read AGENTS.md first.
Before writing new parsing/import logic, inspect Referenss/.
Preserve source_name, source_id, raw_properties, confidence, last_verified_at, and data_as_of.
Keep /api/stats, /api/facilities, and /api/geojson/[layer] compatible.
Run npm run build when done.
```

Review prompt:

```text
Review the ParkingUSA changes for ingestion correctness.
Prioritize duplicate imports, lost provenance, stale data_as_of, geometry quality, broken GeoJSON compatibility, and missing tests.
Give file/line findings first.
```

Spec prompt:

```text
Use Spec Kit to define a ParkingUSA feature for [FEATURE].
The spec must include data quality, provenance, idempotent import behavior, API compatibility, and tests.
```

## 8. Typical Workflow

For a new city:

```powershell
npm run research:codex -- "Find official parking meter, curb, garage, and lot data sources for Portland, OR. Include API endpoints, formats, freshness, and ingestion recommendations for ParkingUSA."
```

Then:

```text
Use speckit-specify to turn the Portland research note into a ParkingUSA ingestion feature spec.
```

Then:

```text
Use speckit-plan and speckit-tasks. Reuse Referenss before new code.
```

Then:

```text
Implement only the first ingestion task, keep existing APIs compatible, and run npm run build.
```

For an existing importer bug:

```text
Analyze C:\AI\ParkingUSA import scripts. Find why repeated import may create duplicates. Read AGENTS.md and relevant Referenss first. Do not edit until you identify the exact files and risk.
```

Then:

```text
Fix the duplicate import issue. Add or update a focused test. Run npm run build and the relevant import/test command.
```

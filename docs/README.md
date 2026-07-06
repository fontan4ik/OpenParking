# ParkingUSA

ParkingUSA is a parking data platform for the United States. The goal is to build a comprehensive, source-aware parking data layer covering facilities, garages, lots, meters, curb segments, parking zones, prices, rules, availability signals, freshness, confidence, and provenance.

The current web application lives in `apps/frontend` and defaults to a Miami seed layer built with Next.js, React, and MapLibre GL JS. San Francisco remains a benchmark fallback dataset. Shared backend code lives in `apps/backend`, including Prisma, parsers, importers, research jobs, and tile scripts. The future mobile app has a separate workspace in `apps/mobile`.

## Current Status

The project currently includes:

- a full-screen MapLibre map shell;
- public API routes for stats, facilities, and GeoJSON layers;
- additive `POST /api/route` routing MVP backed by server-side Valhalla, including selected-parking routes and map-picked point-to-point routes;
- Miami official-source seed facilities plus Miami Beach official GIS expansion layers;
- San Francisco meter, curb-segment, and OSM-zone benchmark fixtures;
- DB-backed OSM/Geofabrik mixed-geometry coverage baseline, with `data/<city>_parking_osm.geojson` retained only as file fallback;
- DB-backed Miami Beach ArcGIS canonical import for official meters, lot centroids, and lot/zone polygons;
- a frontend source catalog in `apps/frontend/lib/sources.ts` that groups source URLs, API URLs, payment/booking links, evidence, confidence, legal risk, and ingestion status by city;
- Prisma/PostGIS schema and import scripts;
- street-parking normalization ported from `Referenss/osm-tag-updater`;
- external-tool paths for `osmtogeojson`, `osm2pgsql`, Martin, Tippecanoe, and zrok.

San Francisco baseline counts to preserve unless intentionally changing ingestion:

| Layer | Expected Count |
| --- | ---: |
| Meter facilities | 33,511 |
| Curb segments | 2,889 |
| OSM zones | 403 |

Miami fallback counts after `npm run fetch:miami-beach:arcgis`:

| Layer | Expected Count |
| --- | ---: |
| Official-source facilities | 621 |
| Curb segments | 0 |
| Parking lot/zone polygons | 532 |

Miami coverage is still not complete at 621 facility points. The current fallback combines 12 City of Miami/Miami-Dade seed records, 74 official City of Miami Beach WP Go Maps garage/lot markers, and 535 official City of Miami Beach ArcGIS records (75 lot/garage centroids plus 460 street meters). The ArcGIS fetch also preserves 11,018 raw Miami Beach parking-space records and 532 renderable lot/zone polygons for future richer map layers. Layer 5 `Parking Lots` polygons are actual lots; layer 7 `Parking Zones` polygons are residential/regulatory rule boundaries, not proof that parking is available across the whole polygon. In DB mode, `npm run connector:arcgis:import` promotes the Miami Beach ArcGIS layers into canonical rows: layer 1 meters and layer 5 lot centroids become `ParkingFacility`, layer 5 polygons become lot `ParkingZone` rows, layer 7 polygons become `residential_parking_zone` rule polygons with `price_status=not_applicable`, and layer 3 spaces remain raw fixture data only. Running `npm run fetch:osm:miami` adds an optional OSM coverage baseline in `data/miami_parking_osm.geojson`; the frontend automatically splits that file into places, road-side line segments, and zones by geometry type. The expansion source inventory is tracked in `data/research/miami-source-inventory-20260611.json` and the city manifest in `data/research/cities/miami.fl.json`. Priority source families remain Miami Parking Authority, Miami-Dade County, MIA, PortMiami, OSM/Geofabrik, Overture, Coral Gables, and major operators such as Parking.com/SP+, ABM, LAZ, and Premium Parking.

The DB-backed OSM/Geofabrik Miami baseline has been run locally: Florida PBF was imported through the Dockerized `osm2pgsql` flex workflow. The initial bbox pass found 609 OSM facility points, 120 OSM parking lines, and 1,108 OSM parking polygons. That bbox pass was superseded by the City of Miami Census boundary workflow: `npm run fetch:boundary:miami` plus `npm run normalize:osm:pbf:miami:boundary` kept 407 OSM facility points, 34 OSM parking lines, and 572 OSM parking polygons inside the real City of Miami incorporated-place polygon. The default app scope now also includes the Miami-Dade county-wide OSM baseline imported on 2026-06-13: 1,425 points, 185 lines, and 6,821 polygons. This broader scope is intentional so OpenStreetMap `P` parking candidates around Miami Beach/Muss Park appear in ParkingUSA instead of only on the basemap.

## Key Documents

| Document | Purpose |
| --- | --- |
| `PROJECT_OVERVIEW_RU.md` | Главный продуктовый и архитектурный источник правды: что строим, как работают данные/API, какие источники используются и какие поля нужно показывать пользователю. |
| `UI_DATA_TRUST_PROPOSAL_RU.md` | DEV-50 UX proposal/backlog: как честно показывать unknown price/source/payment/confidence, layer filters, evidence panel и anti-false-offer states. |
| `LOCAL_TESTING_AND_ZROK_GUIDE_RU.md` | Короткий русский guide для локального запуска, обновления Miami fixtures, проверки API и zrok-шаринга. |
| `LOCAL_TESTING_AND_ZROK_GUIDE.md` | Short English guide for local run, Miami fixture refresh, API check, and zrok sharing. |
| `QA_DEVOPS_BASELINE_RUNBOOK.md` | QA/DevOps baseline: `npm install`, Prisma generate, typecheck, tests, build, package-lock sync history, process cleanup and rollback notes. |
| `QA_GOLDEN_PARKING_CORRECTNESS_PLAN.md` | DEV-53 deterministic golden QA plan and fixture list for South Beach/Ocean Drive/ParkMobile/Dock 1540 Broadway parking correctness regressions. |
| `PAYMENT_RATE_MODEL_DEV_51.md` | DEV-51 schema/API implications and fixture proposal for ParkMobile/PayByPhone zones, payment methods, and structured garage tariffs. |
| `CITY_SOURCE_FEASIBILITY_DEV_54_RU.md` | DEV-54 research: feasibility matrix Miami vs NYC vs LA vs SF, easiest next source path, legal/ToS risk, price freshness, rules/rates/entrance gaps, and browser/manual evidence needs. |
| `USER_FIELD_EVIDENCE_INGESTION_FLOW_RU.md` | DEV-52 design/backlog: пользовательские фото/скрины/голос/точки на карте -> OCR/metadata/manual review -> `SourceObservation`/correction -> confidence update. |
| `SOUTH_BEACH_FALSE_POSITIVE_AUDIT_DEV-49_RU.md` | DEV-49 data audit: почему South Beach/Ocean Drive/Collins/Lincoln слои дают false positives, какие source IDs затронуты и какие правила фильтрации/confidence применять. |
| `ROAD_CURB_ENTRANCE_SNAPPING_HEURISTICS_DEV_55.md` | DEV-55 design/reference pack: road/curb/entrance snapping heuristics, side-of-street offsets, intersection/crosswalk/hydrant/driveway/loading/valet/no-parking cuts, entrance association, confidence gates and reusable reference data/tools before implementation. |
| `AGENTS.md` | Project instructions for agents and implementation constraints. |
| `CODEX.md` | Codex-specific operating guide that points back to `AGENTS.md`. |
| `CLAUDE.md` | Claude-compatible agent entry point. |
| `GEMINI.md` | Gemini-compatible agent entry point. |
| `ROADMAP.md` | Advanced checklist roadmap for product, data, map, and operations work. |
| `ARCHITECTURE.md` | Target architecture, data quality contract, and layer responsibilities. |
| `data_taxonomy_parking_semantics_DEV-48.md` | Decision document for separating physical facilities, entrances, curb segments, payment/regulatory zones, valet/drop-off/loading/no-parking, and uncertain candidates. |
| `REFERENCE_REPOS.md` | How to use the open-source reference repositories in `Referenss/`. |
| `THIRD_PARTY_NOTICES.md` | Provenance and license notes for reused code and referenced tools. |
| `INTEGRATION_USAGE_GUIDE.md` | Local workflow for Codex, Spec Kit, research, imports, tests, tiles, and zrok. |
| `RESEARCHER_DECISION.md` | Decision record for the research-worker tooling direction. |
| `PRELIMINARY_IMPLEMENTATION_REPORT_RU.md` | Отчет о текущем состоянии: источники, данные, проблемы, решения, финансовая оценка. |

The older research notes remain useful background:

- `parking_usa_research.md`
- `parking_data_collection_plan.md`
- `parking_full_data_strategy.md`

## Project Layout

| Path | Purpose |
| --- | --- |
| `apps/frontend/` | Next.js website: app routes, components, frontend-local library code, and web PoC assets. |
| `apps/backend/` | Shared backend workspace for Prisma, parsers, importers, research jobs, and tile scripts. |
| `apps/mobile/` | Future mobile app workspace, separated from the website. |
| `tests/` | Project test suite. Tests may import site code through the `@/` alias. |
| `data/` | Shared GeoJSON fixtures, research data, import outputs, and fallback API inputs. |
| `apps/backend/prisma/` | Shared Prisma/PostGIS schema. |
| `apps/backend/scripts/` | Shared data import, research, normalization, parser, and tile scripts. |
| `docs/` | Project documentation and research notes. |
| `logs/` | Runtime and dev-server logs. |
| `Referenss/` | Local reference repositories. Do not rewrite or delete. |

## Reference-First Rule

Before writing new code for parsing, OSM conversion, street-parking normalization, workers, map layers, GeoJSON APIs, PostGIS models, or tile generation, inspect `Referenss/`.

Preference order:

1. Port ready code when license and architecture allow it.
2. Adapt ready code into the ParkingUSA schema and APIs.
3. Use native or GPL tools as external Docker/CLI services.
4. Write new code only when no reference module fits.

Important references:

- `Referenss/parking` for Prisma/PostGIS patterns, scheduler services, GeoJSON API/export patterns, and map/control ideas.
- `Referenss/osm-tag-updater` for street-parking tag normalization.
- `Referenss/osmtogeojson` for OSM/Overpass JSON/XML to GeoJSON conversion.
- `Referenss/osm2pgsql` as an external OSM PBF to PostGIS import tool.
- `Referenss/martin` as the vector tile server.
- `Referenss/tippecanoe` as an external static tile builder.

## Local Development

Install dependencies:

```powershell
npm install
```

Run the app:

```powershell
npm run dev
```

Short operator commands:

```powershell
npm run dev:public
npm run data:refresh:miami
npm run share:zrok
npm run check:local
```

Explicit compatibility commands remain available:

```powershell
npm run frontend:dev
npm run frontend:dev:public
npm run frontend:build
npm run frontend:start
npm run frontend:start:public
npm run tunnel:zrok
npm run tunnel:zrok:private
```

Build before considering app changes complete:

```powershell
npm run build
```

Common import and data commands:

```powershell
npm run data:refresh:miami
npm run import:sf
npm run fetch:miami-beach
npm run fetch:miami-beach:arcgis
npm run fetch:osm:miami
npm run fetch:boundary:miami
npm run fetch:boundary:miami-dade
npm run fetch:pbf:florida:dry-run
npm run fetch:pbf:florida
npm run import:osm:sf
npm run import:osm:sf:db
npm run import:osm:pbf:florida:dry-run
npm run import:osm:pbf:florida:parking:dry-run
npm run import:osm:pbf:florida:parking:docker
npm run normalize:osm:pbf:miami:dry-run
npm run normalize:osm:pbf:miami:boundary:dry-run
npm run normalize:osm:pbf:miami-dade:boundary:dry-run
npm run normalize:street-parking
npm run derive:heuristics
npm run tiles:dry-run
npm run tiles:build
```

Zrok external sharing commands:

```powershell
C:\zrok\zrok2.exe version
$env:ZROK_ENABLE_TOKEN="<local-token>"
npm run zrok:enable
npm run dev:public
npm run share:zrok
```

`npm run share:zrok` automatically looks for `ZROK_PATH`, `C:\zrok\zrok2.exe`, `C:\zrok\zrok.exe`, and then `zrok` from `PATH`. If zrok lives elsewhere, set `ZROK_PATH` in `.env.local`.

Focused street-parking tests:

```powershell
npm run test:street-parking
```

## Public API Compatibility

Keep these endpoints compatible with the current frontend:

- `GET /api/stats`
- `GET /api/facilities`
- `GET /api/parking-index`
- `GET /api/geojson/[layer]`
- `POST /api/route`

`/api/parking-index` is the current single ParkingUSA canonical coverage feed for app/API consumers. It combines facilities, curb lines, and parking zones into one GeoJSON response and marks each record with existence, price, rule, and enrichment status. For `city=miami`, the DB scope is `Miami + Miami-Dade`, using OSM/Geofabrik as the primary existence baseline and official fixtures as enrichment/fallback. Layer-specific endpoints remain available for compatibility and MapLibre rendering.

`/api/route` is additive. The browser never calls Valhalla directly; the Next.js route handler uses `VALHALLA_URL` server-side, validates finite lat/lon, enforces `costing: "auto"`, caps MVP requests at 100 km direct distance, and returns a GeoJSON `LineString` plus distance/time summary and Valhalla/OpenStreetMap attribution. The current frontend uses this same boundary for map-picked/geolocation/manual start to selected parking, map-picked start/destination point-to-point routes, and current-location to clicked-destination routes. It does not add geocoder/autocomplete, turn-by-turn navigation, route history, or persisted user location.

The API should read from PostGIS when available and fall back to `data/*.geojson` fixtures while database-backed ingestion stabilizes.

## Data Quality Contract

Every imported record should preserve:

- `source_name`
- `source_id`
- `raw_properties`
- `confidence`
- `last_verified_at`
- `data_as_of`
- geometry quality and provenance notes where available

## Do Not

- Do not use Google Maps scraping as the master database.
- Do not replace MapLibre with PNNL's Mapbox GL v1.
- Do not copy GPL/native tool code into the app.
- Do not rewrite OSM multipolygon or relation handling manually.
- Do not delete or rewrite `Referenss/`.
- Do not introduce a new abstraction before checking whether PNNL already has a usable pattern.

# ParkingUSA

ParkingUSA is a parking data platform for the United States. The goal is to build a comprehensive, source-aware parking data layer covering facilities, garages, lots, meters, curb segments, parking zones, prices, rules, availability signals, freshness, confidence, and provenance.

The current web application lives in `apps/frontend` and is a San Francisco proof of concept built with Next.js, React, and MapLibre GL JS. Shared backend code lives in `apps/backend`, including Prisma, parsers, importers, research jobs, and tile scripts. The future mobile app has a separate workspace in `apps/mobile`.

## Current Status

The project currently includes:

- a full-screen MapLibre map shell;
- public API routes for stats, facilities, and GeoJSON layers;
- San Francisco meter, curb-segment, and OSM-zone fixtures;
- Prisma/PostGIS schema and import scripts;
- street-parking normalization ported from `Referenss/osm-tag-updater`;
- external-tool paths for `osmtogeojson`, `osm2pgsql`, Martin, and Tippecanoe.

San Francisco baseline counts to preserve unless intentionally changing ingestion:

| Layer | Expected Count |
| --- | ---: |
| Meter facilities | 33,511 |
| Curb segments | 2,889 |
| OSM zones | 403 |

## Key Documents

| Document | Purpose |
| --- | --- |
| `PROJECT_OVERVIEW_RU.md` | Главный продуктовый и архитектурный источник правды: что строим, как работают данные/API, какие источники используются и какие поля нужно показывать пользователю. |
| `AGENTS.md` | Project instructions for agents and implementation constraints. |
| `CODEX.md` | Codex-specific operating guide that points back to `AGENTS.md`. |
| `CLAUDE.md` | Claude-compatible agent entry point. |
| `GEMINI.md` | Gemini-compatible agent entry point. |
| `ROADMAP.md` | Advanced checklist roadmap for product, data, map, and operations work. |
| `ARCHITECTURE.md` | Target architecture, data quality contract, and layer responsibilities. |
| `REFERENCE_REPOS.md` | How to use the open-source reference repositories in `Referenss/`. |
| `THIRD_PARTY_NOTICES.md` | Provenance and license notes for reused code and referenced tools. |
| `INTEGRATION_USAGE_GUIDE.md` | Local workflow for Codex, Spec Kit, research, imports, tests, and tiles. |
| `RESEARCHER_DECISION.md` | Decision record for the research-worker tooling direction. |

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
- `Referenss/abstreet` for parking-lot extraction, service-road, parking-aisle, and capacity heuristics.

## Local Development

Install dependencies:

```powershell
npm install
```

Run the app:

```powershell
npm run dev
```

Equivalent explicit frontend commands:

```powershell
npm run frontend:dev
npm run frontend:build
npm run frontend:start
```

Build before considering app changes complete:

```powershell
npm run build
```

Common import and data commands:

```powershell
npm run import:sf
npm run import:osm:sf
npm run import:osm:sf:db
npm run normalize:street-parking
npm run derive:heuristics
npm run tiles:dry-run
npm run tiles:build
```

Focused street-parking tests:

```powershell
npm run test:street-parking
```

## Public API Compatibility

Keep these endpoints compatible with the current frontend:

- `GET /api/stats`
- `GET /api/facilities`
- `GET /api/geojson/[layer]`

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

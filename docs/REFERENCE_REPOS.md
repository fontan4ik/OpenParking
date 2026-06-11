# ParkingUSA Reference Repositories

Date: 2026-06-08

ParkingUSA is built from proven open-source building blocks stored under `Referenss/`. Use these repositories before creating new ingestion, OSM, map, PostGIS, worker, or tile logic.

## Reuse Policy

Use this order when implementing new behavior:

1. Port ready code when license and architecture allow it.
2. Adapt ready code into the ParkingUSA schema and APIs.
3. Use native or GPL tools as external Docker/CLI services.
4. Write new code only when no reference module fits.

If new code is written from scratch in an area covered by `Referenss/`, explain why the available reference code was not suitable.

## Repository Matrix

| Repository | License / Policy | Preferred Use | Service Use | Avoid |
| --- | --- | --- | --- | --- |
| `Referenss/parking` | Battelle permissive-style license. Preserve notices when porting code. | Prisma/PostGIS model ideas, service scheduler pattern, worker task structure, GeoJSON API/export pattern, map/control ideas. | Docker Compose patterns may be adapted. | Do not port auth, Traefik, Mapbox GL v1, Blueprint UI wholesale, or the Julia prediction service in the first integration. |
| `Referenss/osm-tag-updater` | MIT. Preserve copyright notice. | Port `src/components/Tool/transpose`, `src/components/Tool/utils`, related templates, and tests for street-parking normalization. | Not needed. | Do not port the entire Vite app unless a manual mapper UI is explicitly needed. |
| `Referenss/osmtogeojson` | MIT. Prefer package dependency or local vendor with notice. | Convert OSM/Overpass JSON/XML to GeoJSON, including ways, nodes, relations, multipolygons, and tainted/incomplete geometry flags. | Not needed. | Do not maintain custom OSM polygon/relation parsing when this library can handle it. |
| `Referenss/osm2pgsql` | GPL-2.0. Keep separate from application code. | Do not copy source into the app. | Use as an external Docker/CLI tool for OSM PBF to PostGIS imports. | Do not copy GPL/C++ source into ParkingUSA application code. |
| `Referenss/martin` | MIT/Apache-2.0 dual license. | Use config examples and MapLibre integration docs. | Use as an external vector tile server for PostGIS, MBTiles, or PMTiles. | Do not build a custom tile server for the MVP. |
| `Referenss/tippecanoe` | BSD-style license. | Use command patterns and tile-build settings. | Use as an external GeoJSON to MBTiles/PMTiles build tool. | Do not embed native code into the web app. |
| `Referenss/abstreet` | Apache-2.0. | Use as algorithm/reference material for parking lots, parking aisles, service roads, capacity heuristics, and mapper workflows. | Not needed. | Do not port the Rust app wholesale. |

## Per-Repository Notes

### `Referenss/parking`

Primary backend reference.

Use for:

- Prisma/PostGIS schema and query patterns;
- `Space`, `Occupancy`, and `Prediction` model ideas;
- service scheduler patterns from `app/src/services`;
- GeoJSON API/export patterns from `app/src/pages/api/spaces/[param].ts`;
- map/control UX ideas from `app/src/app/new`.

Do not blindly copy:

- auth stack;
- Traefik setup;
- Mapbox GL v1 dependency;
- Blueprint UI as a full design system;
- Julia prediction service for the first integration.

### `Referenss/osm-tag-updater`

Primary street-parking tag normalization source.

Port directly when needed:

- `src/components/Tool/transpose`;
- `src/components/Tool/utils`;
- related tests.

Use it for old `parking:lane:*` and `parking:condition:*` tags and the newer `parking:left/right/both` schema.

### `Referenss/osmtogeojson`

Use for OSM/Overpass JSON or XML to GeoJSON conversion.

It should handle:

- ways;
- nodes;
- relations;
- multipolygons;
- tainted or incomplete geometry flags.

Do not maintain a custom OSM polygon/relation parser when this library can handle the input.

### `Referenss/osm2pgsql`

Use as an external production import tool for OSM PBF into PostGIS.

Rules:

- invoke through Docker or CLI;
- keep GPL/native code separate from ParkingUSA application code;
- document command patterns and generated tables where used.

### `Referenss/martin`

Use as the vector tile server for:

- PostGIS tables;
- MBTiles;
- PMTiles.

Prefer Martin for scalable map layers instead of shipping large GeoJSON payloads to the browser.

### `Referenss/tippecanoe`

Use as an external tile-build tool for:

- GeoJSON to MBTiles/PMTiles;
- city, state, and nationwide layers;
- archival or heavy read-only datasets.

### `Referenss/abstreet`

Use as algorithm/reference material for:

- OSM parking lot extraction;
- service roads and parking aisles;
- capacity heuristics;
- street-parking mapper workflows.

Do not port the Rust app wholesale.

## Provenance Rule

When code is ported into ParkingUSA:

- add attribution in `THIRD_PARTY_NOTICES.md`;
- preserve license notices as required;
- keep source path references in comments when they are useful for future maintenance.

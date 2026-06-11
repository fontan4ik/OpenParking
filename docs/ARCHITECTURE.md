# ParkingUSA Architecture

Date: 2026-06-08

ParkingUSA is a full-stack parking data platform built around source-aware ingestion, PostGIS storage, Prisma application access, and MapLibre visualization. The current San Francisco proof of concept remains the working frontend shell while the backend moves from file fixtures toward durable database-backed ingestion.

## Architecture Direction

The target system keeps the current public API surface stable while replacing ad hoc data loading with a provenance-preserving data pipeline.

```text
City / OSM / operator sources
  -> deterministic importers and external tools
  -> normalized ParkingUSA records
  -> PostGIS + Prisma
  -> compatible GeoJSON APIs
  -> MapLibre frontend
  -> Martin / Tippecanoe vector tile path for scale
```

## Core Layers

### Frontend

- Next.js App Router.
- React.
- MapLibre GL JS.
- Full-screen map UI as the working shell.
- GeoJSON mode for MVP, debugging, and fixture fallback.
- Vector tile mode for large city/state/national layers.

### API

Keep the current public endpoints compatible:

- `GET /api/stats`
- `GET /api/facilities`
- `GET /api/geojson/[layer]`

API behavior:

- Read from PostGIS first when database records are available.
- Fall back to `data/*.geojson` fixtures while database work stabilizes.
- Return GeoJSON-compatible responses for the existing frontend.
- Preserve layer counters and selected-feature details.

### Storage

- PostGIS is the primary storage target.
- Prisma is the application ORM.
- GeoJSON fixtures remain canonical MVP seed inputs and fallback data.
- Imported rows must be idempotent: repeated imports must not create duplicates.

### Ingestion

- City open-data connectors normalize official datasets into ParkingUSA records.
- OSM Overpass JSON/XML should be converted through `osmtogeojson`.
- Production OSM PBF imports should use external `osm2pgsql`.
- Street-parking tags should use the ported `osm-tag-updater` normalizer.
- Heavy or ambiguous extraction should be routed through research/import tasks, not hidden inside frontend code.

### Tiles

- Martin serves vector tiles from PostGIS, MBTiles, or PMTiles.
- Tippecanoe builds static MBTiles/PMTiles from large GeoJSON layers.
- Large layers should move to vector tiles instead of shipping oversized GeoJSON to browsers.

## Data Model Direction

ParkingUSA records should represent:

- parking facilities, garages, and lots;
- meter points and curb segments;
- parking zones and regulatory areas;
- prices, rules, schedules, and restrictions;
- availability, occupancy, predictions, and freshness signals;
- source observations and evidence.

Use `Referenss/parking` for Prisma/PostGIS model patterns, especially ideas around `Space`, `Occupancy`, and `Prediction`, but adapt them to the ParkingUSA schema and API surface.

## Data Quality Contract

Every imported record should preserve:

| Field | Purpose |
| --- | --- |
| `source_name` | Human-readable upstream source name. |
| `source_id` | Stable upstream identifier when available. |
| `raw_properties` | Original source payload or relevant source fields. |
| `confidence` | Confidence score for normalized facts. |
| `last_verified_at` | When ParkingUSA last verified the record. |
| `data_as_of` | Upstream data currency or publication date. |
| Geometry provenance | Notes about geometry source, derivation, and quality. |

## Reference-First Implementation Rules

Before writing new data, OSM, scheduling, tile, GeoJSON, or PostGIS logic, inspect `Referenss/` and port or adapt ready code where feasible.

Use this order:

1. Port ready code when license and architecture allow it.
2. Adapt ready code into the ParkingUSA schema and APIs.
3. Use native or GPL tools as external Docker/CLI services.
4. Write new code only when no reference module fits.

## Initial Build Order

1. Document architecture and third-party provenance.
2. Port the PNNL backend foundation into the app.
3. Import current San Francisco GeoJSON data into a PostGIS-compatible schema.
4. Keep file fallback while database-backed reads stabilize.
5. Port `osm-tag-updater` normalization and tests.
6. Replace custom OSM parsing with `osmtogeojson`.
7. Add `osm2pgsql`, Martin, and Tippecanoe as external services/jobs.
8. Add A/B Street-derived heuristics after base ingestion is stable.

## Verification Expectations

After app changes:

```powershell
npm run build
```

For import changes:

- repeated imports must not create duplicates;
- preserve the San Francisco baseline unless intentionally changing ingestion:
  - 33,511 meter facilities;
  - 2,889 curb segments;
  - 403 OSM zones.

For frontend/map changes:

- verify the MapLibre canvas renders;
- verify layer counters display;
- verify the detail panel opens for selected parking records.

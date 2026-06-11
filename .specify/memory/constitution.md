# ParkingUSA Constitution

## Core Principles

### I. Reference-First Engineering

Every implementation that touches parsing, OSM conversion, street-parking normalization, workers, map layers, GeoJSON APIs, PostGIS models, or tile generation must inspect `Referenss/` first.

The preferred order is:

1. Port ready code when license and architecture allow it.
2. Adapt ready code into the ParkingUSA schema and APIs.
3. Use native or GPL tools as external Docker/CLI services.
4. Write new code only when no reference module fits.

When new code is written in an area covered by `Referenss/`, the plan or implementation notes must explain why the reference code was not suitable.

### II. Provenance Is Product Behavior

ParkingUSA is a source-aware data platform. Every imported or derived parking record must preserve source identity, raw properties, confidence, freshness, and geometry provenance.

Required record fields:

- `source_name`
- `source_id`
- `raw_properties`
- `confidence`
- `last_verified_at`
- `data_as_of`
- geometry quality/provenance notes where available

### III. API Compatibility First

The current frontend contract remains stable while the backend evolves.

The following endpoints must stay compatible:

- `GET /api/stats`
- `GET /api/facilities`
- `GET /api/geojson/[layer]`

GeoJSON-compatible responses must remain available during the migration from fixtures to PostGIS-backed reads.

### IV. Idempotent Data Ingestion

Importers must be repeatable. Re-running an importer must not create duplicate records or silently overwrite higher-quality provenance.

For San Francisco baseline data, preserve these counts unless intentionally changing ingestion:

- 33,511 meter facilities
- 2,889 curb segments
- 403 OSM zones

### V. Scalable Map Path

MapLibre remains the frontend map engine. Large layers should move toward Martin and Tippecanoe-backed vector tiles instead of shipping oversized GeoJSON payloads to the browser.

Small GeoJSON fixtures are allowed for MVP, debugging, test fixtures, and fallback behavior.

## Technology Constraints

- Frontend: Next.js, React, MapLibre GL JS.
- Backend: PostGIS as the primary storage target, Prisma as the application ORM.
- OSM conversion: use `osmtogeojson` for Overpass JSON/XML.
- OSM PBF imports: use external `osm2pgsql`; do not copy GPL/C++ code into the app.
- Vector tiles: use Martin for serving and Tippecanoe for static tile builds.
- Street-parking normalization: use the ported `osm-tag-updater` logic and tests.

## Development Workflow

Plans and implementation notes must:

- identify affected data layers and API contracts;
- list which `Referenss/` modules were inspected;
- define verification commands before implementation;
- preserve existing frontend behavior unless a change is explicit;
- update `THIRD_PARTY_NOTICES.md` when code is ported or adapted.

Required checks:

- after app changes: `npm run build`;
- after street-parking normalization changes: `npm run test:street-parking`;
- after import changes: verify idempotency and San Francisco baseline counts;
- after frontend/map changes: verify MapLibre canvas, layer counters, and selected-record detail behavior.

## Governance

This constitution governs Spec Kit planning for ParkingUSA. `AGENTS.md` is the operational agent instruction file and should point to the current plan or roadmap when one exists.

Amendments must update:

- `.specify/memory/constitution.md`;
- `AGENTS.md` when operational instructions change;
- `REFERENCE_REPOS.md` when reference repository policy changes;
- `THIRD_PARTY_NOTICES.md` when provenance or licensing notes change.

**Version**: 1.0.0 | **Ratified**: 2026-06-10 | **Last Amended**: 2026-06-10

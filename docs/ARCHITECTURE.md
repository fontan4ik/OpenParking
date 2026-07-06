# ParkingUSA Architecture

Date: 2026-06-08

ParkingUSA is a full-stack parking data platform built around source-aware ingestion, PostGIS storage, Prisma application access, and MapLibre visualization. The current San Francisco proof of concept remains the working frontend shell while the backend moves from file fixtures toward durable database-backed ingestion.

## Architecture Direction

The target system keeps the current public API surface stable while replacing ad hoc data loading with a provenance-preserving data pipeline.

```text
City / OSM / operator sources
   -> deterministic importers and external tools
   -> candidate coverage baseline + normalized ParkingUSA records
   -> pricing/rules enrichment and missing-data queue
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
- `GET /api/parking-index`
- `GET /api/geojson/[layer]`
- `POST /api/route`

API behavior:

- Read OSM/Geofabrik baseline records from PostGIS first when database records are available.
- Merge official/source-specific fixtures as enrichment and fallback instead of letting DB mode hide those stronger records.
- Fall back to `data/*.geojson` fixtures while database work stabilizes or when `DATABASE_URL` is absent.
- Return GeoJSON-compatible responses for the existing frontend.
- Preserve layer counters and selected-feature details.
- Keep routing behind the ParkingUSA API boundary: the frontend posts route requests to same-origin `POST /api/route`, and the server calls Valhalla via `VALHALLA_URL`. The routing MVP accepts finite lat/lon start/destination coordinates, supports `costing: "auto"` only, caps direct distance at 100 km, times out provider calls after 5 seconds, and returns a GeoJSON `LineString` with Valhalla/OpenStreetMap attribution. The same endpoint serves selected-parking navigation from map-picked/geolocation/manual starts, map-picked point-to-point routes, and current-location to clicked-destination routes; the browser must not call Valhalla directly or persist route/location history.

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
- Google Maps/Places is not a master ingestion source. It may be used only for discovery, matching, manual QA, and permitted identifiers such as `place_id`; long-lived ParkingUSA records must come from storable sources such as official data, OSM/Overture, operator/partner feeds, user evidence, or manual verification.
- Ingestion must keep parking existence separate from price/rule enrichment. A candidate facility can be map-visible with unknown pricing, low confidence, and a missing-data task rather than being hidden until tariffs are known.
- The application should expose one internal source of truth: the ParkingUSA canonical database, surfaced through `GET /api/parking-index` as the single canonical coverage feed. For initial nationwide existence coverage, OSM/Geofabrik is the primary baseline source and Overture is the preferred cross-check/enrichment baseline. Official city/authority data, operator pages/APIs, payment providers, partner feeds, browser/manual evidence, and user reports update individual facts on top of that baseline rather than replacing the whole system with another external master.
- User-submitted tariffs, rules, photos, payment links, and comments are source observations. They should enter moderation/review with evidence, confidence, and timestamps before changing canonical price/rule fields.
- Current implementation: the map detail panel posts suggestions to `POST /api/observations`, which stores `SourceObservation(entityType = user_report, sourceName = User Report, confidence = 0.35)` with `rawProperties.status = pending_review`. This preserves evidence without silently overwriting verified canonical facts.
- Planned DEV-52 field evidence flow is documented in `docs/USER_FIELD_EVIDENCE_INGESTION_FLOW_RU.md`: photo/screenshot/voice/map-point/text inputs should become `SourceObservation` or correction candidates first, pass OCR/metadata/transcript/manual review, and only then update canonical `ParkingFacility`, `CurbSegment`, or `ParkingZone` fields plus confidence. The first implementation slice should extend the existing `/api/observations` contract before adding binary upload, review UI, or promotion APIs.
- Miami Beach official WPGMZA/ArcGIS records with ParkMobile zones are enriched with payment-provider evidence (`ParkMobile / PayByPhone`) and an official PayByPhone Miami Beach app URL. This is deliberately separate from `payment_url`: ParkingUSA does not infer per-record checkout URLs from a provider/zone unless the upstream source provides a stable checkout/payment URL for that exact record.

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

The canonical map layer should be coverage-first: show the broadest legally storable candidate inventory, then expose enrichment status per object. The API/frontend should be able to distinguish at least:

- `exists_known`: the parking object is known from one or more sources;
- `price_known`: hourly/daily/monthly/event price is known for at least one scenario;
- `rules_known`: hours, restrictions, access, or curb rules are known;
- `needs_enrichment`: price/rules/source conflict/staleness require research or review.

Current implementation: `loadParkingIndex()` combines facilities, curb segments, and parking zones into one GeoJSON feed at `/api/parking-index`. Each feature receives `parkingusa_id`, `parkingusa_layer`, `existence_status`, `price_status`, `rule_status`, `needs_enrichment`, and `canonical_source = ParkingUSA Parking Index`. For `city=miami`, the loader reads DB scope `Miami + Miami-Dade` so OpenStreetMap/Geofabrik parking candidates, including Miami Beach `P` icon candidates, become ParkingUSA features. Miami Beach ArcGIS has a DB canonical import path for official meters, lot centroids, lot polygons, and residential/regulatory parking-zone polygons. Layer 7 `Parking Zones` records are road-side residential/rule areas, not filled parking availability polygons: `data-loader.ts` converts those polygons into `curb_segment` line features for `/api/geojson/segments`, preserves the residential/rule metadata, and excludes them from `/api/geojson/zones`. The default frontend display renders curb/road-side lines, parking points, and real parking-area polygons/lots; the explicit `all` display mode renders all three visual layer types together. Curb segment rendering is line-only: official parking-space points are filtered out when they fall inside a parking lot/garage polygon, then remaining street-side points are grouped into straight curb-row `LineString` features. If an upstream or legacy row for a street parking space arrives as a Polygon/MultiPolygon, `data-loader.ts` excludes it from the zone endpoint and derives a LineString/MultiLineString from the long axis before exposing it through `/api/geojson/segments`. Official fixtures are still merged as enrichment/fallback when DB rows are unavailable. Legacy layer endpoints remain for compatibility and map rendering.
UX implication: unknown-price records stay visible. The map should look like a complete parking search layer, while the detail panel tells the truth about which facts are known, unknown, user-suggested, stale, or verified. This turns incomplete parking records into an enrichment queue instead of hiding them from users.

Semantic taxonomy decision: see `docs/data_taxonomy_parking_semantics_DEV-48.md`. Future schema/API work should not treat `ParkingZone` or `parkingusa_layer=parking_zone` as proof of a physical parking place. Canonical records should carry explicit semantic fields such as `entity_kind`, `geometry_role`, `display_layer`, `parking_availability_semantics`, `regulation_kind`, and `semantic_confidence`, while preserving the existing provenance and quality contract.

Geometry quality / snapping decision: see `docs/ROAD_CURB_ENTRANCE_SNAPPING_HEURISTICS_DEV_55.md` and `data/research/road-curb-entrance-snapping-dev55.json`. Future importer/normalizer work should treat road matching, side-of-street assignment, curb offset, linear-reference cuts, driveway/loading/valet/no-parking conflicts, parking-lot interior filtering, and garage entrance association as explicit provenance-bearing steps. Source confidence, semantic confidence, geometry confidence, and default-layer `offer_confidence` must remain separate so official evidence does not automatically become a verified driver-facing parking offer.

Public metrics are record completeness/provenance coverage indicators, not deduped real-world coverage.

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
| `price_status` / `rule_status` | Whether pricing and rules are known, unknown, stale, conflicting, or review-needed. |
| `matched_place_id` | Optional Google/third-party matching identifier when policy permits; never the canonical source by itself. |

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

# Third-Party Notices

Date: 2026-06-08

This project intentionally reuses and adapts open-source building blocks from `Referenss/`.

## Ported Or Adapted Code

### OSM Tag Updater

- Source repository: `Referenss/osm-tag-updater`
- Source paths:
  - `src/components/Tool/transpose`
  - `src/components/Tool/utils`
- License: MIT
- Destination paths:
  - `lib/street-parking/osm-tag-updater/transpose`
  - `lib/street-parking/osm-tag-updater/utils`
  - `lib/street-parking/index.ts`
- Adaptation summary: direct port of the street-parking tag transposition logic and utilities, plus a ParkingUSA wrapper that accepts OSM tag objects and returns normalized street-parking facts.

## Referenced Tools And Services

- PNNL Dynamic Curb Allocation Application (`Referenss/parking`) - backend architecture, Prisma/PostGIS patterns, worker services, GeoJSON API ideas.
- OSM Tag Updater (`Referenss/osm-tag-updater`) - planned direct port for street-parking tag normalization.
- osmtogeojson (`Referenss/osmtogeojson`) - OSM/Overpass conversion dependency.
- osm2pgsql (`Referenss/osm2pgsql`) - external OSM PBF to PostGIS tool.
- Martin (`Referenss/martin`) - external vector tile server.
- Tippecanoe (`Referenss/tippecanoe`) - external MBTiles/PMTiles builder.
- A/B Street (`Referenss/abstreet`) - parking-lot and street-parking algorithms/workflows reference.
- Valhalla - external routing engine used behind server-side `POST /api/route`; keep routing service calls outside browser code and preserve OpenStreetMap attribution in route responses/UI.
- OpenStreetMap contributors - basemap data and routing graph data attribution for MapLibre/Valhalla-backed routing.

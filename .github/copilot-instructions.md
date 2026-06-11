# ParkingUSA Copilot Instructions

Follow `AGENTS.md` as the authoritative project instruction file.

## Core Guidance

- ParkingUSA is a Next.js, React, MapLibre, Prisma, and PostGIS parking data platform.
- Reuse `Referenss/` before suggesting new parser, importer, OSM, map-layer, tile, worker, or PostGIS code.
- Preserve source provenance fields on imported data.
- Keep `/api/stats`, `/api/facilities`, and `/api/geojson/[layer]` compatible.
- Do not suggest Google Maps scraping as the master database.
- Do not replace MapLibre with Mapbox GL v1.
- Do not copy GPL/native tool code into application source.

## Preferred Patterns

- Use `osmtogeojson` for OSM/Overpass JSON/XML to GeoJSON conversion.
- Use external `osm2pgsql` for OSM PBF to PostGIS imports.
- Use Martin and Tippecanoe for scalable vector tile paths.
- Use the ported `osm-tag-updater` module for street-parking tag normalization.

## Verification

After app changes, run:

```powershell
npm run build
```

After street-parking normalization changes, run:

```powershell
npm run test:street-parking
```

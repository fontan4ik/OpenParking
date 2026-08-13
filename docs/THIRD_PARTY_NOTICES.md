# Third-Party Notices

Date: 2026-08-10

This project intentionally reuses and adapts open-source building blocks from `Referenss/` and from the public Magic UI and shadcn/ui component registries.

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

### Magic UI (Design pass 2026-08-10)

- Source registry: https://magicui.design/r/registry.json (MIT)
- Adapted components (no new npm dependency; CSS + ARIA-correct reimplementations):
  - `bento-grid` → `apps/frontend/components/landing/magic/MagicBentoGrid.tsx`
  - `marquee` → `apps/frontend/components/landing/magic/MagicMarquee.tsx`
  - `number-ticker` → `apps/frontend/components/landing/magic/MagicNumberTicker.tsx`
  - `hyper-text` → `apps/frontend/components/landing/magic/MagicHyperText.tsx`
  - `border-beam` → `apps/frontend/components/landing/magic/MagicBorderBeam.tsx`
- License: MIT (https://github.com/magicuidesign/magicui)
- Adaptation summary: ports preserve the public visual behavior but use only CSS keyframes, IntersectionObserver, and rAF (no framer-motion / motion runtime dependency required by Magic UI's original source).

### Quaternius Cars Bundle (optional asset)

- Source: https://poly.pizza/bundle/Cars-Bundle-FE5IWe6OMk
- License: CC0 Public Domain 1.0 (no attribution required)
- Status: the landing hero now uses procedural React Three Fiber/drei geometry in `apps/frontend/components/landing/Car3D.tsx`; no external vehicle model or downloaded GLB is bundled. The 3D dependencies are listed in the root package manifest and remain replaceable by a separately licensed GLB in a future change.

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
- shadcn/ui - design system primitive contract reference (button/card/tabs/sheet/dialog/badge/separator patterns). Components referenced for design intent only; no shadcn code is bundled in `apps/frontend/`. License: MIT (https://github.com/shadcn-ui/ui).
- Motion (formerly Framer Motion) - design-intent reference for the Magic UI component source patterns. Not bundled; CSS keyframes / rAF used instead. License: MIT (https://github.com/motiondivision/motion).
- Tailwind CSS v4 - OKLCH + `@custom-variant dark` token convention referenced for the dark palette. License: MIT (https://github.com/tailwindlabs/tailwindcss). Tailwind is not bundled; the project uses hand-written CSS in `apps/frontend/app/globals.css`.
- tweakcn.com - visual theme editor referenced for OKLCH ramps. License: open source (https://github.com/jnsahaj/tweakcn). Not bundled; only used as a design source.

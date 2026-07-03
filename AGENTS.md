# AGENTS.md - ParkingUSA Agent Instructions

## Project Mission

ParkingUSA is our own parking data platform built from proven open-source building blocks in `Referenss/`.

The product goal is a comprehensive US parking data layer with:
- facilities, garages, lots, meters, curb segments, and parking zones;
- prices, rules, availability signals, freshness, confidence, and provenance;
- MapLibre frontend;
- PostGIS/Prisma backend;
- scalable vector-tile path.

## Documentation Source of Truth

`docs/PROJECT_OVERVIEW_RU.md` is the primary product and architecture source of truth. Read it before any non-trivial product, data, API, UI, backend, ingestion, parser, or roadmap work.

Use the documentation set like this:

- `docs/PROJECT_OVERVIEW_RU.md` - main project context: what ParkingUSA is, how current data/API works, known sources, source/payment link requirements, and the next data-quality gaps.
- `docs/README.md` - documentation index and quick orientation. Update it when adding, renaming, removing, or changing the role of a major document.
- `docs/ROADMAP.md` - implementation roadmap and current priorities. Update it when scope, sequencing, milestones, or acceptance criteria change.
- `docs/ARCHITECTURE.md` - target architecture and system boundaries. Update it when data flow, API shape, storage, services, tiling, or deployment architecture changes.
- `docs/REFERENCE_REPOS.md` - how to use `Referenss/`. Update it when new reference repos are added or reuse guidance changes.
- `docs/THIRD_PARTY_NOTICES.md` - licenses and provenance for reused code/tools. Update it whenever porting code, adding a dependency, or relying on a new external tool/source with licensing implications.
- `docs/INTEGRATION_USAGE_GUIDE.md` - local operational commands. Update it when scripts, environment variables, setup steps, import flows, or verification commands change.
- `docs/parking_full_data_strategy.md` and `docs/parking_data_collection_plan.md` - deeper research/planning notes. Keep them consistent when changing source strategy, collection workflows, schema concepts, or coverage methodology.
- `data/research/*.json` - machine-readable source manifests and evidence. Update or regenerate these when source URLs, API URLs, parser specs, evidence, connector recommendations, legal risk, confidence, or ingestion status changes.

After any meaningful code or data change, update docs in the same change when the user-facing or operator-facing truth changed. Do not leave documentation stale for:

- new, renamed, removed, or behavior-changing API endpoints;
- Prisma schema/model changes;
- new data files, changed baseline counts, or changed layer semantics;
- new source URLs, API URLs, payment URLs, booking URLs, evidence files, or source confidence rules;
- new import/parser/research/tile scripts or changed command names;
- frontend behavior that changes map layers, filters, detail panels, source display, payment links, or user contribution workflows;
- architecture decisions about PostGIS, vector tiles, OSM, reference repos, fallback files, or external services.

When updating documentation:

1. Start with `docs/PROJECT_OVERVIEW_RU.md` if the change affects project truth.
2. Update the specific supporting doc for the changed area.
3. Update `docs/README.md` if navigation changed.
4. Update companion agent files only when their discoverability instructions become wrong or conflict with `AGENTS.md`.
5. In the final response, mention which docs changed and what context was preserved.

## Golden Rule: Reuse First

Before writing new code for parsing, OSM conversion, street-parking normalization, workers, map layers, GeoJSON APIs, PostGIS models, or tile generation, inspect `Referenss/`.

Prefer this order:
1. Port ready code from `Referenss/` when license and architecture allow it.
2. Adapt ready code into our schema/API.
3. Use native/GPL tools as external Docker/CLI services.
4. Only write new code when no reference module fits.

If writing from scratch, explain why the available reference code was not suitable.

## Execution Stability

Do not launch background subagents or `task(... run_in_background=true)` batches unless the user explicitly asks for parallel background work. Prefer foreground tasks or direct repository inspection for normal planning, research, and implementation. If background work is genuinely needed, launch one background task at a time, wait for its completion notification, collect it with `background_output`, and only then continue or start another. Avoid leaving parent sessions waiting on active background tasks, because interrupted parent runs can surface as `terminated` in OpenCode.

## Reference Repo Usage

### `Referenss/parking`

Primary backend reference.

Use for:
- Prisma/PostGIS patterns;
- `Space`, `Occupancy`, `Prediction` model ideas;
- service scheduler pattern from `app/src/services`;
- GeoJSON API/export pattern from `app/src/pages/api/spaces/[param].ts`;
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

Use it for old `parking:lane:*` and `parking:condition:*` tags and new `parking:left/right/both` schema handling.

### `Referenss/osmtogeojson`

Use for OSM/Overpass JSON or XML to GeoJSON conversion.

Do not maintain a custom OSM polygon/relation parser when this library can handle:
- ways;
- nodes;
- relations;
- multipolygons;
- tainted/incomplete geometry flags.

### `Referenss/osm2pgsql`

Use as an external production import tool for OSM PBF into PostGIS.

Do not copy GPL/C++ code into the app. Invoke via Docker/CLI and keep our application code separate.

### `Referenss/martin`

Use as the vector tile server for:
- PostGIS tables;
- MBTiles;
- PMTiles.

Prefer Martin for scalable map layers instead of shipping huge GeoJSON to the browser.

### `Referenss/tippecanoe`

Use as an external tile build tool for static large layers:
- GeoJSON -> MBTiles/PMTiles;
- city/state/nationwide layers;
- archival or heavy read-only datasets.

### `Referenss/abstreet`

Use as algorithm/reference material for:
- OSM parking lot extraction;
- service roads / parking aisles;
- capacity heuristics;
- street-parking mapper workflows.

Do not port the Rust app wholesale.

## Architecture Direction

Repository layout:
- `apps/frontend/` is the Next.js website/frontend. Keep `app/`, `components/`, frontend-local `lib/`, `next.config.js`, and web-only assets here.
- `apps/backend/` is the shared backend workspace for both the website and future mobile app. Keep Prisma, parsers, importers, research jobs, normalization jobs, and tile scripts here.
- `apps/backend/prisma/` is the Prisma/PostGIS schema and migration home.
- `apps/backend/scripts/` is the home for data import, parser, research, normalization, and tile scripts.
- `apps/mobile/` is reserved for the future mobile app. Keep mobile-only `src/`, `assets/`, and mobile tests there.
- `data/` remains shared root data: GeoJSON fixtures, research data, import outputs, and fallback API inputs.
- `tests/` contains project tests. Tests may import frontend code through the `@/` alias.
- `docs/` contains project documentation and research notes.
- `logs/` contains runtime and dev-server logs.
- Do not recreate root-level `app/`, `components/`, `lib/`, `scripts/`, or `prisma/`; use the app folders above.

Frontend:
- Next.js;
- React;
- MapLibre GL JS;
- current full-screen map UI remains the working shell.
- run with `npm run dev` or `npm run frontend:dev`;
- build with `npm run build` or `npm run frontend:build`.

Backend:
- PostGIS is the primary storage target;
- Prisma is the application ORM;
- current GeoJSON files in `data/` remain fixtures and fallback.
- Prisma commands use `apps/backend/prisma/schema.prisma`;
- backend scripts run from `apps/backend/scripts/` via root `npm run ...` commands.

Public API compatibility:
- keep `/api/stats`;
- keep `/api/facilities`;
- keep `/api/geojson/[layer]`;
- keep `/api/observations`;
- keep GeoJSON-compatible responses for current frontend.

Data quality is mandatory. Every imported record should preserve:
- `source_name`;
- `source_id`;
- `source_url` when known;
- `api_url` when known;
- `payment_url` / `booking_url` when known;
- `raw_properties`;
- `confidence`;
- `last_verified_at`;
- `data_as_of`;
- evidence URL/file when available;
- geometry quality/provenance.

## Project Work Protocol

Before implementation:

- Read `docs/PROJECT_OVERVIEW_RU.md` for product intent and current system truth.
- Inspect relevant existing code and `Referenss/` before creating new parsing, import, OSM, API, map, PostGIS, or tile logic.
- Identify whether the current path should use file fallback, PostGIS/Prisma, or both.

During implementation:

- Keep the current layout: frontend in `apps/frontend/`, backend/import/research/prisma in `apps/backend/`, shared fixtures and research outputs in `data/`.
- Preserve public API compatibility unless the user explicitly asks for a breaking change.
- Prefer idempotent import/upsert behavior for data scripts.
- Preserve provenance fields and raw source payloads when transforming data.
- Treat source/payment/booking/evidence links as first-class data, not UI decoration.
- For uncertain or non-official sources, store confidence, legal risk, evidence, and review status rather than presenting them as authoritative.
- Keep San Francisco file fallback working while DB-backed ingestion stabilizes.

Before finishing:

- Run the smallest meaningful verification for the changed area.
- For app changes, run `npm run build` unless impossible; for shared TypeScript/library changes, also run `npm test` or focused tests.
- For backend/Prisma changes, run `npm run db:generate` and an affected dry-run/fixture command when available.
- For data import changes, verify repeated import behavior and baseline counts unless intentionally changing them.
- For map changes, verify MapLibre canvas render, layer counters, and detail panel behavior when the dev server is already healthy or can be started quickly.
- Do not let verification hang on flaky dev-server/browser loops. If a dev server or browser check does not become useful within a short bounded attempt, stop every process you started, record the limitation, and fall back to deterministic checks such as
pm run build,
pm test, focused unit tests, HTTP status checks, or code-level root-cause verification.
- Always stop temporary dev/start server processes before finishing unless the user explicitly asked to keep them running.
- Check whether documentation needs updates under the Documentation Source of Truth rules above.

## Companion Agent Files

`AGENTS.md` is the authoritative repository instruction file. Companion files exist only to help different tools discover the same rules:

- `CODEX.md` - Codex-specific operating guide.
- `CLAUDE.md` - Claude-compatible entry point.
- `GEMINI.md` - Gemini-compatible entry point.
- `.github/copilot-instructions.md` - GitHub Copilot instructions.
- `.cursor/rules/parkingusa.mdc` - Cursor rules.

If any companion file appears to conflict with this file, follow `AGENTS.md` and update the companion file.

## Implementation Order

1. Document architecture and third-party provenance.
2. Port PNNL backend foundation into our app.
3. Import current SF GeoJSON data into PostGIS-compatible schema.
4. Keep file fallback while DB work stabilizes.
5. Port `osm-tag-updater` normalization module and tests.
6. Replace custom OSM parsing with `osmtogeojson`.
7. Add `osm2pgsql`, Martin, and Tippecanoe as external services/jobs.
8. Add A/B Street-derived heuristics after base ingestion is stable.

## Testing Rules

After app changes:
- run `npm run build`.
- run `npm test` when TypeScript/library behavior or imports move.

After backend/Prisma changes:
- run `npm run db:generate`;
- run affected import/parser/normalization command in dry-run or fixture mode when available.

For data import changes:
- repeated import must not create duplicates;
- preserve current SF baseline unless intentionally changing ingestion:
  - `33,511` meter facilities;
  - `2,889` curb segments;
  - `403` OSM zones.

For frontend/map changes:
- verify MapLibre canvas renders;
- verify layer counters display;
- verify detail panel opens for selected parking records.

For ported `osm-tag-updater` logic:
- port and run the original transpose/utils tests;
- add ParkingUSA wrapper tests around OSM tag objects.
- run `npm run test:street-parking`.

## Do Not

- Do not use Google Maps scraping as the master database.
- Do not replace MapLibre with PNNL's Mapbox GL v1.
- Do not copy GPL/native tool code into the app.
- Do not rewrite OSM multipolygon/relation handling manually.
- Do not delete or rewrite `Referenss/`; it is the local reference source library.
- Do not introduce a new abstraction before checking whether PNNL already has a usable pattern.
- Do not move website code back to root-level `app/`, `components/`, or `lib/`; it belongs in `apps/frontend/`.
- Do not move backend code back to root-level `scripts/` or `prisma/`; it belongs in `apps/backend/`.

<!-- SPECKIT START -->
For the current advanced roadmap and Spec Kit planning context, read:

- `docs/ROADMAP.md`
- `specs/001-system-agent-roadmap/plan.md`
<!-- SPECKIT END -->

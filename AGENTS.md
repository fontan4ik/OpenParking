# AGENTS.md - OpenParking Agent Instructions

## Project Mission

OpenParking (formerly ParkingUSA) is our parking data platform. Legacy `ParkingUSA` / `parkingusa` API fields and technical identifiers remain compatible until an explicit migration changes them.

The product goal is a comprehensive US parking data layer with:
- facilities, garages, lots, meters, curb segments, and parking zones;
- prices, rules, availability signals, freshness, confidence, and provenance;
- MapLibre frontend;
- PostGIS/Prisma backend;
- scalable vector-tile path.

## Documentation Source of Truth

`docs/PROJECT_OVERVIEW_RU.md` is the primary product and architecture source of truth. Read it before any non-trivial product, data, API, UI, backend, ingestion, parser, or roadmap work.

Use the documentation set like this:

- `docs/PROJECT_OVERVIEW_RU.md` - main project context: what OpenParking is, how current data/API works, known sources, source/payment link requirements, and the next data-quality gaps.
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
4. Update an existing companion agent file only when it is in task scope or its conflict would misdirect the current work.
5. In the final response, mention which docs changed and what context was preserved.

## Context And Documentation Efficiency

- For non-trivial work, read `docs/PROJECT_OVERVIEW_RU.md` once at the start of the task, then open only the task-specific supporting documents and code paths.
- Use `rg` / `rg --files` to locate the smallest relevant surface before reading large files or directories.
- Treat `docs/ROADMAP.md` as the only current priority checklist. Do not copy roadmap sequencing into this file.
- Do not update product documentation for agent-rule-only, formatting-only, or internal refactors when product/operator truth did not change.
- Do not rewrite unrelated stale documentation while completing a scoped task; report it separately unless it blocks correctness.

## Golden Rule: Reuse First

Before writing new parsing, OSM conversion, street-parking normalization, worker, GeoJSON API, PostGIS, or tile-generation logic, inspect the existing implementation and the relevant entry in `docs/REFERENCE_REPOS.md`.

The optional local `Referenss/` library is not present in every checkout. When it exists, inspect only the relevant repository. When it is absent, use `docs/REFERENCE_REPOS.md`, installed package/source documentation, and already ported in-repo code; record the limitation once and continue instead of blocking the task.

Prefer this order:
1. Port ready code from `Referenss/` when license and architecture allow it.
2. Adapt ready code into our schema/API.
3. Use native/GPL tools as external Docker/CLI services.
4. Only write new code when no reference module fits.

If writing a major covered subsystem from scratch, explain why the existing implementation, package dependency, or available reference code was not suitable.

## Execution Stability

- Do not launch subagents or background agent batches unless the user explicitly asks for delegation or parallel agent work.
- Parallelize independent local reads and deterministic checks when safe, but never run concurrent writers against the same files, database, generated artifact, or dev server.
- Keep network fetches, browser sessions, database imports, and long-running servers bounded. Reuse caches by default and stop every process started for verification.

## Development Fast Paths

- Inspect `package.json` and `docs/INTEGRATION_USAGE_GUIDE.md` before inventing a command. Prefer root `npm run ...` scripts so paths, Prisma schema selection, and runtime flags stay consistent.
- Trace behavior from the public boundary inward: route or UI event -> loader/service -> canonical transform -> fixture/database. This usually finds the owning contract faster than reading whole directories.
- Search for an existing field, endpoint, layer id, or source id before adding one. Extend the canonical path instead of creating a second representation.
- For large GeoJSON, PBF, caches, and research manifests, inspect metadata, counts, schemas, and small samples first. Do not print or parse an entire large artifact when a bounded query answers the question.
- Use file fallback for frontend/API work that does not require persistence. Require PostGIS only for schema, DB loader, canonical import/upsert, spatial-query, or migration behavior.
- Prefer cached/local deterministic inputs. Refresh Overpass, Geofabrik, browser evidence, or operator data only when freshness is part of the task or the cache is missing/incomplete.
- Start verification with the narrowest affected test or dry-run, then widen only when shared contracts changed. Do not use a full build as a substitute for a focused behavioral test.
- Keep one semantic change per patch where practical. Before finishing, inspect `git diff --stat`, the focused diff, and `git diff --check`; distinguish pre-existing user changes from task changes in the report.
- Never hand-edit generated Prisma clients, downloaded source payloads, caches, or derived reports. Change the source/script and regenerate only the artifacts required by the task.
- Put temporary evidence in the existing `artifacts/` or `logs/` locations, and do not add it to version control unless the task or QA protocol requires it.

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
- keep `/api/parking-index`;
- keep `/api/geojson/[layer]`;
- keep `/api/observations`;
- keep `POST /api/route`;
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

- Read `docs/PROJECT_OVERVIEW_RU.md` for product intent and current system truth, then route to the smallest relevant supporting doc/code surface.
- Check `git status` before editing. Preserve user changes and avoid unrelated files.
- Inspect relevant existing code and follow the Reuse First fallback above before creating new parsing, import, OSM, API, PostGIS, or tile logic.
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

- Use the Verification Matrix below and run the smallest deterministic checks that cover the changed behavior.
- For map/data/UI changes, tests and API checks are not enough: start the local app when possible, open it in a real browser, visually inspect the MapLibre map for the affected city/area, and attach screenshot evidence. If the user supplied screenshots/field examples, visually compare the implemented state against those exact examples before marking the task done.
- For Miami/South Beach/Ocean Drive/Collins/NYC parking-correctness work, explicitly verify the live map state: canvas render, layer counters, source/confidence/unknown states, detail panel behavior, and whether payment zones/curb rows/valet/no-parking/garage tariffs are visually represented honestly.
- Do not let verification hang on flaky dev-server/browser loops. If a dev server or browser check does not become useful within a short bounded attempt, stop every process you started, record the limitation, and fall back to deterministic checks such as npm run build, npm test, focused unit tests, HTTP status checks, or code-level root-cause verification; this fallback must be reported as non-visual verification, not as visual QA.
- Always stop temporary dev/start server processes before finishing unless the user explicitly asked to keep them running.
- Check whether documentation needs updates under the Documentation Source of Truth rules above.

### Miami Parking Geometry Correctness Protocol

For Miami/Miami Beach curb-line, parking-space-row, or street-parking correctness tasks, run deterministic geometry QA before trusting generated lines:

- Preferred command: `npm run audit:parking-geometry:miami:refresh` when the OSM road/building cache must be refreshed, otherwise `npm run audit:parking-geometry:miami`.
- The audit compares generated curb `LineString` features against cached OSM road centerlines, OSM building polygons, and local official parking-lot/garage polygons.
- A curb line is acceptable only when each consecutive vertex pair is parallel to the matched road within the configured angle threshold, offset from the road centerline, near the road, and not intersecting a building or parking-area interior.
- Generated curb segments are **multi-vertex polylines** that follow the matched road centerline, offset to the parking side. Every consecutive segment must satisfy the near-road, offset, and perpendicular parallelism guards against the matched road centerline. Segments that cannot honestly follow a road stay `needs_field_review` / reference overlay.
- Generated parking-space rows must be rotated around their midpoint to a shared axis for the matched named street before the final geometry audit. Fall back to the exact local road-segment orientation for unnamed roads or real bends over 12 degrees. Road matching near intersections must combine midpoint distance with an angular penalty so that a crossing street cannot win only because it is closer to one endpoint.
- A named-street shared axis must use only road segments within 300 meters of the official parking evidence. Automatic alignment must never move the curb midpoint more than 15 meters from the official source-point midpoint; fall back to rotation-only alignment when that guard would be exceeded.
- Lines that lack a road reference, are too far from a road, sit on the road centerline, or are not parallel must stay `needs_field_review` / reference overlay. Lines crossing buildings or parking-area interiors must be suppressed.
- Generated rows must split when adjacent official parking points are more than 18 meters apart. Any remaining curb line that crosses a non-parallel road centerline by more than 30 degrees must be suppressed so parking geometry cannot span an intersection, alley, or driveway represented as a road.
- This QA is token-cheap by design: Overpass is used only by the refresh/audit script, results are cached under `data/research/fetches/`, and all checks are local numeric geometry calculations, not LLM review.
- The audit report is `data/research/miami-parking-geometry-quality-report.json`; inspect `byStatus`, `byReason`, and `worst_examples` before claiming Miami curb correctness.
- Do not claim maximum Miami coverage unless the OSM cache metadata has `complete: true`, `failed_tiles: []`, and all configured tiles were fetched. Records that remain too far from or too close to a road must stay in review rather than being auto-snapped beyond the 15-meter guard.

## Companion Agent Files

`AGENTS.md` is the authoritative repository instruction file. Thin companion files may help other tools discover the same rules. In the current checkout the maintained entry points are:

- `.github/copilot-instructions.md` - GitHub Copilot instructions.
- `.cursor/rules/parkingusa.mdc` - Cursor rules; the legacy filename remains for compatibility.

If a companion file conflicts with this file, follow `AGENTS.md`. Update the companion only when it is part of the task scope or the conflict would misdirect the current work; do not assume that `CODEX.md`, `CLAUDE.md`, or `GEMINI.md` exists.

## Current Priorities

Use `docs/ROADMAP.md` for current status, sequencing, and acceptance gates. Use `specs/001-system-agent-roadmap/plan.md` only for historical context about the agent-roadmap setup; it is not the live product implementation order.

## Verification Matrix

After app changes:
- run `npm run build`;
- run `npm test` when TypeScript/library behavior or imports move.

After a focused logic change:
- run the narrowest relevant Vitest target first;
- run the full suite only when shared behavior, imports, or contracts could affect multiple areas.

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

For documentation-only or agent-rule-only changes:
- inspect links, paths, commands, and `git diff --check`;
- do not run the application build unless the documentation changes executable commands, generated artifacts, or runtime contracts.

## Frontend Visual QA Protocol

When the user asks to test, review, critique, or improve the frontend, act as an independent product/design QA reviewer, not as a friendly demo operator. Be picky about visual quality, layout, hierarchy, responsiveness, and trust in the data presentation.

Always test the live app in a real browser when possible. For the map app, cover at least:

- initial load and slow-load state: skeleton/spinner, loading copy, retry/error state, and whether the UI explains what is happening;
- desktop viewport around `1280x720`;
- mobile viewport around `390x844`;
- light and dark themes;
- English and Russian locales;
- `Find parking` and `Data quality` modes;
- city chips, reliability chips, advanced filters, search suggestions, search results, and clear/reset behavior;
- MapLibre canvas render, zoom controls, attribution, layer counters, visible markers/lines/polygons, and whether map data matches sidebar/list counters;
- facility card list, selected-card state, popup/detail panel, source/payment/booking/evidence links, long price/rule text, and close/back behavior;
- route panel controls: location button, pick start, pick destination, disabled/enabled route CTA, and offscreen/overlap behavior.

During visual QA, explicitly look for:

- text clipped, hidden, overlapping, too small, too low contrast, or visually de-emphasized when it is important;
- horizontal overflow, offscreen chips/buttons, broken bottom sheets, unscrollable content, or controls hidden below the viewport;
- inconsistent counts such as dataset total vs visible map vs current list;
- technical/raw data values shown to drivers without friendly labels, for example `yes`, `parking_space`, `surface_lot`, or `known_priced`;
- decorative effects that hurt utility, such as excessive blur, glow, glass, animation, shadows, or one-note color treatment;
- theme mismatches where a light panel appears inside dark mode or dark text appears on a dark background;
- focus rings, hover states, active states, disabled states, and selected states that look like bugs or are too subtle;
- loading states that can be mistaken for a frozen app;
- data-confidence UI that overstates uncertain/OSM/operator-derived records.

For every frontend QA report, organize findings by severity:

- `P0` blocks core use, such as app/runtime error, map not rendering, unusable mobile layout, or unreadable detail panel.
- `P1` misleads or seriously slows users, such as wrong counters, broken mode switching, missing error state, or clipped primary controls.
- `P2` is polish but still actionable, such as weak spacing, noisy decoration, inconsistent labels, or awkward focus styling.

When suggesting visual improvements, be concrete. Do not say only "look at Uiverse" or "make it nicer". Name the exact pattern and where it applies, for example:

- search input with left search icon, inline clear button, and compact suggestions;
- segmented control with sliding active background for `Find parking` / `Data quality`;
- horizontal scroll chip row with edge fade for city/reliability filters on mobile;
- map skeleton loader with pulsing marker dots and per-layer status instead of a full blur spinner;
- compact alert cards for `Needs review` and `Conflicts`;
- bottom-sheet filter drawer for mobile map workflows;
- theme-safe detail panel with explicit foreground/background tokens and strong price emphasis.

Reference inspiration sites such as `https://uiverse.io` only as a source of concrete components/patterns. Adapt them to a restrained GIS/productivity interface: prioritize readability, density, predictable controls, and honest data states over decorative novelty.

For ported `osm-tag-updater` logic:
- port and run the original transpose/utils tests;
- add OpenParking wrapper tests around OSM tag objects while preserving legacy `ParkingUSA` identifiers where required.
- run `npm run test:street-parking`.

## Do Not

- Do not use Google Maps scraping as the master database.
- Do not replace MapLibre with PNNL's Mapbox GL v1.
- Do not copy GPL/native tool code into the app.
- Do not rewrite OSM multipolygon/relation handling manually.
- When an optional `Referenss/` directory is present, do not delete or rewrite it; treat it as read-only reference material.
- Do not introduce a new abstraction before checking the existing code and, when available, the relevant documented reference pattern.
- Do not move website code back to root-level `app/`, `components/`, or `lib/`; it belongs in `apps/frontend/`.
- Do not move backend code back to root-level `scripts/` or `prisma/`; it belongs in `apps/backend/`.

<!-- SPECKIT START -->
For the current roadmap, read:

- `docs/ROADMAP.md`

For historical Spec Kit context about agent-file setup only, read `specs/001-system-agent-roadmap/plan.md`.
<!-- SPECKIT END -->

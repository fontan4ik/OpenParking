# ParkingUSA Advanced Roadmap

Date: 2026-06-15

This roadmap is the working checklist for moving ParkingUSA from city seed fixtures to a scalable, provenance-aware US parking data platform. Miami is now the default app seed; San Francisco remains the benchmark fixture set.

## Status Legend

- `[x]` Done or already established.
- `[~]` In progress or partially established.
- `[ ]` Not started.

## Phase 0 - System Documentation And Agent Readiness

- [x] Normalize core Markdown into English technical documentation.
- [x] Keep `AGENTS.md` as the authoritative agent instruction file.
- [x] Add companion agent files:
  - [x] `CODEX.md`
  - [x] `CLAUDE.md`
  - [x] `GEMINI.md`
  - [x] `.github/copilot-instructions.md`
  - [x] `.cursor/rules/parkingusa.mdc`
- [x] Replace the placeholder Spec Kit constitution with ParkingUSA rules.
- [x] Create Spec Kit planning artifacts under `specs/001-system-agent-roadmap/`.
- [ ] Add a lightweight documentation lint/check script for broken links and stale roadmap references.
- [ ] Add a short contributor onboarding section to `README.md`.

Definition of done:

- [x] Agent-facing files point back to `AGENTS.md`.
- [x] The roadmap is linked from `AGENTS.md`.
- [x] Reuse-first and provenance rules are repeated in all agent entry points.

## Phase 1 - Backend Foundation

- [~] Keep current public API routes compatible:
  - [x] `/api/stats`
  - [x] `/api/facilities`
  - [x] `/api/geojson/[layer]`
- [~] Maintain GeoJSON fixture fallback while PostGIS stabilizes.
- [~] Keep fallback selection city-aware:
  - [x] Miami seed facilities
  - [x] San Francisco benchmark layers
  - [ ] DB-backed city filtering for zones/curbs after city fields are added to those models
- [ ] Audit `Referenss/parking` Prisma/PostGIS patterns before further schema changes.
- [~] Align ParkingUSA Prisma schema with source-aware entities:
  - [x] `DataSource`
  - [x] `SourceObservation`
  - [x] `ParkingFacility` provenance/status fields
  - [x] `CurbSegment` provenance/status fields
  - [x] `ParkingZone` provenance/status fields
  - [ ] rate/rule/availability supporting models
- [ ] Add migration notes for geometry indexes and PostGIS extensions.
- [~] Add idempotent upsert strategy for each source layer:
  - [x] SF fixture import path
  - [x] OSM/Geofabrik raw-to-canonical normalizer
  - [~] Socrata/ArcGIS/CKAN canonical upsert promotion after geometry/layer dry-run mapping
    - [x] Miami Beach ArcGIS import mode writes canonical `ParkingFacility` and `ParkingZone` rows for layers 1/5/7
    - [ ] Socrata benchmark canonical upsert
    - [ ] CKAN and generic ArcGIS canonical upsert targets

Gate checks:

- [ ] `npm run build`
- [ ] repeated imports do not create duplicates
- [ ] San Francisco baseline counts remain stable unless intentionally changed

## Phase 2 - San Francisco Data Stabilization

- [~] Preserve San Francisco fixture baseline:
  - [x] 33,511 meter facilities target documented
  - [x] 2,889 curb segments target documented
  - [x] 403 OSM zones target documented
- [ ] Add a baseline verification command.
- [~] Store import run summaries with source name, run time, row counts, and duplicate counts; `ImportRun` exists and connector foundation records dry-run/import counts, but canonical importer coverage is not complete.
- [ ] Add regression fixtures for:
  - [ ] DataSF meters
  - [ ] derived curb segments
  - [ ] OSM parking zones
- [ ] Validate geometry quality and provenance fields for all imported records.

Gate checks:

- [ ] baseline command reports the expected counts
- [ ] import command can be run twice without count drift
- [ ] API responses remain GeoJSON-compatible

## Phase 3 - Street-Parking Normalization

- [x] Port `osm-tag-updater` transpose/utils logic.
- [x] Add ParkingUSA wrapper around OSM tag objects.
- [ ] Confirm original transpose/utils tests are fully represented.
- [ ] Expand wrapper tests for:
  - [ ] old `parking:lane:*`
  - [ ] old `parking:condition:*`
  - [ ] new `parking:left/right/both`
  - [ ] missing/ambiguous side tags
  - [ ] conflicting tags
- [ ] Add normalized output examples to developer docs.
- [ ] Wire normalized facts into source observation records.

Gate checks:

- [ ] `npm run test:street-parking`
- [ ] `npm run build`

## Phase 4 - OSM Import Path

- [~] Use `osmtogeojson` dependency for Overpass JSON/XML conversion.
- [ ] Remove or quarantine any custom OSM polygon/relation parsing that duplicates `osmtogeojson`.
- [ ] Add explicit tainted/incomplete geometry handling.
- [ ] Add external `osm2pgsql` production import flow:
  - [ ] dry-run command documented
  - [ ] Docker/CLI path documented
  - [ ] generated table strategy documented
  - [ ] GPL separation documented
- [ ] Add OSM source provenance mapping for ways, nodes, and relations.

Gate checks:

- [ ] `npm run import:osm:sf`
- [ ] `npm run import:osm:sf:db`
- [ ] `npm run import:osm:pbf:dry-run`

## Phase 5 - Vector Tile Scale Path

- [~] Keep MapLibre as the frontend map engine.
- [~] Keep GeoJSON mode for MVP/debug.
- [ ] Add Martin configuration for PostGIS-backed layers.
- [ ] Add Tippecanoe profiles for static MBTiles/PMTiles:
  - [ ] city layer profile
  - [ ] state layer profile
  - [ ] nationwide layer profile
- [ ] Add tile build metadata:
  - [ ] input hash
  - [ ] source dataset version
  - [ ] build timestamp
  - [ ] layer count
- [ ] Add MapLibre source switching between GeoJSON fallback and vector tiles.

Gate checks:

- [ ] `npm run tiles:dry-run`
- [ ] `npm run tiles:build`
- [ ] visual check: map renders expected layers

## Phase 6 - Research Worker And Source Discovery

- [x] Use the fixed global research tool stack:
  - [x] Tavily `research/search/map/extract` for broad source discovery, site mapping, and page evidence extraction
  - [x] Browser and Chrome DevTools for dynamic operator sites, rendered DOM checks, network/API inspection, screenshots, and date/time price flows
    - [x] dynamic/browser-required sources are identified in parser specs
    - [x] first browser navigation pass completed for ParkChicago rates/hours with DOM snapshot, screenshot, and parser hints
    - [x] scale browser execution through repeatable Playwright/Browser runner backlog for all browser-required source classes
  - [x] local deterministic inspectors for Socrata, ArcGIS REST, CKAN/Data.gov, URL/PDF fetching, content hashing, and source scoring
    - [x] Socrata metadata/sample inspector: `apps/backend/scripts/inspect_socrata_source.ts`
    - [x] ArcGIS REST layer inspector: `apps/backend/scripts/inspect_arcgis_source.mjs`
    - [x] CKAN/Data.gov inspector: `apps/backend/scripts/inspect_ckan_source.mjs`
    - [x] URL/PDF fetcher with content hash: `apps/backend/scripts/fetch_research_url.mjs`
    - [x] source scoring in Socrata, ArcGIS, and CKAN inspectors
  - [x] repo/reference inspection via `rg`, local scripts, and `Referenss/` before building custom ingestion/parsing logic
  - [x] future Playwright crawler/extractor runner specified after the first public parser recipes are proven
  - [x] future AI phone/call workflow specified for high-value stale, conflicting, missing, valet, monthly, airport, venue, and event parking facts
- [x] Select `open_deep_research` as the primary architecture reference.
- [x] Keep GPT Researcher as secondary report/UI reference.
- [x] Build the ParkingUSA production researcher wrapper v0; deterministic inspectors, manifests, validation, parser specs, and persistence schema are in place.
- [x] Treat full US parking acquisition as the product mandate:
  - [x] include valet parking explicitly as a first-class facility type for restaurants, hotels, venues, airports, hospitals, and event locations
  - [x] track public, private/customer-only, valet-only, permit-only, monthly-only, event-only, and temporarily available lots separately
  - [x] measure completeness by source coverage, geographic coverage, facility count, price coverage, rule coverage, and last verification age
  - [x] maintain a missing-parking queue rather than accepting unknown coverage as complete
- [x] Run national parking coverage research before claiming US-wide completeness:
  - [x] define measurable coverage targets by layer: street meters, curb rules, garages, lots, valet, airport/event, monthly, EV, accessible, private/customer-only
  - [x] estimate current known coverage from local fixtures, OSM, city open data, operator networks, and marketplace/public sources
  - [x] build a source inventory for the top US metro areas and state DOT/municipal portals
    - [x] benchmark city inventory for San Francisco, New York City, Seattle, Los Angeles, and Chicago
    - [x] expand to top US metro areas and state DOT/municipal portals as a Phase 6 research seed queue
  - [x] classify acquisition paths as official API, open-data ETL, OSM/Overture import, partner/feed, public web parser, browser agent, AI call, user report, or human review
  - [x] document legal/ToS risk for every non-official source before automation
  - [x] identify where ParkingUSA must build custom acquisition logic because no reusable reference or public feed exists
- [x] Define ParkingUSA structured research output schema.
- [x] Add research task persistence:
  - [x] task type
  - [x] city/state
  - [x] target layer types
  - [x] evidence URLs
  - [x] confidence
  - [x] recommended connector
  - [x] temporary persistence through `SourceObservation(entityType = source_metadata)`
  - [x] dedicated `ResearchTask` / `ResearchFinding` tables in `apps/backend/prisma/schema.prisma`
- [x] Add deterministic source tools:
  - [x] Socrata metadata/sample inspector
  - [x] ArcGIS REST layer inspector
  - [x] CKAN dataset inspector
  - [x] URL/PDF fetcher with content hash
  - [x] source scoring
- [x] Add gap-filling research workflows:
  - [x] compare ParkingUSA inventory against OSM, city portals, operator pages, marketplace listings, and manual map samples
  - [x] create parser candidates for public operator, venue, airport, hotel, hospital, restaurant, university, and municipal pages that allow lawful/low-risk reuse
  - [x] write a parser logic spec for every source that requires parsing, including target URLs, crawl/search flow, selectors or network endpoints, fields to extract, pagination, date/time scenarios, evidence capture, refresh cadence, dedupe keys, and known risks
  - [x] use browser agents for dynamic pages, location search flows, date/time price scenarios, and valet/event parking pages where static fetch is insufficient
    - [x] browser-required recipes are identified
    - [x] actual browser execution completed for the first dynamic benchmark source: ParkChicago rates/hours
    - [x] scale actual browser execution plan for operator, valet, airport, venue, and event sources through `data/research/phase6-browser-runner-backlog-20260610.json`
  - [x] create partner/outreach targets for sources where scraping is risky or unstable
  - [x] create AI-call tasks only for high-value gaps, stale prices, conflicting facts, or unavailable monthly/event data
  - [x] persist screenshots, HTML/network metadata, transcripts, extracted facts, and confidence per observation as required evidence fields in parser specs; static HTML/content hashes are persisted for fetched pages
- [x] Benchmark first cities:
  - [x] San Francisco
  - [x] New York City
  - [x] Seattle
  - [x] Los Angeles
  - [x] Chicago
- [x] Generate benchmark city manifests:
  - [x] `data/research/cities/san-francisco.ca.json`
  - [x] `data/research/cities/new-york-city.ny.json`
  - [x] `data/research/cities/seattle.wa.json`
  - [x] `data/research/cities/los-angeles.ca.json`
  - [x] `data/research/cities/chicago.il.json`
- [x] Add research validation command: `npm run research:validate`.
- [x] Add Socrata benchmark inspection commands:
  - [x] `npm run research:inspect:socrata:sf`
  - [x] `npm run research:inspect:socrata:sf:db`
  - [x] `npm run research:inspect:socrata:benchmarks`
  - [x] `npm run research:inspect:socrata:benchmarks:db`
- [x] Add ArcGIS/CKAN/URL/gap workflow commands:
  - [x] `npm run research:inspect:arcgis`
  - [x] `npm run research:inspect:ckan`
  - [x] `npm run research:fetch:url`
  - [x] `npm run research:gap-workflows`
  - [x] `npm run research:phase6`

Gate checks:

- [x] research output includes direct URLs and API endpoints
- [x] research output explains where each parking layer comes from and exactly how to extract it, including parser specs for parser-required sources
  - [x] official Socrata/ArcGIS/API sources have extraction path and endpoints
  - [x] parser-required HTML/browser sources have parser specs before ingestion
- [x] findings map to `DataSource` and `SourceObservation`
- [x] evidence URLs are persisted or attached to the audit log
- [x] `npm run research:validate`
- [x] `npm run research:inspect:socrata:benchmarks:db`
- [x] `npm run research:phase6`

## Phase 7 - Frontend Product Workflow

- [x] Keep full-screen map shell.
- [ ] Verify MapLibre canvas rendering after major frontend changes.
- [x] Ensure layer counters remain visible and accurate.
- [x] Ensure selected parking records open a detail panel.
- [x] Add source/provenance display to detail panel.
- [x] Add freshness/confidence indicators.
- [~] Add layer filters:
  - [x] meters
  - [x] curb segments
  - [x] zones
  - [ ] garages/lots
  - [ ] availability/rates
- [x] Add data-quality filters:
  - [x] source
  - [x] confidence
  - [x] review-needed threshold
- [~] Add graceful empty/error/loading states for each layer.
- [~] Make coverage gaps visible as a first-class product workflow:
  - [x] show "known parking, unknown price" distinctly from "priced parking";
  - [x] add counters for total known facilities, price-known facilities, price-unknown facilities, and review-needed facilities;
  - [x] split provenance coverage from payment-link and booking-link completeness in stats/sidebar metrics;
  - [~] route unknown-price and stale-price records into a derived enrichment/review backlog report, not an assignment workflow.

Gate checks:

- [x] `npm run build`
- [ ] manual map QA passes
- [ ] no large GeoJSON payload regression for scalable layers

## Phase 8 - Multi-City Expansion

- [ ] Define city readiness score.
- [ ] Define a common coverage baseline per city that does not depend on Google as the master database:
  - [~] OSM/Geofabrik or Overture candidate inventory for garages/lots/parking polygons;
    - [x] optional mixed-geometry OSM fallback file is split into places, road-side lines, and zones by the frontend loader;
    - [~] production Geofabrik/osm2pgsql path for large city/state/national coverage;
      - [x] Florida Geofabrik PBF download and dry-run commands;
      - [x] osm2pgsql dry-run command works without `DATABASE_URL`;
      - [x] parking-focused osm2pgsql flex config creates `parking_points`, `parking_lines`, and `parking_polygons` raw tables;
      - [x] normalized extractor from `osm_raw` tables into ParkingUSA facilities/segments/zones;
      - [x] run full Florida PBF import against PostGIS and verify Miami bbox counts;
      - [x] add Miami-Dade/city boundary polygon filtering instead of bbox-only filtering;
      - [x] import Miami-Dade OSM baseline and make `city=miami` read DB scope `Miami + Miami-Dade` for ParkingUSA Index coverage;
  - [ ] official city/authority datasets for meters, municipal garages/lots, curb rules, and zones;
  - [ ] operator/venue/airport/university/hospital source inventory for enrichment;
  - [ ] optional Google Places `place_id` matching/manual QA path with no long-lived cached Places content as canonical records;
  - [ ] dedupe rules between OSM, official sources, operators, and user reports.
- [~] Add Miami as the default seed city:
  - [x] add Miami app config and default map center
  - [x] add official-source facility fixture
  - [x] add Miami research manifest
  - [x] add Miami source expansion inventory
  - [x] add parser/browser backlog entries for high-value Miami sources
  - [x] add Miami Beach official WPGMZA marker import fixture
  - [ ] replace seed fixture with repeatable parser/importer
  - [ ] add confirmed city meter/curb source if available
  - [x] import OSM/Geofabrik Miami/Miami-Dade baseline instead of relying on public Overpass one-shot requests
  - [ ] run browser extraction for MPA commerce and operator pages
- [ ] Create source discovery checklist per city.
- [ ] Add city ingestion manifests.
- [~] Add importer templates for:
  - [~] Socrata foundation dry-run/import script writes `DataSource`, `ImportRun`, and `SourceObservation`; canonical upsert remains next slice
  - [~] ArcGIS REST foundation dry-run/import script writes `DataSource`, `ImportRun`, and `SourceObservation`; Miami Beach import mode additionally writes canonical `ParkingFacility`/`ParkingZone` rows, while generic ArcGIS canonical promotion remains next slice
  - [~] CKAN foundation dry-run/import script writes `DataSource`, `ImportRun`, and `SourceObservation`; default query currently returns zero rows and needs better target selection
  - [ ] static CSV/GeoJSON
  - [ ] operator feeds
  - [ ] public operator website parsers
  - [ ] valet/venue/airport/university/hospital page parsers
  - [ ] browser-agent extraction recipes for JavaScript-heavy pages
- [ ] Add city-level data quality dashboards.
- [ ] Bring Miami fixtures to SF-level status/provenance parity, including explicit granular statuses and source/API/evidence fields where evidence exists; do not fabricate payment/booking links.
- [~] Add first Miami Beach complete-record slice from official WPGMZA/ArcGIS data: rates, event rates, max time, capacity, ParkMobile zones, EV notes, source/API/evidence links, and payment-provider evidence are exposed without fabricating per-record checkout URLs.
- [ ] Prioritize payment/booking source enrichment for MPA commerce, MIA/airport parking, PortMiami, Parking.com/SP+, ABM, and Premium after parser/ToS review.
  - [ ] Build external payment-link parsers instead of relying on static backend fetch: use Playwright/Chrome network extraction for JavaScript/payment flows, provider deep-link parsing for ParkMobile/PayByPhone zones, or partner/API feeds when scraping is unstable or prohibited.
  - [ ] Require every external parser to dry-run first, classify candidate links (`direct_checkout`, `facility_page`, `app_zone`, `operator_search`), store `SourceObservation` evidence, and promote to canonical `payment_url` / `booking_url` only after stable direct checkout proof and ToS/legal review.
  - [~] Premium Parking Miami dry-run parser exists as `enrich:premium:dry-run`; it records operator facility observations and evidence only, with canonical payment/booking promotion blocked until direct checkout URLs and ToS review are available.
- [ ] Add conflict handling between official data, OSM, and operator sources.

Gate checks:

- [ ] each city has documented sources
- [ ] each imported layer has provenance
- [ ] importers are idempotent

## Phase 9 - Heuristics And Enrichment

- [ ] Inspect `Referenss/abstreet` before expanding heuristics.
- [ ] Add parking-lot extraction heuristics.
- [ ] Add service-road and parking-aisle recognition.
- [ ] Add capacity heuristics with confidence scoring.
- [ ] Add human-review queues for low-confidence geometry.
- [ ] Add conflict-resolution notes for derived vs official facts.

Gate checks:

- [ ] derived records are clearly marked
- [ ] confidence is lower than authoritative sources by default
- [ ] raw evidence/provenance is preserved

## Phase 10 - Operational Hardening

- [ ] Add scheduled ingestion strategy based on `Referenss/parking` service patterns.
- [ ] Add import logs and failure summaries.
- [ ] Add data freshness monitoring.
- [ ] Add schema migration checklist.
- [ ] Add backup/restore guidance for PostGIS.
- [ ] Add performance budget for API and tile responses.
- [ ] Add CI checks once a git/remote workflow is established.

Gate checks:

- [ ] failed imports are observable
- [ ] stale sources are visible
- [ ] release checklist includes build and data checks

## Global Acceptance Checklist

- [ ] Reuse-first decision recorded for every major new subsystem.
- [ ] Provenance fields preserved for every imported record.
- [ ] Public APIs remain compatible.
- [ ] GeoJSON fallback remains available until vector tile path is stable.
- [ ] Vector tiles are used for large production-scale layers.
- [ ] San Francisco baseline counts remain stable unless intentionally changed.
- [ ] `npm run build` passes after app changes.
- [ ] Relevant focused tests pass after import/normalization changes.

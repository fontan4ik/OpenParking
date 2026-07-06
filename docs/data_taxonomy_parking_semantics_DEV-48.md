# DEV-48: Data taxonomy для physical parking, curb rules и regulatory zones

Дата: 2026-07-03
Статус: design-only decision document. Production code в рамках DEV-48 не менялся.

## 1. Зачем это решение

Field feedback показал главный риск текущей модели: `parking_zone` иногда читается как физическое место, хотя часть таких записей является не парковкой, а зоной оплаты, permit/rule boundary, no-parking/loading rule или только кандидатом из OSM/ArcGIS.

Решение: разделить две оси, которые сейчас смешаны:

1. `entity_kind` — что это в реальном мире.
2. `geometry_role` / `display_layer` — как это рисовать на карте и в каком API-слое отдавать.

`parking_zone` больше не должен быть общим смыслом “тут можно припарковаться”. Это только legacy/API bucket для polygon layer, пока не введены явные semantic fields.

## 2. Источники, которые были проверены

Локальные источники правды:

- `AGENTS.md` — reuse-first, provenance contract, PostGIS/Prisma rules.
- `docs/PROJECT_OVERVIEW_RU.md` — текущая truth model, Miami/SF data, source/provenance fields.
- `docs/parking_full_data_strategy.md` — multi-source strategy, geometry types, parking zones vs off-street polygons.
- `docs/ARCHITECTURE.md` — current API/storage/data quality contract.
- `data/research/*.json` — source manifests: 27 JSON files; observed layer vocabulary includes `garages_lots`, `street_meters`, `curb_rules`, `payment_zones`, `valet`, `loading`, `event`, `monthly`, `operator_inventory`, `booking_urls`.

Reuse check:

- `Referenss/` was required by repo instructions, but the directory is not present in this checkout (`/Users/vladimirgrebennikov/Code/OpenParking/Referenss` not found). Existing in-repo reuse points still matter for the follow-up implementation: `osmtogeojson` import path, `osm2pgsql_parking.lua`, and already ported street-parking normalization code.

## 3. Current-state audit: где `parking_zone` сейчас перегружен

### 3.1 Prisma schema

Current models:

- `ParkingFacility` — points/centroids for physical places, meters, some facility candidates.
- `CurbSegment` — line features for street-side parking/rules.
- `ParkingZone` — all polygons: physical lot/garage footprints, OSM parking polygons, Miami Beach residential/regulatory zones, payment/rule polygons.

Problem:

- `ParkingZone.facilityType` is overloaded. It can mean `surface_lot`, `garage`, `parking_area`, `residential_parking_zone`, or a raw OSM `parking=*` value.
- There is no explicit field that says whether the row is a physical parking facility, an entrance, a curb rule, a payment/regulatory zone, valet/drop-off/loading/no-parking, or uncertain candidate.
- `ParkingZone` is therefore a storage table name, not a reliable semantic category.

### 3.2 Miami Beach ArcGIS canonical import

File: `apps/backend/scripts/miami_beach_arcgis_canonical.ts`

Current behavior:

- Layer 1 meters -> `ParkingFacility` (`facility_type=street_meter`).
- Layer 5 parking lots -> both:
  - `ParkingFacility` centroid (`facility_type=garage`/`surface_lot`), and
  - `ParkingZone` polygon for the lot footprint.
- Layer 7 parking zones -> `ParkingZone` polygon (`facility_type=residential_parking_zone`, `price_status=not_applicable`).
- Layer 3 spaces -> skipped from canonical import, preserved as fixture/raw evidence.

Good current mitigation:

- Layer 7 is already partly treated as not a physical place: `price_status=not_applicable`, `access=regulated_residential_zone`, `enrichment_status=needs_rules`.

Remaining risk:

- It is still stored in `ParkingZone` and can be misread by downstream API/UI/analytics as “parking zone/parking place” unless semantic fields are added.

### 3.3 Frontend loaders and API

Files:

- `apps/frontend/lib/data-loader.ts`
- `apps/frontend/lib/db-loader.ts`
- `apps/frontend/app/api/geojson/[layer]/route.ts`
- `apps/frontend/app/api/parking-index/route.ts`

Current behavior:

- `loadZones()` returns canonical features with `parkingusa_layer='parking_zone'`.
- `loadCurbSegments()` converts Miami Beach roadside/regulatory polygons into curb-like line display features.
- `loadZones()` filters regulatory/roadside polygons out of the default zones endpoint, but the internal naming is still `zones`/`parking_zone`.
- `/api/parking-index` merges `facility`, `curb_segment`, and `parking_zone` features into one feed.

Problem:

- `parkingusa_layer` is a visual/API layer, but consumers may treat it as semantic truth.
- UI labels `zones` and counters can include physical lot polygons and historically could be confused with payment/regulatory zones.

### 3.4 OSM/Geofabrik normalization

Files:

- `apps/backend/scripts/osm2pgsql_parking.lua`
- `apps/backend/scripts/normalize_osm_raw_parking_to_db.mjs`

Current behavior:

- `parking_points` -> `ParkingFacility`.
- `parking_lines` -> `CurbSegment`.
- `parking_polygons` -> `ParkingZone`.

Problem:

- OSM polygons can be physical lots/garages, garage buildings, surface lots, underground/multistorey parking, service/aisle/open-way candidates, or rough/incomplete candidate geometry.
- `priceStatus()` in the OSM normalizer currently returns legacy `known`/`unknown`, while canonical `PriceStatus` expects `known_priced`, `known_free`, `known_unpriced`, `paid_unknown`, `variable`, `stale`, `not_applicable`, `unknown`.
- There is no explicit OSM semantic mapping for entrances vs facilities vs curb/service lines vs uncertain candidates.

### 3.5 UI semantics

File: `apps/frontend/components/ParkingMap.tsx`

Current behavior:

- UI has visual layer groups: facilities/places, segments/curbs, zones.
- `price_status=not_applicable` displays as “Regulatory zone / Not a parking place”.
- Regulatory zones are filtered from default parking-area zones via `parkingAreaZonesOnly()`.

Problem:

- This UI mitigation depends on derived statuses and `facility_type` strings, not on first-class taxonomy fields.
- Valet, drop-off, loading and no-parking semantics do not have dedicated filters/layers yet.

## 4. Target taxonomy

Use these fields for canonical records and API features.

### 4.1 Required semantic fields

| Field | Type | Purpose |
| --- | --- | --- |
| `entity_kind` | enum/string | Real-world semantic class. Must not be inferred from table name alone. |
| `geometry_role` | enum/string | How this geometry should be used: physical footprint, entrance point, curb display line, rule/payment boundary, candidate approximation, evidence geometry. |
| `display_layer` | enum/string | UI/API display bucket: `facility`, `curb_segment`, `regulatory_zone`, `payment_zone`, `candidate`, `no_parking`, etc. |
| `parking_availability_semantics` | enum/string | Whether the feature implies parkable space: `parkable`, `partly_parkable`, `not_parkable`, `unknown`. |
| `regulation_kind` | enum/string/null | If regulatory: `paid_meter`, `permit`, `time_limit`, `loading`, `drop_off`, `valet`, `no_parking`, `street_cleaning`, `tow_away`, `residential`, `event`, `unknown`. |
| `source_authority` | enum/string | `official`, `operator`, `osm`, `derived`, `user_report`, `browser_evidence`, `candidate`. |
| `semantic_confidence` | float | Confidence for the classification itself, separate from price/rule/geometry confidence. |

These fields do not replace existing provenance. Every record must still preserve:

- `source_name`
- `source_id`
- `source_url`
- `api_url`
- `payment_url`
- `booking_url`
- `raw_properties`
- `confidence`
- `last_verified_at`
- `data_as_of`
- `evidence_url` / `evidence_file` when available

### 4.2 Entity kinds

| `entity_kind` | Definition | Typical geometry | Parkable? | Canonical destination |
| --- | --- | --- | --- | --- |
| `physical_facility` | Real off-street parking object: garage, surface lot, airport lot, campus lot, private/customer lot. | Point centroid and/or Polygon footprint | yes/partly | `ParkingFacility` plus optional footprint row/table |
| `garage_entrance` | Entrance/exit point for a garage/lot. Not the whole facility. | Point | yes, as access point only | dedicated entrance model or `ParkingFacility` with semantic field during transition |
| `curb_segment` | Street-side segment where parking/rule facts apply. | LineString/MultiLineString | yes/partly/no depending rules | `CurbSegment` |
| `payment_zone` | Zone/provider code used for payment/rate lookup. It can cover many spaces and may not be physical. | Polygon/MultiPolygon or code-only | not necessarily | regulatory/payment zone model, not physical facility |
| `regulatory_zone` | Permit/rate/time-limit/street-cleaning boundary. | Polygon/MultiPolygon | not necessarily | regulatory zone model / API layer |
| `valet` | Valet stand/service/drop-off where driver hands over keys. | Point/Line/Polygon | partly; access/service point, not self-park space | first-class valet/drop-off entity or curb/regulatory subtype |
| `drop_off_loading` | Loading, passenger drop-off, commercial loading, hotel/airport curb. | Point/Line/Polygon | usually no self-parking | curb/regulatory subtype |
| `no_parking` | Explicit no-parking/no-standing/tow-away rule. | Line/Polygon/sign point | no | curb/regulatory subtype; do not show as available parking |
| `uncertain_candidate` | OSM/operator/user/browser candidate requiring review. | Any | unknown | candidate layer with low confidence/review status |

### 4.3 Facility subtypes

For `entity_kind=physical_facility`, keep/normalize current `facility_type` into a more precise `facility_subtype`:

- `garage`
- `surface_lot`
- `underground_garage`
- `multi_storey_garage`
- `airport_lot`
- `event_lot`
- `monthly_lot`
- `customer_only_lot`
- `private_lot`
- `park_and_ride`
- `ev_charging_parking`
- `accessible_parking`
- `unknown_facility`

`facility_type` can stay for backward compatibility, but new code should prefer `entity_kind + facility_subtype`.

## 5. Routing rules by source/geometry

### 5.1 ArcGIS / Socrata / CKAN

- If source layer name/metadata says meters/spaces/pay stations: map to `curb_segment` or `street_meter` with `entity_kind=curb_segment` or meter point, not physical facility unless the source explicitly says it is a facility.
- If source layer says `Parking Lots`, `Garages`, `Facilities`: `entity_kind=physical_facility`; polygons are footprints, centroids are facility display points.
- If source layer says `Parking Zones`, `Residential Zones`, `Permit Areas`, `Rate Areas`, `Payment Zones`: `entity_kind=regulatory_zone` or `payment_zone`; `parking_availability_semantics=not_parkable` unless a separate source confirms spaces/facility inside.
- If source layer says `No Street Parking Available`, no-standing, loading, drop-off: `entity_kind=no_parking` or `drop_off_loading`; route to curb/regulatory display, not physical place.

### 5.2 OSM / Geofabrik

- Closed way/relation with `amenity=parking` and `parking=surface|multi-storey|underground|garage|rooftop` -> `physical_facility` with subtype mapping.
- Node with `amenity=parking_entrance` or entrance-like tags -> `garage_entrance`.
- `parking:left/right/both`, `parking:lane:*`, `parking:condition:*` -> `curb_segment`/curb rule observations using the ported street-parking normalizer.
- `parking=street_side|lane|on_kerb|half_on_kerb|shoulder` on ways -> `curb_segment` candidate, not `ParkingZone` physical footprint.
- `access=private|customers|permit` reduces availability semantics and confidence; it does not delete the record.
- Incomplete/tainted geometry from OSM conversion -> `uncertain_candidate`, `geometry_role=candidate_approximation`, lower `semantic_confidence`.

### 5.3 Operator/payment/provider sources

- Facility/location pages -> `physical_facility` if address/coordinates/name identify a real location.
- Provider/app zone IDs (ParkMobile/PayByPhone/Passport/etc.) -> `payment_zone` or payment evidence attached to a facility/curb segment; do not infer a direct `payment_url` unless the source gives a stable per-record checkout/deeplink.
- Booking/search pages -> `SourceObservation` first; promote to `booking_url` only after direct link classification and legal/ToS review.
- Valet pages -> `valet` with drop-off point/curb semantics, not generic garage/lot.

## 6. Transitional API contract

To avoid breaking current frontend/API immediately:

1. Keep `/api/facilities`, `/api/geojson/segments`, `/api/geojson/zones`, `/api/parking-index` stable.
2. Add semantic fields to GeoJSON properties before renaming endpoints.
3. Treat `parkingusa_layer` as display/API layer only.
4. Add `entity_kind`, `geometry_role`, `display_layer`, `parking_availability_semantics`, `regulation_kind`, `semantic_confidence` to every canonical feature.
5. Keep `facility_type` for compatibility but stop using it as the primary semantic discriminator.
6. Rename UI copy gradually: visual “Zones” can become “Areas / zones”; regulatory/payment/no-parking zones need distinct badges.

## 7. Recommended code changes for follow-up task

No production code should be changed under DEV-48. The implementation should be split into small follow-up tasks.

### Phase A — schema/backward-compatible fields

Files likely affected:

- `apps/backend/prisma/schema.prisma`
- new migration under `apps/backend/prisma/migrations/`

Add nullable fields to `ParkingFacility`, `CurbSegment`, `ParkingZone`:

- `entityKind String?`
- `geometryRole String?`
- `displayLayer String?`
- `parkingAvailabilitySemantics String?`
- `facilitySubtype String?`
- `regulationKind String?`
- `sourceAuthority String?`
- `semanticConfidence Float?`

Why nullable: current rows/fixtures can be backfilled incrementally without blocking existing API.

Required verification for this phase:

- `npm run db:generate`
- affected import dry-run(s), at minimum:
  - `npm run connector:arcgis:dry-run`
  - `npm run normalize:osm:pbf:miami-dade:boundary:dry-run` if DB/raw tables are available; otherwise document DB blocker.

### Phase B — normalizer helpers

Files likely affected:

- new `apps/backend/scripts/parking_semantics.ts` or shared frontend/backend-safe module if needed.
- `apps/backend/scripts/miami_beach_arcgis_canonical.ts`
- `apps/backend/scripts/normalize_osm_raw_parking_to_db.mjs`
- `apps/backend/scripts/osm2pgsql_parking.lua` comments/output tags only if needed.

Implement source-specific semantic classifiers:

- `classifyArcgisLayerSemantics(layer, properties)`
- `classifyOsmParkingSemantics(tags, geometryType)`
- `classifyPaymentProviderEvidence(rawProperties)`
- `classifyCurbRuleSemantics(rawProperties)`

Acceptance examples:

- Miami Beach ArcGIS layer 5 lots: `entity_kind=physical_facility`, `geometry_role=facility_footprint`, `display_layer=parking_area`, `parking_availability_semantics=parkable`.
- Miami Beach ArcGIS layer 7 zones: `entity_kind=regulatory_zone`, `geometry_role=rule_boundary`, `display_layer=regulatory_zone`, `parking_availability_semantics=not_parkable`, `regulation_kind=residential` or `no_parking` where `ZONE_TYPE=No Street Parking Available`.
- OSM `parking=multi-storey`: `entity_kind=physical_facility`, `facility_subtype=multi_storey_garage`.
- OSM street-side tags: `entity_kind=curb_segment`, not `parking_zone`.

### Phase C — loader/API properties

Files likely affected:

- `apps/frontend/lib/db-loader.ts`
- `apps/frontend/lib/data-loader.ts`
- tests in `tests/lib/parking-index.test.ts`

Add semantic fields to `provenanceProperties()` / `canonicalFeature()`.

Rules:

- If DB row has semantic fields, preserve them.
- If file fallback lacks them, derive conservative semantics from existing properties and geometry.
- If uncertain, set `entity_kind=uncertain_candidate`, `semantic_confidence <= 0.5`, not a confident physical place.

### Phase D — UI labels and filters

Files likely affected:

- `apps/frontend/components/ParkingMap.tsx`
- translation/types files if labels live elsewhere.

Changes:

- Show badges for `Physical facility`, `Entrance`, `Curb rule`, `Payment zone`, `Regulatory zone`, `Valet`, `Loading/drop-off`, `No parking`, `Candidate`.
- Default map should not show `no_parking` / `regulatory_zone` as available parking places.
- Explicit debug/zones mode can show regulatory/payment zones, but popup must say “Not a parking place” / “Rule/payment area”.

### Phase E — docs and research manifests

Files likely affected:

- `docs/PROJECT_OVERVIEW_RU.md`
- `docs/ARCHITECTURE.md`
- `docs/INTEGRATION_USAGE_GUIDE.md`
- `docs/README.md`
- `data/research/*.json` schema/validator if manifest terms are formalized.

Changes:

- Add canonical vocabulary to docs.
- Add allowed `parking_layers` / `entity_kind` vocabulary to research validation when implementation starts.
- Preserve legal risk/confidence: non-authoritative sources stay candidates until reviewed.

## 8. Data-quality rules

1. Do not promote regulatory/payment/no-parking zones to `physical_facility` without separate facility evidence.
2. Do not use payment provider zone IDs as direct `payment_url`/`booking_url` unless the source gives a stable direct link for that exact record.
3. Unknown price is not free.
4. No-parking/loading/drop-off/valet are first-class facts, not “bad facilities”. They should be useful to drivers but not counted as normal available self-parking inventory.
5. Candidate baseline records stay visible only with explicit confidence and review status.
6. Any authoritative claim must keep source/provenance fields and raw source payload.

## 9. Suggested acceptance tests for implementation task

- Fixture test: Miami Beach layer 7 `No Street Parking Available` is not returned as a physical parking zone/available place.
- Fixture test: Miami Beach layer 5 lot is returned as physical facility plus footprint with matching provenance.
- OSM fixture test: `amenity=parking` polygon maps to physical facility/parking area; `parking:lane:*` maps to curb segment.
- API test: `/api/parking-index` includes `entity_kind`, `geometry_role`, `display_layer`, `parking_availability_semantics`, `semantic_confidence` for every feature.
- UI smoke: popup for regulatory/payment/no-parking zone says it is a rule/payment area, not a parking lot.
- Idempotent import dry-run: repeated dry-run/import does not change expected counts or duplicate source ids.

## 10. Decision summary

ParkingUSA should keep `ParkingFacility`, `CurbSegment`, and `ParkingZone` as transitional storage/API concepts, but the canonical truth must move to explicit semantic fields. The core split is:

- physical parking inventory: facilities, garages, lots, entrances;
- curb-side parkability/rules: curb segments, meters, street-side parking;
- non-physical zones: payment zones, permit/rate/regulatory boundaries;
- special curb/service facts: valet, drop-off, loading, no-parking;
- uncertain candidates: low-confidence OSM/operator/user/browser observations.

This lets the product still show broad parking coverage while preventing a regulatory/payment/no-parking polygon from being mistaken for a real place to park.

# DEV-55: Road / curb / entrance snapping heuristics for real parking geometry

Дата: 2026-07-03
Статус: design-only / reference pack before implementation. Production code в рамках DEV-55 не менялся.
Machine-readable companion: `data/research/road-curb-entrance-snapping-dev55.json`.

## 1. Зачем это нужно

DEV-48 разделил семантику physical facility / curb segment / regulatory zone / entrance / candidate. DEV-49 показал на South Beach, что даже официальный источник может дать false positives, если точку, payment zone или residential boundary показать как реальное место для парковки.

DEV-55 фиксирует следующий слой качества: как приблизить geometry к реальности до implementation task:

- meter / space / sign points должны привязываться к правильной стороне дороги, а не просто соединяться прямой линией;
- curb rows должны останавливаться перед intersections, crosswalks, hydrants, driveways, loading/drop-off/valet/no-parking evidence;
- OSM `parking_entrance` должен быть entrance/access point, а не самостоятельный parking facility;
- garage / surface lot polygon должен иметь entrance candidates и confidence, если entrance source отдельно подтвержден;
- generated geometry должна сохранять provenance, raw input и downgrade reasons, а не выглядеть authoritative.

## 2. Проверенные источники и reuse-first вывод

### 2.1 Локальный source of truth

Прочитано перед проектированием:

- `AGENTS.md` — reuse-first, provenance contract, backend/Prisma verification rules.
- `docs/PROJECT_OVERVIEW_RU.md` — текущая truth model, Miami/SF data, API, provenance fields.
- `docs/parking_full_data_strategy.md` — curb lines, zone/polygon strategy, OSM/Overture/city GIS sources.
- `docs/data_taxonomy_parking_semantics_DEV-48.md` — semantic fields and routing rules.
- `docs/SOUTH_BEACH_FALSE_POSITIVE_AUDIT_DEV-49_RU.md` — observed false-positive classes and downgrade rules.
- `data/research/*.json` — source manifests and field-audit evidence, especially Miami, NYC, Seattle.
- Existing code: `apps/backend/scripts/osm2pgsql_parking.lua`, `apps/backend/scripts/normalize_osm_raw_parking_to_db.mjs`, `apps/frontend/lib/heuristics/parking-capacity.ts`.

### 2.2 `Referenss/` check

Repo instructions require checking `Referenss/` first. In this checkout `/Users/vladimirgrebennikov/Code/OpenParking/Referenss` is absent, so no direct local reference source could be opened. Reuse still remains mandatory for the follow-up implementation through the already documented reference contracts:

- `osmtogeojson` for Overpass/OSM JSON/XML conversion with relations/multipolygons and tainted geometry flags;
- external `osm2pgsql` for production OSM PBF -> PostGIS raw geometry tables;
- ported `osm-tag-updater` street-parking normalization for `parking:left/right/both`, legacy `parking:lane:*`, `parking:condition:*`;
- A/B Street as algorithm/reference material for street-parking lanes, service roads / parking aisles and capacity heuristics;
- CurbLR / OMF CDS as target model for curb segments, side-of-street, regulation rules, and linear referencing.

### 2.3 Official / upstream docs checked during DEV-55

Network documentation snapshot was checked on 2026-07-03 via direct HTTP fetch where `web_extract` backend was unavailable:

- OSM Street parking wiki: current tagging uses `parking:left`, `parking:right`, `parking:both` on highway ways; side is interpreted in way direction. This supports explicit one/both-side classification before offsetting.
- OSM `parking` key wiki: `parking=*` is used with `amenity=parking`, with `parking:left/right/both` on highways, and with `amenity=parking_entrance` nodes for the type reached through an entrance. This confirms entrance is not equal to facility.
- CurbLR site: each curb feature is a GeoJSON `LineString` with location properties including side of street, SharedStreets reference/location start/end, marker type and regulation objects.
- OMF Curb Data Specification README: CDS expresses static/dynamic parking and access regulations, curb metrics and curb policy infrastructure.
- A/B Street parking docs: on-street parking acts as a road lane divided into spaces using configurable spot length; parking lots and service aisles are modeled separately.
- PostGIS docs: `ST_OffsetCurve` for side offset, `ST_LineLocatePoint` and `ST_LineSubstring` for linear referencing and cutting segments by fractional locations.

## 3. Target geometry-quality model

Do not add these fields blindly in DEV-55; this is the design target for the implementation task. They should be added either as nullable Prisma fields or as `raw_properties.geometry_quality_v2` during a transitional phase.

### 3.1 Geometry/provenance fields

Required for generated curb/entrance geometry:

- `geometry_role`: `road_centerline`, `curb_display_line`, `curb_rule_segment`, `meter_evidence_point`, `space_evidence_point`, `garage_entrance`, `facility_footprint`, `candidate_approximation`, `suppression_boundary`.
- `geometry_provenance`: source and method, for example `official_blockface`, `osm_highway_offset`, `arcgis_space_cluster`, `osmtogeojson_polygon`, `manual_field_evidence`.
- `source_geometry_id`: stable upstream id for road/blockface/space/sign/entrance geometry.
- `matched_road_source_id`: OSM way id / city blockface id / SharedStreets ref when available.
- `matched_side`: `left`, `right`, `both`, `unknown`, in source road direction; preserve original direction basis.
- `linear_ref_start` / `linear_ref_end`: 0..1 fraction along matched road or SharedStreets location start/end.
- `offset_meters`: signed or side-explicit curb offset used to draw the line.
- `snap_distance_meters`: max/median distance from evidence points to chosen road/curb line.
- `snap_method`: `official_blockface`, `road_name_from_to_side`, `nearest_road_side`, `point_cluster_side_fit`, `osm_parking_side_tags`, `manual_review`.
- `cut_reasons`: array of applied cuts: `intersection_offset`, `crosswalk`, `hydrant`, `driveway`, `loading_zone`, `valet`, `no_parking`, `parking_lot_interior`, `field_conflict`, `max_gap`.
- `geometry_confidence`: confidence of physical geometry only; separate from source confidence and semantic confidence.
- `offer_confidence`: driver-facing confidence that this is ordinary public parking.
- `review_status`: `accepted`, `needs_snapping`, `needs_field_review`, `conflict`, `suppressed`, `candidate`.

Existing required provenance remains unchanged and must be preserved for every row:

`source_name`, `source_id`, `source_url`, `api_url`, `payment_url`, `booking_url`, `raw_properties`, `confidence`, `last_verified_at`, `data_as_of`, `evidence_url` / `evidence_file`.

### 3.2 Confidence bands

Use separate bands instead of one overloaded `confidence`:

| Band | Meaning | Typical value |
| --- | --- | ---: |
| `source_confidence` | Is the upstream source reliable? Official ArcGIS/Socrata can be high. | 0.75-0.95 |
| `semantic_confidence` | Did we classify facility/curb/regulatory/entrance correctly? | 0.35-0.95 |
| `geometry_confidence` | Is the line/polygon/point physically placed correctly? | 0.20-0.95 |
| `offer_confidence` | Should a driver trust it as ordinary public parking now? | 0.20-0.90 |

Important rule from DEV-49: official source confidence must not automatically raise `offer_confidence`. A meter point or payment zone can be official and still not prove a legal stall at that exact curb.

## 4. Snapping pipeline design

### Stage 0 — input classification

Classify inputs before geometry matching:

1. Physical facility polygon/centroid: garages, surface lots, airport lots, official lot polygons, OSM `amenity=parking` closed ways/relations.
2. Entrance/access point: OSM `amenity=parking_entrance`, operator entrance notes, garage driveway points, driveway crossings.
3. Curb evidence points: meters, pay stations, marked spaces, signs, user photo points.
4. Curb rule boundaries: residential/payment/rate/no-parking/loading/valet/drop-off zones.
5. Road network candidates: OSM highways, city blockfaces/centerlines, SharedStreets/CurbLR if present.
6. Exclusion/conflict features: crosswalks, intersections, hydrants, driveways, loading zones, bus stops, valet/drop-off/no-parking evidence, parking-lot interiors.

If the input is not a physical facility or verified curb segment, do not route it to the default public parking offer layer without explicit downgrade fields.

### Stage 1 — road candidate selection

Inputs:

- road centerlines / blockfaces from city GIS, OSM/osm2pgsql, Overture when available;
- street names/from/to/side fields from city open data;
- evidence points from meters/spaces/signs;
- OSM `parking:left/right/both` and old `parking:lane:*` tags.

Preferred matching order:

1. Official blockface / CurbLR / CDS line with side and linear refs.
2. Exact street/from/to/side join to city centerline or OSM way.
3. Nearest drivable/service road within a bounded distance, filtered by road class and name similarity.
4. Point-cluster side fit: infer side from the signed perpendicular distance of points relative to candidate road direction.
5. Candidate-only fallback if road match is ambiguous.

Initial thresholds for implementation:

- max point-to-road distance: 18m urban default; 30m only for coarse GPS or low-density official data;
- name/from/to mismatch lowers geometry confidence by at least 0.2;
- more than one plausible road within threshold requires `needs_field_review` unless official blockface id resolves it;
- service roads/parking aisles inside a lot should be used for entrance/circulation context, not as public curb parking unless source explicitly says street-side parking.

### Stage 2 — side-of-street assignment

Rules:

- OSM `parking:left/right/both` side is relative to OSM way direction; store `matched_side_basis=osm_way_direction`.
- City `side`, `side_of_street`, `blockface_side` fields override heuristic side when present.
- For meter/space point clusters, compute signed perpendicular distance to matched road; majority side wins if points are consistently on one side.
- If both sides are tagged/observed, split into two curb rows with the same road id but different `matched_side` and opposite offsets.
- If side confidence is weak, keep line on road centerline only as candidate debug geometry or create `needs_snapping`; do not draw it as curb offer.

Initial side-confidence heuristics:

- official side field or CurbLR side: `side_confidence=0.9`;
- OSM parking side tags: `0.75` when road geometry is complete and not tainted;
- clustered points all on one side: `0.65-0.8` depending on point count and spread;
- mixed/near-center points: `<=0.45`, requires review.

### Stage 3 — curb offset line

Use PostGIS / Turf implementation equivalent:

- `ST_OffsetCurve(road_geom, signed_offset_meters)` for left/right curb display lines;
- default offset: 3.0-4.5m for narrow urban roads; 5.0-6.0m for wide arterials where lane/road width data is unknown;
- clamp/flag offset curves that self-intersect, flip direction unexpectedly, or jump across intersections.

Do not treat offset geometry as authoritative if:

- input road geometry is simplified/coarse;
- evidence points sit consistently farther than threshold from offset line;
- the road is a divided highway/multilane arterial without lane/curb geometry;
- nearby official curb/blockface line exists and conflicts.

### Stage 4 — linear referencing and cutting

Use `ST_LineLocatePoint` and `ST_LineSubstring` or a frontend/backend equivalent to cut matched road/curb lines into true parking spans.

Cut sources and suggested initial buffers:

| Cut source | Suggested buffer/offset | Effect |
| --- | ---: | --- |
| Intersection / street corner | 6-10m from corner unless local rule known | Trim legal no-parking near corners. |
| Crosswalk | 6m before/after crosswalk line/polygon | Remove crosswalk approaches. |
| Fire hydrant | 4.5m / 15ft each side by default | Split or suppress segment near hydrant. |
| Driveway / curb cut / garage entrance | 3-5m around driveway crossing | Remove driveway blocking area; preserve as entrance evidence. |
| Bus stop / transit stop | 12-25m depending on source geometry | Mark loading/no-standing, not ordinary parking. |
| Loading / commercial loading | exact line/polygon or sign range | `regulation_kind=loading`, not public parking. |
| Valet / drop-off | evidence range + conservative buffer | `regulation_kind=valet` or `drop_off_loading`. |
| Parking-lot/garage polygon interior | full polygon intersection | Do not generate curb rows through lot interiors. |
| Max point gap | 2-3 stall lengths or source-specific threshold | Split row; do not bridge unknown curb. |

Legal distances differ by jurisdiction. Defaults above are conservative geometry-quality heuristics, not law. Store `cut_reasons` and keep jurisdiction-specific rules overrideable.

### Stage 5 — road-side vs parking-lot interior filtering

Before promoting generated curb lines:

- remove points inside known official lot/garage polygons unless source says they are internal marked spaces;
- if a line crosses a parking lot polygon, split and suppress the interior part from `curb_segment` default layer;
- OSM service roads / parking aisles inside a lot are useful for garage/lot access/capacity but not public curb parking;
- if raw official spaces are inside a garage/lot polygon, attach as facility/space evidence, not road-side curb.

This directly addresses Miami Beach layer 3 generated rows from DEV-49.

### Stage 6 — entrance snapping and facility association

Entrance rules:

- OSM `amenity=parking_entrance` / `entrance=*` / operator entrance points become `entity_kind=garage_entrance`, `geometry_role=garage_entrance`.
- Never count entrance nodes as parking offers or facility centroids by themselves.
- Associate an entrance to a physical facility if it is within the facility polygon, on boundary, or within 25m of the footprint/centroid with matching name/operator/source context.
- If a garage has no entrance point, infer only `entrance_candidate` from nearest driveway/service road intersection and keep confidence low (`geometry_confidence<=0.45`) until verified.
- Preserve `entrance_source_id`, `entrance_access`, `entrance_raw_tags`, `entrance_confidence`, and `associated_facility_source_id`.

Building garage entrance edge cases:

- multi-storey or underground garages may share a building footprint with non-parking uses; a building polygon is not enough without parking tags, operator data, official facility source, or entrance evidence;
- driveway/entrance evidence improves routing and popup clarity but does not by itself prove public access;
- `access=private|customers|permit|no` must downgrade default visibility.

### Stage 7 — conflict scoring and promotion gate

A generated curb/facility/entrance feature can be promoted to default public layer only when:

- semantic class is not regulatory/payment/no-parking/loading/valet unless default layer explicitly supports that class;
- source/provenance fields are present;
- road/side match is not ambiguous;
- geometry confidence meets threshold;
- no high-confidence conflict feature intersects it;
- access tags/rules do not make it private/customer-only/permit-only/no;
- payment provider zone evidence is not mistaken for physical availability.

Suggested initial promotion thresholds:

| Feature | Default-layer threshold |
| --- | ---: |
| Official physical lot/garage polygon or centroid | `offer_confidence>=0.70` unless access restricted. |
| OSM physical facility polygon | `offer_confidence>=0.55`, higher if named/operator/access/fee present. |
| Generated curb from official spaces/meters | `geometry_confidence>=0.60` and no conflict cuts unresolved. |
| OSM street parking tags on road | `semantic_confidence>=0.65`, `geometry_confidence>=0.55`. |
| Entrance | visible as entrance overlay, not parking offer. |
| Regulatory/payment/no-parking/loading/valet | separate overlay; default-hidden unless UI mode asks for curb/service facts. |

## 5. Reference data/tools to reuse in implementation

### 5.1 Existing local data

| Purpose | Path / source | Use |
| --- | --- | --- |
| South Beach false-positive ground truth | `data/research/field-audits/dev-49-south-beach-false-positive-audit.json` | Regression fixtures for layer 7 zones, layer 3 spaces, meters, OSM entrances/private/customer candidates. |
| Miami Beach ArcGIS fixtures | `data/miami_beach_parking_arcgis_*.geojson` | Official spaces/meters/lots/zones; test road-side vs interior filtering. |
| Miami OSM fallback | `data/miami_parking_osm.geojson` | OSM entrances, access restrictions, low-detail candidates. |
| NYC Socrata manifest | `data/research/cities/new-york-city.ny.json` | Signs and meter points for future sign-to-curb rule parser. |
| Seattle manifest | `data/research/cities/seattle.wa.json` | Blockface FeatureServer as preferred official curb geometry reference. |
| OSM raw import config | `apps/backend/scripts/osm2pgsql_parking.lua` | Existing production path for parking_points / parking_lines / parking_polygons raw OSM tables. |
| OSM normalizer | `apps/backend/scripts/normalize_osm_raw_parking_to_db.mjs` | Follow-up implementation target for semantic/geometry quality fields. |
| Capacity heuristics | `apps/frontend/lib/heuristics/parking-capacity.ts` | Existing A/B Street-inspired capacity heuristics; should consume better geometry later. |

### 5.2 External tools / standards

| Tool / standard | Use | Implementation note |
| --- | --- | --- |
| PostGIS `ST_OffsetCurve` | Draw curb line offset from road centerline. | Use in DB pipeline; store offset distance and method. |
| PostGIS `ST_LineLocatePoint`, `ST_LineSubstring` | Linear referencing: snap evidence points and cut spans. | Use for intersection/crosswalk/hydrant/driveway gaps. |
| `osm2pgsql` external CLI | PBF -> PostGIS OSM roads/parking raw tables. | Keep GPL tool external; no source copy. |
| `osmtogeojson` | Overpass JSON/XML -> GeoJSON with relations/multipolygons. | Use for small city/fixture extraction; preserve tainted flags. |
| `osm-tag-updater` logic | Normalize OSM street parking tags. | Already ported for street-parking; extend tests around side tags. |
| CurbLR / OMF CDS | Target curb regulation model. | Use side/start/end/regulation vocabulary and GeoJSON LineString concept. |
| A/B Street | Algorithm reference for street parking lanes, lots, capacity. | Reuse ideas, not Rust app wholesale. |
| Overture / city blockfaces | Better road/building/places cross-checks. | Add as future source candidates with legal/provenance review. |

## 6. Implementation backlog split

Recommended child tasks after DEV-55:

1. `Geometry quality schema + classifier fields` — add nullable Prisma/API fields and conservative fallback derivation.
2. `Road/side snapping library` — PostGIS/Turf helper for road candidate selection, side assignment, offset line, linear refs.
3. `Miami Beach regression fixtures` — build deterministic fixtures from DEV-49 for layer 3/7/1 and OSM entrance/private cases.
4. `OSM entrance/facility association` — classify and associate `parking_entrance` nodes without counting them as offers.
5. `Curb cut/exclusion sources` — add hydrant/driveway/crosswalk/loading/valet/no-parking data source manifests per pilot city; official first, field evidence second.
6. `Default-layer promotion gate` — enforce offer confidence/access/conflict thresholds before `/api/parking-index` default visibility.

## 7. Acceptance tests for implementation

Use these as test names / fixture criteria later:

- `miami_beach_layer7_zone_is_regulatory_not_offer`: layer 7 `Parking Zones` records stay `regulatory_zone`, `parking_availability_semantics=not_parkable`, default-hidden.
- `layer3_spaces_do_not_bridge_driveways_or_conflicts`: generated curb rows split at max gaps, driveways/loading/valet/no-parking evidence and lot interiors.
- `meter_point_is_payment_equipment_not_stall`: layer 1 meter/pay-station point attaches to nearest verified curb/space or stays evidence-only.
- `osm_parking_entrance_is_not_facility_offer`: OSM entrance node is associated to a facility/road access point, not shown as parking offer.
- `osm_access_restrictions_downgrade_default_visibility`: `access=no/private/customers/permit` remains stored but hidden from ordinary public layer.
- `one_both_side_tags_split_rows`: OSM `parking:left/right/both` produces correct side-specific offset rows with side basis preserved.
- `official_blockface_preferred_over_nearest_road`: Seattle-style blockface geometry wins over nearest OSM centerline when both exist.
- `promotion_preserves_provenance`: every generated feature keeps `source_name`, `source_id`, `source_url`, `api_url`, `payment_url`, `booking_url`, `raw_properties`, `confidence`, `last_verified_at`, `data_as_of`.

## 8. Non-authoritative / legal-risk guardrails

- Satellite/aerial/photo evidence may help review geometry, driveway/crosswalk/hydrant conflicts and confidence, but should not become authoritative master geometry without license review and human/official confirmation.
- Google Maps/Street View/Places can be used only as discovery/matching/manual QA where policy permits; do not cache/copy it as ParkingUSA master geometry.
- Payment app zone ids (ParkMobile/PayByPhone/Passport/etc.) are payment evidence, not proof that every curb span is parkable.
- User field evidence enters `SourceObservation` / conflict review first; it can downgrade confidence immediately but should not silently overwrite official facts without review.

## 9. Decision summary

ParkingUSA should move from “connect nearby parking points into map lines” to a provenance-preserving geometry pipeline:

1. classify source semantics first;
2. match to road/blockface/curb reference;
3. assign side of street;
4. offset the line;
5. cut legal/physical exclusions;
6. associate entrances with facilities;
7. promote only features that pass offer-confidence gates.

The key product rule is simple: a feature can be useful evidence without being a verified parking offer. The implementation must store that difference explicitly instead of hiding it inside one generic `confidence` field.

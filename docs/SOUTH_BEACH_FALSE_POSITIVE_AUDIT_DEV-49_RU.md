# DEV-49: South Beach / Ocean Drive false-positive audit

Дата аудита: 2026-07-03
Рабочая зона: Ocean Drive, Collins Ave, Lincoln Road, 13th Street, 16th Street / South Beach.
Machine-readable artifact: `data/research/field-audits/dev-49-south-beach-false-positive-audit.json`.

## Короткий вывод

Главная причина false positives — не один плохой источник, а смешение разных смыслов в одном визуальном слое:

1. Miami Beach ArcGIS layer 7 называется `Parking Zones`, но это residential/regulatory/payment rule polygons, а не физические места парковки.
2. Miami Beach ArcGIS layer 3 `Parking Spaces` — полезные official point evidence, но текущий fallback группирует их в непрерывные curb lines; такие линии могут пересекать valet/drop-off/no ordinary parking участки из пользовательского field evidence.
3. Miami Beach ArcGIS layer 1 meter/pay-station points подтверждают оборудование/зону оплаты, но не гарантируют каждое legal stall вокруг точки.
4. OSM baseline вокруг South Beach содержит entrances, customer-only, access=no и low-detail unnamed candidates; это discovery hints, а не authoritative public parking.
5. User field evidence показывает, что часть Ocean Drive / Collins / Lincoln corridor фактически valet/drop-off/no ordinary parking/no clear spaces; эти наблюдения должны понижать confidence и включать `needs_field_review`.

## Что проверено

Источник user evidence: Paperclip DEV-47 brief `Field feedback: Miami/South Beach + NYC parking correctness`.

Локальные fixtures / текущие слои карты:

- `data/miami_beach_parking_arcgis_facilities.geojson`
- `data/miami_beach_parking_arcgis_lots_zones.geojson`
- `data/miami_beach_parking_arcgis_spaces.geojson`
- `data/miami_beach_parking_arcgis_meters.geojson`
- `data/miami_beach_parking_arcgis_lots.geojson`
- `data/miami_beach_parking_arcgis_zones.geojson`
- `data/miami_parking_osm.geojson`
- `data/miami_beach_parking_wpgmza.geojson`

`Referenss/` был проверен первым, но в этом checkout папка отсутствует, поэтому для аудита использован существующий loader/fixture logic и локальные данные.

## Counts в проблемных bbox

### South Beach core `[-80.1375, 25.7800, -80.1260, 25.7935]`

- ArcGIS facilities: 135 = 13 official lot/garage centroids + 122 meter/pay-station points.
- ArcGIS lots/zones: 112 = 13 actual lot/garage polygons + 99 regulatory/residential zone polygons.
- ArcGIS raw spaces: 1,765 points; frontend currently groups them into curb rows.
- ArcGIS meters: 122 points.
- OSM fallback: 35 point candidates.
- WPGMZA: 12 official garage/lot markers.

### Ocean Drive / 13th-16th `[-80.1325, 25.7820, -80.1280, 25.7905]`

- ArcGIS facilities: 68 = 4 official lots/garages + 64 meter points.
- ArcGIS lots/zones: 16 = 4 actual lot/garage polygons + 12 regulatory/residential polygons.
- ArcGIS raw spaces: 684 points.
- ArcGIS meters: 64 points.
- OSM fallback: 14 point candidates.
- WPGMZA: 3 official facilities: P16/G3/G4.

### Lincoln / Collins `[-80.1355, 25.7870, -80.1280, 25.7935]`

- ArcGIS facilities: 37 = 4 official lots/garages + 33 meter points.
- ArcGIS lots/zones: 20 = 4 actual lot/garage polygons + 16 regulatory/residential polygons.
- ArcGIS raw spaces: 619 points.
- ArcGIS meters: 33 points.
- OSM fallback: 23 point candidates.
- WPGMZA: 4 official facilities: G4/G5/G9/P29.

## False-positive classes and rules

### 1. Layer 7 regulatory zone shown as parking offer

Examples:

- `miami-beach:arcgis:zones:172` — `ZONE_=5`, `ZONE_TYPE=2`, `RESTRICTED_RES_TIME=4`.
- `miami-beach:arcgis:zones:181` — `ZONE_=5`, `ZONE_TYPE=2`, `RESTRICTED_RES_TIME=3`.
- `miami-beach:arcgis:zones:386` — `ZONE_=5`, `ZONE_TYPE=4`, `RESTRICTED_RES_TIME=4`.

Why false-positive:

Layer 7 is official, but official here means “official rule boundary”, not “verified place to park”. If the map shows it as `parking_zone` with `access=public`, `confidence=0.9`, `price_status=known_unpriced`, the user reads it as a real parking offer.

Rule:

- Never use FeatureServer layer 7 as ordinary `ParkingFacility` or selectable parking offer.
- Keep it as `regulatory_zone` / `curb_rule_evidence`.
- Set `price_status=not_applicable`, `fee=not_applicable`, `access=regulated_residential_zone`, `enrichment_status=needs_rules`.
- Cap offer/display confidence at `<=0.35` unless joined to actual layer 1/3 meter/space or field-sign evidence.

### 2. `ZONE_TYPE=4` off-street residential overlap / duplicate around garages

Examples:

- `miami-beach:arcgis:zones:175`
- `miami-beach:arcgis:zones:177`
- `miami-beach:arcgis:zones:385`
- `miami-beach:arcgis:zones:386`

Why false-positive:

`ZONE_TYPE=4` is “Off-Street Residential Parking”. Around 13th/Collins it overlaps or shadows real official facility geometry, e.g. G3 at 1301 Collins Ave. Showing both the physical garage/lot and the regulatory/off-street residential zone creates duplicate offers.

Rule:

If layer 7 `ZONE_TYPE=4` intersects a layer 5 official lot/garage polygon or WPGMZA marker within 25m, suppress the layer 7 offer and attach it only as rule/provenance evidence to the physical facility.

### 3. Layer 3 raw spaces converted into continuous curb lines

Example:

- `miami-beach:arcgis:spaces:429`
- raw fields: `TYPE=PARKING SPACE`, `SPACE_NUMBER=WA14045`, `METER_RATES=$4/hr`, `ENFORCEMENT_TIME=9am-3am`, `MtrCollect=1X`, `ParkMobile=88501`.

Why false-positive:

Layer 3 is valuable official evidence, but a point cluster is not automatically a full continuous legal curb row. Generated rows can visually cross valet/drop-off/no-parking/no-clear-space segments seen by the user.

Rule:

- Treat layer 3 points as individual official evidence first.
- Generated curb rows get `display_confidence<=0.55` until they pass road-side snapping, max-gap checks, side-of-street assignment, exclusion against valet/drop-off/no-parking observations, and parking-area interior filtering.
- Preserve `source_space_start_id`, `source_space_end_id`, `geometry_provenance`, `ParkMobile`, `MtrCollect`, `METER_RATES`, `ENFORCEMENT_TIME`.
- Do not call the row a verified ordinary public parking offer unless conflicts are cleared.

### 4. Layer 1 meter point treated as stall/facility

Example:

- `miami-beach:arcgis:meters:13`
- raw fields: `NUMBER=WA16E03`, `BRAND=DPT`, `ZONE=1X`, `STATUS=5`.

Why false-positive:

A meter/pay-station point confirms equipment or payment collection zone, but not a whole physical stall/row.

Rule:

- Render layer 1 as payment/meter evidence or attach to nearest verified space/curb segment.
- If it is not joined to layer 3 spaces or field sign evidence, cap parking-offer confidence at `<=0.5` and use `existence_status=payment_equipment_evidence` / `needs_field_review` for driver-facing offer semantics.

### 5. OSM customer/private/entrance candidates in default public layer

Examples:

- `osm:node:5611595821` — Liquor Lounge Cafe, `parking=yes`, `access=customers`.
- `osm:node:5638862629` — Crema Gourmet Espresso Bar South Beach, `parking=yes`, `access=customers`.
- `osm:node:5629495523` — parking entrance, `access=no`.
- multiple unnamed `parking_entrance` / `multi-storey` / low-detail candidates around known garages.

Why false-positive:

OSM is useful as discovery/baseline, but access and semantic tags decide whether a driver can use it as ordinary public parking.

Rule:

- `access in [private, no, customers, delivery, permit]` => not ordinary public offer.
- `parking_entrance` => entrance/evidence only, not facility offer.
- unnamed point with missing access/fee/operator => `candidate_confidence<=0.45`.
- customer-only/business parking => `facility_type=customer_only_parking`, hidden from default public layer unless restricted/private candidates filter is enabled.

### 6. User field evidence conflict: valet/drop-off/no ordinary parking

Evidence:

- DEV-47 field brief says user saw valet-only/drop-off/no ordinary parking/no clear spaces around Ocean Drive / Collins / Lincoln / 13th / 16th.
- Photo confirms PayByPhone + ParkMobile sign with `ZONE / LOCATION #40208`.

Rule:

- Add field evidence as `SourceObservation` with geometry/time/evidence file/OCR result.
- Any feature intersecting verified valet/drop-off/no-ordinary-parking evidence should become `needs_field_review` / `rule_status=conflict` and default-hidden or displayed with low confidence until signage/manual review confirms it.
- Payment zone/location id is payment evidence, not proof of physical availability.

## Recommended default map behavior

Default driver-facing layer should show:

- official layer 5 lots/garages;
- WPGMZA public garage/lot markers;
- layer 3/1-derived curb segments only after snapping/conflict checks;
- OSM only when tags indicate ordinary public access or when clearly labeled as low-confidence candidate.

Separate overlays should show:

- residential/regulatory/payment zones;
- meter/pay-station evidence;
- OSM entrances;
- valet/drop-off/loading/no-parking/user-evidence conflict areas.

## Data fields to preserve

For every downgraded/suppressed record preserve:

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
- `evidence_url` / field evidence link when available

## Follow-up implementation targets

DEV-63 implementation note: loader/importer now stores driver-facing `confidence` as capped `display_confidence` while preserving upstream `source_confidence` and separate `offer_confidence`. Miami Beach layer 7 regulatory zones are capped at `0.35`, generated layer 3 curb rows at `0.55`, and layer 1 meter/payment-equipment points at `0.5` until snapping/conflict checks pass. User field evidence and South Beach zone/location `40208` are imported as `SourceObservation` rows (`field_conflict_observation` / `payment_zone_observation`) and are not promoted to canonical `payment_url`, `booking_url`, or ordinary parking availability.

1. Data loader/importer: `display_confidence`, `source_confidence`, and `offer_confidence` split is implemented for Miami Beach ArcGIS regulatory/payment/generated-curb cases; next work is extending it to all connector families.
2. Data loader/importer: apply layer 7 and OSM access suppression rules before default map rendering.
3. Field evidence flow: basic DEV-49/DEV-47 `SourceObservation` ingestion for valet/drop-off/no ordinary parking and zone `40208` is implemented; next work is geometry-specific intersection/join with individual features.
4. QA: add golden fixtures around `miami-beach:arcgis:zones:386`, `miami-beach:arcgis:spaces:429`, customer-only OSM points, and a verified garage like G3/G4.

## Verification performed

- Read repo source of truth: `AGENTS.md`, `docs/PROJECT_OVERVIEW_RU.md`, `docs/parking_full_data_strategy.md`, `data/research/cities/miami.fl.json`.
- Checked `Referenss/`: absent in this checkout.
- Read Paperclip DEV-47 field-feedback brief via API and DEV-49 assignment.
- Audited local GeoJSON fixtures with Python bbox/count/property extraction.
- Preserved machine-readable audit in `data/research/field-audits/dev-49-south-beach-false-positive-audit.json`.

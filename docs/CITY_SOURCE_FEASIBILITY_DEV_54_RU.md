# DEV-54: feasibility matrix по источникам Miami vs NYC vs LA vs SF

Дата: 2026-07-03

Задача: сравнить official open data, ArcGIS/Socrata/CKAN, OSM/Geofabrik, operator/payment providers, legal/ToS risk, свежесть цен, наличие entrances/rates/rules и понять самый простой следующий путь ingestion.

## Использованные источники правды

- `AGENTS.md`
- `docs/PROJECT_OVERVIEW_RU.md`
- `docs/parking_full_data_strategy.md`
- `docs/REFERENCE_REPOS.md`
- `data/research/cities/{miami.fl,new-york-city.ny,los-angeles.ca,san-francisco.ca}.json`
- `data/research/inspections/*.json`
- `data/research/phase6-coverage-estimate-20260610.json`
- Машиночитаемый результат этой задачи: `data/research/city-source-feasibility-dev54.json`

Примечание по reuse: локальная папка `Referenss/` в `/Users/vladimirgrebennikov/Code/OpenParking` во время проверки не найдена. Для решения по reuse использованы `docs/REFERENCE_REPOS.md` и уже подключенные scripts/dependencies: Socrata connector, ArcGIS connector, WPGMZA importer, `osmtogeojson`, внешний `osm2pgsql`, OSM/Geofabrik workflow.

Примечание по live-probe: bounded terminal probe официальных API был выполнен 2026-07-03. `data.sfgov.org` локально не резолвился, NYC/LA Socrata вернули 403, Miami Beach ArcGIS TLS handshake timed out. Поэтому вывод ниже опирается на checked-in manifests/inspections и локальные fixture counts; перед реальным import нужно повторить dry-run в нормальной сетевой среде.

## Короткий вывод

1. Самый простой немедленный путь: San Francisco DataSF `Parking Meters` + `Meter Policies`.
   - Почему: official Socrata, высокий confidence, низкий legal risk, уже есть локальные fixtures и inspection evidence, понятные join keys для meter/rate schedules.
   - Лучшее применение: hardening canonical Socrata import, regression benchmark и проверка DB/upsert semantics.

2. Самый простой net-new город после уже существующих SF/Miami слоев: Los Angeles LADOT `Metered Parking Inventory & Policies` + `Parking Meter Occupancy`.
   - Почему: оба источника Socrata, inventory уже содержит координаты/rate range/rules, occupancy дает ранний availability signal без browser scraping.
   - Ограничение: начинать только с metered spaces + sensor subset; garages/lots/payment links отдельно.

3. NYC — очень ценный, но не самый простой первый path.
   - Сильная сторона: official meters + очень сильный signs/rules dataset.
   - Блокер простоты: нужен parser parking signs -> structured rules, segment construction и rate-zone join с DOT rates page.

4. Miami — главный продуктовый город, но не самый простой следующий source path.
   - Сильная сторона: Miami Beach official ArcGIS/WPGMZA уже дают хороший слой; OSM/Geofabrik Miami-Dade baseline уже есть.
   - Блокер простоты: City of Miami proper не имеет подтвержденного official street-meter point API; MPA/operator/payment links требуют browser/network/manual/legal review.

## Feasibility matrix

Оценки 1-5: 5 = проще/лучше/надежнее. `Overall` — практическая оценка для следующего ingestion шага, не продуктовая важность города.

| Rank immediate | Rank net-new | City | Best next source bundle | Connector | Official / legal | Tech ease | Coverage | Price freshness | Availability | Overall | Verdict |
| ---: | ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 2 | San Francisco | DataSF Parking Meters + Meter Policies | Socrata | 5 | 5 | 3 | 5 | 1 | 4.4 | Лучший immediate benchmark/canonical import path. |
| 2 | 1 | Los Angeles | LADOT Metered Parking Inventory & Policies + Parking Meter Occupancy | Socrata | 5 | 5 | 3 | 4 | 4 | 4.3 | Лучший net-new city path с rates + availability subset. |
| 3 | 3 | New York City | Parking Meters Locations and Status + Parking Regulation Locations and Signs | Socrata + rule parser | 4 | 3 | 4 | 3 | 1 | 3.7 | Ценный rules city, но сначала нужен parser/rate-zone join. |
| 4 | 4 | Miami | Miami Beach ArcGIS/WPGMZA + Miami-Dade + OSM/Geofabrik + MPA/operator backlog | ArcGIS/WPGMZA/OSM/browser | 3 | 3 | 4 | 3 | 1 | 3.3 | Продуктово важен, но следующий шаг сложнее из-за fragmentation/browser/legal/manual evidence. |

## City/source details

### San Francisco

Best bundle:

- `DataSF Parking Meters`
  - `source_url`: https://data.sfgov.org/Transportation/Parking-Meters/8vzz-qzz9
  - `api_url`: https://data.sfgov.org/resource/8vzz-qzz9.json
  - local fixture: `data/sf_parking_datasf.geojson` = 33,511 features
  - inspection: `data/research/inspections/san-francisco-8vzz-qzz9.socrata-inspection.json`
  - key facts: active meter inventory, `parking_space_id`, `post_id`, `blockface_id`, lat/lon; DataSF description says rate/operating schedules are separate.

- `DataSF Meter Policies`
  - `source_url`: https://data.sfgov.org/Transportation/Meter-Policies/qq7v-hds4
  - `api_url`: https://data.sfgov.org/resource/qq7v-hds4.json
  - inspection: `data/research/inspections/san-francisco-qq7v-hds4.socrata-inspection.json`
  - key facts: daily schedules with hourly rates, daily update process, join via `postid` / `parkingspaceid`.

Why easiest immediate:

- official city open data;
- Socrata connector path already exists;
- local fixtures and benchmark counts already exist;
- rates are structured enough for canonical `price_status=known_priced/known_free` after join;
- legal risk in manifest is `low_verify_license`, inspection license is public-domain style.

Gaps / do not overclaim:

- no real-time availability;
- garages/lots/entrances still need OSM/operator/manual enrichment;
- `payment_url` / `booking_url` should remain null unless a direct provider/checkout link is verified.

Recommended next dry-run:

```bash
npm run research:inspect:socrata:sf
npm run connector:socrata:dry-run -- --manifest=data/research/cities/san-francisco.ca.json --limit=5
```

### Los Angeles

Best bundle:

- `LADOT Metered Parking Inventory and Policies`
  - `source_url`: https://data.lacity.org/A-Livable-and-Sustainable-City/Parking-Meter-Inventory/s49e-q6j2
  - `api_url`: https://data.lacity.org/resource/s49e-q6j2.json
  - inspection: `data/research/inspections/los-angeles-s49e-q6j2.socrata-inspection.json`
  - key fields: `spaceid`, `blockface`, `metertype`, `ratetype`, `raterange`, `timelimit`, `latlng`.

- `LADOT Parking Meter Occupancy`
  - `source_url`: https://data.lacity.org/Transportation/LADOT-Parking-Meter-Occupancy/e7h6-4a3e
  - `api_url`: https://data.lacity.org/resource/e7h6-4a3e.json
  - inspection: `data/research/inspections/los-angeles-e7h6-4a3e.socrata-inspection.json`
  - key fields: `spaceid`, `eventtime`, `occupancystate`.

Why best net-new:

- official LADOT Socrata sources;
- no browser/parser needed for initial inventory/rates/occupancy;
- `spaceid` gives a clean join between inventory and occupancy;
- inventory includes rate range and policy-ish fields, so first user value appears quickly.

Gaps / do not overclaim:

- occupancy covers sensor-equipped spaces, not all LA parking;
- dataset itself warns posted signs prevail, so field/manual QA is needed for conflicts;
- off-street garages/lots and booking/payment links are not solved by these datasets.

Recommended next dry-run:

```bash
npm run research:inspect:socrata -- --manifest=data/research/cities/los-angeles.ca.json
npm run connector:socrata:dry-run -- --manifest=data/research/cities/los-angeles.ca.json --limit=5
```

Implementation shape:

- upsert `ParkingFacility` or street-meter entity rows from inventory;
- preserve `source_name`, `source_id=socrata:data.lacity.org:s49e-q6j2:{spaceid}`, `source_url`, `api_url`, `raw_properties`, `confidence`, `last_verified_at`, `data_as_of`;
- store occupancy as `SourceObservation` / availability signal keyed by `spaceid`, not as guaranteed free parking.

### New York City

Best bundle:

- `NYC Parking Meters Locations and Status`
  - `source_url`: https://data.cityofnewyork.us/Transportation/Parking-Meters-Locations-and-Status/693u-uax6
  - `api_url`: https://data.cityofnewyork.us/resource/693u-uax6.json
  - inspection: `data/research/inspections/new-york-city-693u-uax6.socrata-inspection.json`
  - key fields: `meter_number`, `status`, `pay_by_cell_number`, `meter_hours`, `on_street`, `side_of_street`, `from_street`, `to_street`, coordinates.

- `NYC Parking Regulation Locations and Signs`
  - `source_url`: https://data.cityofnewyork.us/Transportation/Parking-Regulation-Locations-and-Signs/nfid-uabd
  - `api_url`: https://data.cityofnewyork.us/resource/nfid-uabd.json
  - inspection: `data/research/inspections/new-york-city-nfid-uabd.socrata-inspection.json`
  - key fields: `record_type`, `on_street`, `from_street`, `to_street`, `side_of_street`, `sign_description`, `distance_from_intersection`, `arrow_direction`.

Why not first easiest:

- very strong official rules dataset, but raw signs are not ready user-facing parking rules;
- needs deterministic parser and golden cases for no standing, alternate side, commercial loading, school days, arrows/distance;
- rates require DOT rates page / rate-zone join;
- license in inspection is `unknown`, so keep `legal_risk=low_verify_license` until verified.

Recommended next path:

- separate parser issue, not a broad import issue;
- first create fixtures/golden cases from `nfid-uabd` sign rows;
- only after parser confidence promote structured `rule_status` beyond review.

### Miami

Best current components:

- `City of Miami Beach Parking GIS FeatureServer`
  - `source_url` / `api_url`: https://gis.miamibeachfl.gov/public/rest/services/mb/Parking/FeatureServer
  - current local counts after the 2026-07-15 refresh: 535 facility points, 532 lot/zone polygons, 10,998 raw parking-space records.

- `City of Miami Beach Parking Facilities WPGMZA`
  - `source_url`: https://www.miamibeachfl.gov/city-hall/parking/parking-garages-lot-locations/
  - `api_url`: https://www.miamibeachfl.gov/wp-json/wpgmza/v1/markers?map_id=17
  - local count: 74 garage/lot markers with rates/spaces/ParkMobile-zone evidence.

- `Miami-Dade County Parking Facilities`
  - `source_url`: https://www.miamidade.gov/global/service.page?Mduid_service=ser1478201414291250
  - static HTML parser / seed fixture path.

- OSM/Geofabrik Miami-Dade baseline
  - project doc count: 1,425 facility/entrance points, 185 parking lines, 6,821 parking polygons.

Why not easiest next:

- Miami is already the app default and product focus, but next gains are mostly enrichment, not simple official import;
- City of Miami proper still lacks a confirmed official street-meter point API;
- MPA commerce/operator/payment sources are browser-dynamic and require legal/ToS review;
- South Beach audit showed false positives: Miami Beach layer 7 zones are regulatory/rule boundaries, not ordinary parkable polygons.

Recommended Miami follow-up:

- create browser/manual evidence backlog for MPA commerce and operator/payment links;
- keep `payment_url`/`booking_url` null until direct checkout or approved provider deep-link is verified;
- keep OSM/operator candidates low-confidence unless access/private/customer-only and entrance evidence is checked.

## Source family decision

| Source family | Best use now | Risk | Recommendation |
| --- | --- | --- | --- |
| Socrata official city datasets | SF, LA, NYC meters/signs/rates/occupancy | API access may need app token/network revalidation; schema drift | Primary next ingestion path. Start SF/LA. |
| ArcGIS REST official city GIS | Miami Beach, future county/city GIS discoveries | Layer semantics can be misleading; geometry/null quirks | Use for official GIS, but classify entity_kind carefully. |
| CKAN/Data.gov | discovery/meta for datasets | Often points back to Socrata/ArcGIS; not always direct data | Use as discovery/provenance, not first connector target unless direct resource is clear. |
| OSM/Geofabrik | nationwide existence baseline, entrances, lots/polygons | ODbL attribution, incomplete tags, access/private ambiguity | Use as skeleton, never as authoritative rates/rules. |
| Operator/payment providers | payment_url/booking_url, monthly/event/private facilities | ToS/legal, dynamic pages, anti-bot, facility page != checkout | Browser/manual/partner path only; preserve evidence, do not promote until reviewed. |
| Browser/photo/manual evidence | conflict resolution, entrances, signs, payment checkout proof | slower, reviewer-dependent | Required for Miami operator/payment, NYC parser validation, garage entrances and false-positive audits. |

## Recommended next issue split

1. SF immediate hardening issue:
   - Run bounded Socrata dry-run/import for DataSF meters + policies.
   - Verify idempotent upsert and canonical price status.
   - Good acceptance: `npm run db:generate`, Socrata dry-run, fixture/import count check.

2. LA net-new ingestion issue:
   - Dry-run LADOT inventory + occupancy join on `spaceid`.
   - Store occupancy as observation/availability signal, not guaranteed open space.
   - Good acceptance: `npm run db:generate`, `connector:socrata:dry-run` for LA, repeated dry-run stable counts.

3. NYC rule-parser issue:
   - Build sign parser fixture/golden cases before import promotion.
   - Good acceptance: deterministic parser tests and review status for ambiguous signs.

4. Miami evidence issue:
   - Browser/manual evidence for MPA commerce, City of Miami proper meters, operator/payment direct-checkout classification.
   - Good acceptance: SourceObservation candidates with evidence hashes; no canonical `payment_url`/`booking_url` promotion without ToS/legal review.

## Final selection

If the board wants one concrete next source path: choose `San Francisco DataSF meters + policies` for immediate low-risk canonical import hardening.

If the board wants one concrete net-new city after existing Miami/SF groundwork: choose `Los Angeles LADOT inventory + occupancy`.

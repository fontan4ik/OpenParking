# QA golden plan: parking correctness examples

Status: draft deterministic QA plan for DEV-53, no app/code changes.
Date: 2026-07-03
Owner: OpenParking QA/DevOps

## Purpose

This plan turns the current known examples into deterministic regression checks for ParkingUSA parking correctness.

Acceptance fields covered for every golden example:

- map object type: facility / curb segment / regulatory zone / operator facility page;
- price and payment visibility: known price, paid-unknown, no direct payment link, app-zone-only, booking/reservation page;
- confidence: expected canonical confidence or QA confidence threshold;
- source/evidence: local fixture source id, official/source URL, evidence URL, or captured operator evidence.

The plan is intentionally fixture-first. It does not require production DB mutation, paid services, or live deployment changes.

## Deterministic test harness shape

Recommended future test entrypoint:

```bash
npm test -- tests/golden/parking-correctness.test.ts
```

Test mode:

1. Load local fixtures directly, not live network:
   - `data/miami_beach_parking_arcgis_facilities.geojson`
   - `data/miami_beach_parking_arcgis_lots_zones.geojson`
   - `data/miami_beach_parking_wpgmza.geojson`
   - `data/miami_beach_parking_arcgis_spaces.geojson`
   - future captured fixture for Dock/ParkMobile 1540 Broadway operator page.
2. Build the same canonical object semantics used by `/api/parking-index`:
   - point facilities remain facilities;
   - lot polygons remain parking zones/facility polygons only when layer 5 source says actual lot;
   - residential/regulatory zone polygons from ArcGIS layer 7 must not become ordinary available parking;
   - raw parking-space points from ArcGIS layer 3 are evidence/normalization inputs, not standalone canonical lots.
3. Run deterministic nearest/id lookups by stable `source_id` first, then bounded coordinate windows only as a secondary assertion.
4. Assert the acceptance fields below.
5. Fail on silent promotion of weak evidence:
   - no `payment_url` unless it is a direct checkout/payment URL;
   - ParkMobile/PayByPhone app-zone evidence can set provider/app-zone fields but not per-record direct payment URL;
   - operator facility/reservation pages are evidence candidates until legal/ToS and direct-checkout classification are explicit.

## Golden examples and expected assertions

### G1 — South Beach noisy regulatory zones must not look like ordinary parking

Risk being guarded:

Miami Beach ArcGIS layer 7 contains many small regulatory/residential parking-zone polygons around South Beach/Lummus/Ocean Drive. These can visually look like normal parking polygons if treated as generic `parking_zone` availability.

Fixture list:

- `data/miami_beach_parking_arcgis_lots_zones.geojson`
  - `miami-beach:arcgis:zones:345` near `[-80.130704, 25.781677]`
  - `miami-beach:arcgis:zones:218` near `[-80.130716, 25.781618]`
  - `miami-beach:arcgis:zones:344` near `[-80.131163, 25.781771]`
- Source/evidence URL in fixture:
  - `https://gis.miamibeachfl.gov/public/rest/services/mb/Parking/FeatureServer/7/query?...`

Expected result:

- map object type: regulatory/residential rule zone, not ordinary facility/lot availability;
- geometry: polygon allowed as rule boundary, but should be routed/styled separately from actual parking lots;
- price visibility: `price_status` should remain `known_unpriced` or `not_applicable`, never `known_priced`;
- payment visibility: no `payment_url`, no `booking_url`, no direct checkout;
- confidence: source confidence may be high for existence of the rule boundary (`>= 0.85`), but availability confidence for ordinary parking must be zero/false/not applicable;
- evidence: ArcGIS layer 7 FeatureServer URL plus `source_id` and raw `ZONE_`/`ZONE_TYPE` fields.

Regression failure examples:

- A layer 7 zone appears in the normal lots/facilities layer as a filled public parking area.
- A rule polygon gets a payment or booking CTA.
- The map/search result says the user can park anywhere inside the polygon without a facility/space/curb object.

### G2 — Ocean Drive: no ordinary parking inference from regulatory zones

Risk being guarded:

Ocean Drive has official meters/spaces and nearby lots, but regulatory zones around the corridor must not be interpreted as ordinary parking supply. The canonical result must distinguish real P2 lot/nearby meters from generic zone polygons.

Fixture list:

- Actual lot/facility positives:
  - `data/miami_beach_parking_wpgmza.geojson`, `miami-beach:wpgmza:138`, `P2 - Parking Lot`, `1 Ocean Drive`, ParkMobile zone `88502`, source evidence `https://www.miamibeachfl.gov/wp-json/wpgmza/v1/markers?map_id=17`
  - `data/miami_beach_parking_arcgis_lots_zones.geojson`, `miami-beach:arcgis:lots:6` and `miami-beach:arcgis:lots:7`, `P2`, `1 Ocean Drive`, `$2/hr`, ParkMobile `88502`, ArcGIS layer 5 evidence
  - `data/miami_beach_parking_arcgis_facilities.geojson`, `miami-beach:arcgis:lot:6`, point centroid for P2
- Ordinary-curb/zone negative controls around Ocean Drive:
  - `data/miami_beach_parking_arcgis_lots_zones.geojson`, `miami-beach:arcgis:zones:170`, `zones:162`, `zones:169`, `zones:163`, `zones:341`
  - `data/miami_beach_parking_arcgis_spaces.geojson`, examples around ParkMobile `88526`, e.g. `spaces:7859`, `spaces:7858`, `spaces:7860`

Expected result:

- map object type:
  - P2 records are actual `surface_lot` / facility-lot objects;
  - layer 7 zones are regulatory boundaries only;
  - layer 3 raw spaces can support curb-line derivation but must not become standalone lot polygons;
- price visibility:
  - P2 lot price visible as `$2/hr` with `price_status=known_priced`;
  - raw meters/spaces may show `paid_unknown` or app-zone evidence, not a fabricated hourly rate;
  - regulatory zones must not show ordinary facility pricing;
- payment visibility:
  - ParkMobile/PayByPhone provider/app-zone may be visible for P2 and space-zone evidence;
  - `payment_url` remains empty unless a direct checkout URL exists;
- confidence:
  - P2 official city fixture confidence expected `0.88` to `0.92` depending on source;
  - regulatory zones can have high source confidence but not high availability confidence;
- evidence:
  - City of Miami Beach WPGMZA marker API and ArcGIS layer 5/7 FeatureServer URLs.

Regression failure examples:

- Ocean Drive regulatory polygons appear as ordinary parking lots.
- Raw ArcGIS `spaces` points are counted as full facilities without grouping/curb semantics.
- P2 loses its price, ParkMobile zone, source URL, or confidence.

### G3 — ParkMobile zone 40208 sign: app-zone evidence is not a direct payment URL

Risk being guarded:

A sign or external page can prove that a ParkMobile zone exists, but a zone number alone is not a canonical direct payment/checkout URL. The UI should expose payment-provider evidence without overclaiming transactional completeness.

Fixture list:

- Create future fixture: `tests/fixtures/golden/parkmobile-zone-40208-sign.json`
- Minimum fields:
  - `example_id: parkmobile-zone-40208-sign`
  - `observed_zone: "40208"`
  - `provider: "ParkMobile"`
  - `evidence_type: "sign_or_public_page"`
  - `evidence_file` or `evidence_url`
  - `observed_location_text` and optional lat/lon if known
  - `direct_checkout_url: null`
- Current web-search supporting lead found during planning:
  - University of Louisville visitor parking pages mention ParkMobile app payment and ZIP/location context `40208`.
  - Search did not find a reliable public source where `40208` is clearly the ParkMobile zone number; treat this as requiring captured sign evidence or a verified ParkMobile page before asserting zone semantics.

Expected result:

- map object type: payment-app zone evidence / source observation, not automatically a parking facility;
- price visibility: unknown unless the sign/evidence explicitly states rate/hours;
- payment visibility:
  - provider `ParkMobile` may be visible;
  - zone `40208` may be visible only after evidence confirms it is the zone number, not merely address/ZIP/text;
  - `payment_url` must remain null/empty unless there is a direct checkout/payment deep link;
- confidence:
  - `0.35` to `0.55` for raw user/photo/sign evidence before official/provider validation;
  - raise only after verified provider/city source match;
- evidence:
  - screenshot/photo hash or captured HTML; source URL if public; extraction timestamp.

Regression failure examples:

- Treating `40208` as a ParkMobile zone because it appears in an address/ZIP.
- Creating a canonical facility from a payment sign alone without geometry/source backing.
- Marking payment completeness as true without a direct payment URL.

### G4 — NYC Dock Parking / 1540 Broadway: garage rates and entrance evidence

Risk being guarded:

Operator/aggregator pages may expose a real garage, rates, entrance address, amenities, and booking links. ParkingUSA should preserve evidence and classify it carefully: facility existence and operator page can be high confidence, but canonical `payment_url`/`booking_url` promotion depends on direct link classification and legal/ToS review.

Fixture list:

- Create future fixture: `tests/fixtures/golden/dock-1540-broadway-parkmobile.json`
- Minimum fields from captured operator page/search evidence:
  - `example_id: dock-1540-broadway-garage`
  - `name: "Dock Parking - 1540 Broadway Garage LLC"`
  - `operator: "Dock Parking"`
  - `display_address: "1540 Broadway, New York, NY 10036"`
  - `entrance_address: "164 W. 46th St., New York, NY 10036"` if confirmed by captured page
  - `source_url: "https://parkmobile.io/parking/locations/ny/new-york-city-parking/parking-lot/dock-parking-1540-broadway-garage-llc"`
  - `reservation_url: "https://app.parkmobile.io/reservation/43948"`
  - `rate_summary: "prices from $30"` if confirmed by captured page
  - `amenities: ["EV charging", "24/7 access", "valet service"]` if confirmed by captured page
  - `capture_status: "needs_browser_capture"` until raw HTML/screenshot is stored
- Existing NYC official-source context:
  - `data/research/cities/new-york-city.ny.json`
  - NYC Parking Meters Locations and Status: `https://data.cityofnewyork.us/resource/693u-uax6.json`
  - NYC Parking Regulation Locations and Signs: `https://data.cityofnewyork.us/resource/nfid-uabd.json`

Expected result:

- map object type: garage/facility, not curb segment or regulatory sign;
- price visibility:
  - show captured rate summary as operator evidence with status `variable` or `known_priced` only if parser captures the exact current rate conditions;
  - do not mix garage operator rates with NYC street-meter/regulation datasets;
- payment/booking visibility:
  - ParkMobile location page and reservation page can be stored as evidence/booking candidate;
  - promote `booking_url` only after direct reservation URL classification and legal/ToS review;
  - `payment_url` should not be inferred from general operator page;
- confidence:
  - `>= 0.75` for existence when captured from a stable operator page plus address/entrance;
  - lower confidence for price until timestamped capture and rate terms are parsed;
- evidence:
  - raw captured HTML/screenshot, search result snippet, ParkMobile location/reservation URLs, and NYC official datasets as negative/source separation context.

Regression failure examples:

- Classifying 1540 Broadway as a street meter because NYC meter datasets exist nearby.
- Losing the entrance address (`164 W. 46th St.`) or mixing it with display address.
- Showing stale/uncaptured rates as authoritative without evidence timestamp.
- Promoting a generic location page as direct `payment_url`.

## Fixture list summary

| Fixture | Current / future | Stable keys | Primary assertions |
| --- | --- | --- | --- |
| `data/miami_beach_parking_arcgis_lots_zones.geojson` | current | `miami-beach:arcgis:zones:345`, `zones:218`, `zones:170`, `lots:6`, `lots:7` | layer 7 regulatory zones are not ordinary parking; layer 5 P2 lot is actual lot |
| `data/miami_beach_parking_arcgis_facilities.geojson` | current | `miami-beach:arcgis:lot:6`, nearby `meter:*` ids | P2 point facility and meters keep distinct facility types/statuses |
| `data/miami_beach_parking_wpgmza.geojson` | current | `miami-beach:wpgmza:138` | P2 has price/provider/zone evidence but no direct payment URL |
| `data/miami_beach_parking_arcgis_spaces.geojson` | current raw fixture | `spaces:7859`, `spaces:7858`, `spaces:7860`, `spaces:9739` | raw spaces are evidence/curb inputs, not standalone lot/facility polygons |
| `tests/fixtures/golden/parkmobile-zone-40208-sign.json` | future | `example_id=parkmobile-zone-40208-sign` | zone evidence requires confirmed sign/provider evidence; no direct URL inference |
| `tests/fixtures/golden/dock-1540-broadway-parkmobile.json` | future | `example_id=dock-1540-broadway-garage`, reservation id `43948` | garage/facility, entrance/rates/evidence preserved; no street-meter confusion |

## Suggested implementation tasks after plan approval

1. Add `tests/fixtures/golden/*.json` with raw/captured evidence metadata for the two examples not currently in local fixtures.
2. Add focused Vitest golden tests that load fixtures directly and assert object type, price/payment fields, confidence, source/evidence.
3. Add a small deterministic helper for source-id and coordinate-window lookups if existing loaders do not expose one.
4. Add a bounded browser-capture task for ParkMobile/Dock pages if legal/ToS review allows storing screenshots/HTML as test evidence.

## Verification notes from planning heartbeat

Read-only checks performed while preparing this document:

- inspected `docs/PROJECT_OVERVIEW_RU.md` and `docs/README.md`;
- inspected `package.json` scripts;
- inspected current git status before edits;
- inspected local Miami Beach fixtures with Python for source ids, properties, prices, confidence, evidence URLs, and nearby examples;
- searched local repo for existing 40208 / 1540 Broadway fixtures: none found;
- used web search for ParkMobile Miami Beach ranges and Dock 1540 Broadway leads;
- direct `curl`/Python fetches to ParkMobile and NYC Socrata returned HTTP 403 from this environment, so live page contents must be captured by browser/manual fixture flow before hard assertions for those pages.

No dev server was started for this planning task.

# DEV-51: Payment/rate model for ParkMobile, PayByPhone, and garage tariffs

Date: 2026-07-03
Scope: data model/API implications and fixture proposal only. This does not change live Prisma schema or import behavior yet.

## 1. Why the current fields are not enough

Current canonical rows already preserve `source_name`, `source_id`, `source_url`, `api_url`, `payment_url`, `booking_url`, `raw_properties`, `confidence`, `last_verified_at`, `data_as_of`, `price_status`, and `rule_status`.

That works for simple display strings like `charge = "$2/hr"`, but it is not enough for:

- ParkMobile / PayByPhone payment zones where the important identifier is a `zone_location_id` / zone number rather than a direct checkout URL.
- Multiple allowed payment channels: app, web, SMS/text, phone/call.
- Garage tariffs with time brackets, flat daily caps, early-bird windows, event/overnight/monthly rates, taxes, fees, oversize/luxury/exotic/bicycle modifiers, and no-re-entry rules.
- Scenario pricing where the observed price depends on arrival/departure datetime and source flow.
- Keeping payment provider evidence separate from canonical `payment_url` promotion. A zone id or provider page is useful evidence, but it should not be treated as a verified direct checkout link.

## 2. Evidence baseline used for this proposal

### Miami Beach / South Beach examples

Local fixture examples already exist in:

- `data/miami_beach_parking_arcgis_facilities.geojson`
- `data/miami_beach_parking_wpgmza.geojson`
- `data/research/cities/miami.fl.json`

Concrete examples:

- `miami-beach:arcgis:lot:1` / G1, `200 7th St`: `HOURLY_RATE = "0-4hrs $2/hr; 4-15hrs $8+$1/hr; 15-24hrs $20"`, `EVENT_RATE = "$15/vehicle Fri, Sat & Sun 8PM-5AM"`, `ParkMobile = "88001"`, `SPACES = 659`.
- `miami-beach:wpgmza:138` / P2 Parking Lot, `1 Ocean Drive`: `Hourly Rate = "$2.hr"`, `Maximum Time = "10 hours"`, `Park Mobile = "88502"`, and canonical fields set `payment_provider = "ParkMobile / PayByPhone"`, `payment_app_url = "https://www.paybyphone.com/park-in-miami-beach"`; legacy `www2` values are normalized at load time.
- Official Miami Beach mobile-app page states that PayByPhone is supported in Miami Beach and that ParkMobile payment by call is available; this supports modeling app/web/call channels as provider/payment facts, not direct per-stall checkout links.

Requested South Beach zone example `40208` is included below as a low-confidence fixture shape until a source/API/browser observation verifies provider, geography, rates, and allowed methods.

### NYC Dock 1540 Broadway example

Public search/evidence found a ParkMobile page for `Dock Parking - 1540 Broadway Garage LLC` at `164 West 46th Street, New York, NY`, describing EV charging, 24/7 access, valet service, and prices from `$30`. The same location appears in Dock/ParkWhiz/parking pages as a bookable garage. This is enough to model a fixture candidate, but not enough to promote all dynamic checkout details as authoritative without browser/network evidence and ToS review.

Use this evidence class as `operator_public_site` / `payment_operator_public_site` with `legal_risk = medium_terms_review`, and store dynamic details as `SourceObservation` until verified.

## 3. Proposed canonical concepts

Keep the existing flat fields for backward compatibility:

- `charge`: short human summary for the map card.
- `baseHourlyRate`: simplest numeric rate when one exists.
- `paymentUrl` / `bookingUrl`: only direct, stable, legally usable links.
- `rawProperties`: original evidence and full provider payload.

Add normalized child concepts in the next schema migration instead of overloading `ParkingFacility.charge`.

### 3.1 Payment zone / payment method

`ParkingPaymentOption` (or equivalent):

- `id`
- `facilityId` / `curbSegmentId` / `parkingZoneId` nullable target pointers
- `sourceName`, `sourceId`, `sourceUrl`, `apiUrl`, `evidenceUrl`
- `provider`: `parkmobile`, `paybyphone`, `passport`, `flowbird`, `operator_site`, etc.
- `zoneLocationId`: provider zone/location number as string, e.g. `88001`, `88502`, `40208`
- `paymentMethods`: string array or enum set: `app`, `web`, `text`, `call`, `kiosk`, `onsite`, `cash`, `card`, `permit`
- `paymentUrl`: direct checkout URL only when verified
- `providerLandingUrl`: provider/location/search page when not a direct checkout
- `bookingUrl`: reservation/prepay URL when distinct from pay-now
- `phone`, `smsCode`, `displayInstructions`
- `rawProperties`, `confidence`, `lastVerifiedAt`, `dataAsOf`
- uniqueness: `(provider, zoneLocationId, targetType, targetSourceName, targetSourceId)` when target exists; otherwise `(provider, zoneLocationId, sourceName, sourceId)`

Rule: a zone id alone can raise `payment_provider_status` but should not set canonical `payment_url` unless a real checkout/deep link is verified.

### 3.2 Rate plan and rate rules

`ParkingRatePlan`:

- target pointers to facility/curb/zone
- `sourceName`, `sourceId`, `sourceUrl`, `apiUrl`, `evidenceUrl`
- `ratePlanType`: `meter`, `garage_public`, `daily`, `early_bird`, `event`, `monthly`, `overnight`, `valet`, `permit`, `reservation_quote`
- `currency`: default `USD`
- `summaryText`: original concise summary (`0-4hrs $2/hr; 4-15hrs $8+$1/hr; 15-24hrs $20`)
- `effectiveFrom`, `effectiveTo`, `observedAt`, `dataAsOf`, `lastVerifiedAt`
- `priceStatus`: `known_priced`, `known_free`, `variable`, `stale`, `unknown`
- `confidence`, `rawProperties`

`ParkingRateRule`:

- `ratePlanId`
- `ruleKind`: `hourly_bracket`, `flat_daily`, `daily_cap`, `early_bird`, `event`, `monthly`, `fee`, `tax`, `surcharge`, `restriction`
- `amountCents`, `currency`
- `unit`: `hour`, `entry`, `day`, `month`, `session`, `percent`
- `durationStartMinutes`, `durationEndMinutes`
- `daysOfWeek`, `startTime`, `endTime`, `entryStartTime`, `entryEndTime`, `exitByTime`
- `maxDurationMinutes`
- `appliesTo`: `standard_vehicle`, `oversize`, `luxury`, `exotic`, `bicycle`, `ev_charging`, `monthly`, `reservation`, etc.
- `inclusiveOfTax`, `taxPercent`, `feeType`, `isMandatory`
- `reentryAllowed` boolean nullable
- `notes`, `rawText`, `rawProperties`

### 3.3 Restrictions/modifiers

For modifiers that are not simple prices, use either `ParkingRateRule(ruleKind = surcharge/restriction)` or a small `ParkingRestriction` table later:

- `no_reentry`
- `oversize_fee`
- `luxury_fee`
- `exotic_fee`
- `bicycle_rate`
- `monthly_available`
- `ev_charging_fee`
- `height_clearance`
- `valet_required`
- `reservation_required`

## 4. API implications

Keep existing `/api/facilities`, `/api/parking-index`, and `/api/geojson/[layer]` compatible. Add optional nested objects only when available:

```json
{
  "charge": "0-4hrs $2/hr; 4-15hrs $8+$1/hr; 15-24hrs $20",
  "price_status": "known_priced",
  "payment_provider": "ParkMobile / PayByPhone",
  "parkmobile_zone": "88001",
  "payment_options": [
    {
      "provider": "parkmobile",
      "zone_location_id": "88001",
      "methods": ["app", "call"],
      "provider_landing_url": "https://parkmobile.io/",
      "payment_url": null,
      "confidence": 0.9
    }
  ],
  "rate_plans": [
    {
      "rate_plan_type": "garage_public",
      "summary_text": "0-4hrs $2/hr; 4-15hrs $8+$1/hr; 15-24hrs $20",
      "rules": [
        { "rule_kind": "hourly_bracket", "duration_start_minutes": 0, "duration_end_minutes": 240, "amount_cents": 200, "unit": "hour" },
        { "rule_kind": "hourly_bracket", "duration_start_minutes": 240, "duration_end_minutes": 900, "amount_cents": 100, "unit": "hour", "base_amount_cents": 800 },
        { "rule_kind": "flat_daily", "duration_start_minutes": 900, "duration_end_minutes": 1440, "amount_cents": 2000, "unit": "day" }
      ]
    }
  ]
}
```

`/api/stats` should eventually split:

- `priced_record_count`
- `structured_rate_plan_count`
- `payment_zone_count`
- `direct_payment_url_count`
- `booking_url_count`
- `payment_provider_evidence_count`

This avoids treating provider evidence or zone ids as direct payment completeness.

## 5. Import/dry-run behavior

For the first implementation pass:

1. Parse existing local Miami Beach rate strings into dry-run `rate_plans` only.
2. Preserve original strings in `raw_properties` and existing `charge`.
3. Upsert normalized rate/payment rows idempotently by source and target key.
4. Keep dynamic operator/ParkMobile/PayByPhone pages as `SourceObservation` until legal/ToS review and browser evidence are attached.
5. Dry-run output must report: records seen, rate plans normalized, payment options normalized, skipped, warnings, zero DB mutation counts.
6. Import mode must write `DataSource`, `ImportRun`, normalized child rows, and leave the canonical facility row untouched unless confidence and source precedence allow promotion.

## 6. Fixture proposal

Machine-readable fixture proposal lives in:

`data/research/payment-rate-model-fixtures-dev51.json`

It includes three fixture classes:

1. `payment_zone_only`: requested South Beach `zone_location_id = 40208` shape, low confidence until verified.
2. `official_city_garage_tariff`: Miami Beach G1 / ParkMobile zone `88001` with hourly brackets, daily cap, event flat rate, app/call methods.
3. `operator_dynamic_garage_tariff`: Dock Parking 1540 Broadway candidate with ParkMobile/Dock/ParkWhiz evidence, dynamic booking/payment treatment, and placeholders for early bird, taxes/fees, oversize/luxury/exotic/bicycle/monthly/no-re-entry observations.

## 7. Acceptance for the next implementation issue

- Prisma migration adds child payment/rate tables without removing existing fields.
- `npm run db:generate` passes after schema change.
- A fixture/dry-run parser reads `data/research/payment-rate-model-fixtures-dev51.json` and reports zero mutations in dry-run.
- Existing `/api/parking-index` remains backward compatible.
- At least Miami Beach G1 and P2 records expose `payment_options` and `rate_plans` in a fixture API smoke.
- Dynamic Dock/ParkMobile/PayByPhone examples remain `pending_review` / medium legal risk until browser/network evidence and ToS review are attached.

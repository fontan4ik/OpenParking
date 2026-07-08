# DEV-50: UX proposal/backlog для честного отображения unknown price/source/payment/confidence

Дата: 2026-07-03
Статус: partially implemented for main map UI/API on 2026-07-07; remaining detail/evidence work stays backlog
Связано: DEV-50, parent DEV-47

## 1. Цель

Сделать так, чтобы карточка парковки в OpenParking/ParkingUSA не выглядела как verified offer, если цена неизвестна, источник неполный, ссылка оплаты недоступна или confidence низкий.

Главный принцип UX: существование парковки, известная цена, доступная оплата и уверенность в данных — это разные факты. UI должен показывать их раздельно.

## 2. Что уже есть в текущем UI/API

По текущему коду `apps/frontend/app/map/page.tsx`, `apps/frontend/components/ParkingMap.tsx` и `apps/frontend/lib/data-quality.ts` уже есть база:

- фильтры `displayMode`: all / segments / zones / points / both;
- фильтр `facility_type`;
- фильтр цены `known` / `unknown` / `free`, где known = `known_priced` или `known_free`;
- фильтр `source`;
- driver-facing фильтр `trust=reliable|likely|all|review|conflict`;
- фильтр `confidence`: high / medium / low / review;
- режимы сайдбара `Find parking` и `Data quality`, где quality mode раскрывает health metrics и review/conflict сценарии;
- карточки показывают `source`, confidence %, `price_status`, freshness;
- detail panel показывает pricing, details, data quality, source ID, links, user report form;
- links panel уже различает source/evidence/payment/payment app/booking и показывает `Недоступно`, если ссылки нет.

Часть DEV-50 уже закрыта на уровне поиска и списка: пользователь может начать с надежных/вероятных парковок, а затем явно переключиться в `Needs review` или `Conflicts`. Оставшаяся проблема DEV-50 - довести те же semantics до popup/detail header, confidence reasons, payment-link disabled copy и будущей review/admin панели.

## 3. Новая trust-модель для UI

Ввести в UI видимый trust state, который строится из существующих полей и будущих optional metadata.

| Trust state | Когда показывать | Текст EN | Текст RU | CTA/тон |
| --- | --- | --- | --- | --- |
| `verified_offer` | `price_status in known_priced/known_free`, есть source/evidence, confidence >= 0.75, ссылка оплаты/брони либо не нужна, либо проверена как direct/app-zone | Verified parking info | Данные подтверждены | нормальный trusted тон |
| `known_place_unpriced` | парковка/зона найдена, но `price_status=known_unpriced` или `unknown` | Known place · price unknown | Место найдено · цена неизвестна | нейтральный/серый, без offer-ощущения |
| `paid_amount_unknown` | `price_status=paid_unknown` или `fee=yes` без суммы | Paid · amount unknown | Платно · сумма неизвестна | amber/review |
| `payment_unavailable` | нет `payment_url`/`booking_url`, payment app only, или link type не direct checkout | Payment link unavailable | Ссылка оплаты недоступна | disabled CTA + explain why |
| `needs_review` | `enrichment_status=needs_review/stale/conflict`, `confidence < 0.7`, stale facts, нет source_url | Needs verification | Нужна проверка | amber/red, user report CTA |
| `regulatory_not_offer` | regulatory/residential/permit zone, `price_status=not_applicable` | Regulatory zone, not a parking offer | Зона правил, не отдельная парковка | zone tone, no offer CTA |

Правило против ложного offer:

- если цена unknown/stale/variable/paid_unknown — не использовать визуальный стиль “verified offer”;
- если payment link unavailable — не показывать active primary CTA “Pay/Book”; только disabled/secondary row “Недоступно” + объяснение;
- если source/evidence отсутствует — показывать `нужен источник`, даже если есть название/координаты;
- если confidence низкий — показывать reasons и user report CTA.

## 4. Layer filters: facilities / curb / zones / uncertain / valet

Нужен product-level фильтр слоев поверх текущего `displayMode`.

### 4.1 Facilities

Показывает реальные parking facilities/candidates:

- point facilities from `/api/geojson/facilities`;
- parking-lot/garage polygons из zones, если это actual parking lot/garage, а не regulatory zone;
- типы: `garage`, `lot`, `surface_lot`, `parking_lot`, `parking`, `street_meter`, `meter`, `facility`, plus existing city-specific equivalents.

Acceptance:

- regulatory/residential zones не попадают в facilities;
- карточка facilities всегда показывает existence/source/price/payment trust state.

### 4.2 Curb

Показывает curb/street-side правила:

- `/api/geojson/segments`;
- derived lines из street-side points/rows;
- street-meter rows, если они представлены как линии.

Acceptance:

- curb не выглядит как “гараж/lot offer”;
- в detail panel основной блок — правила, source, confidence, freshness, а не кнопка оплаты.

### 4.3 Zones

Показывает parking zones и regulatory/permit/rate areas:

- `/api/geojson/zones`;
- actual lot polygons отдельно помечаются как facility-like;
- residential/regulatory zones явно получают trust state `regulatory_not_offer`.

Acceptance:

- текст рядом с зоной объясняет: “это зона правил/permit/rate area, не гарантия свободной парковки на всей площади”.

### 4.4 Uncertain

Показывает рабочую очередь сомнительных/неполных объектов:

- `price_status in unknown, known_unpriced, paid_unknown, variable, stale`;
- `rule_status in unknown, partial, stale`;
- `enrichment_status in needs_price, needs_rules, needs_payment_link, needs_source_url, needs_review, stale, conflict`;
- `confidence < 0.7`;
- нет `source_url` / `evidence_url` для не-derived фактов;
- нет payment/booking link при наличии payment provider/zone hints.

Acceptance:

- это не просто confidence filter; фильтр должен находить объекты, где пользователю или команде нужно enrichment/review действие.

### 4.5 Valet

Показывает valet как first-class layer:

- `facility_type=valet` или `access=valet-only`;
- future fields: `valet=true`, `valet_dropoff_address`, `valet_phone`, `valet_operator`;
- fallback detection only as display aid: name/operator/access contains valet.

Acceptance:

- valet не смешивается с обычными public garages/lots без явной метки;
- если valet цена unknown, trust state должен быть `known_place_unpriced` или `needs_review`, а не offer.

## 5. Evidence panel

В detail panel нужен отдельный evidence/data-quality блок, не спрятанный в обычных links.

Минимальные поля:

- `source_name`;
- `source_id`;
- `parkingusa_id`, если есть;
- `zone_id` / `location_id` / `parkmobile_zone` / provider lot ID, если есть;
- `source_url`;
- `api_url`;
- `evidence_url` / evidence file/hash;
- `payment_provider`;
- `payment_url` / `booking_url`;
- payment link classification: `direct_checkout`, `facility_page`, `app_zone`, `operator_search`, `unavailable`, `unknown`;
- `confidence` plus confidence reasons;
- `last_verified_at` / `data_as_of`;
- `price_status`, `rule_status`, `enrichment_status`.

UX copy для absent links:

- source URL missing: “Источник не прикреплен — нужна проверка”.
- payment URL missing: “Прямая ссылка оплаты не найдена. Может быть доступна через приложение/зону оплаты.”
- evidence missing: “Доказательство не сохранено — не повышать confidence автоматически.”

## 6. Confidence reasons

Пользователю нужен не только процент, но и объяснение.

Предлагаемый optional API field:

```json
{
  "confidence": 0.62,
  "confidence_reasons": [
    "OSM/Geofabrik baseline confirms candidate parking geometry",
    "No official source URL attached",
    "Price is unknown",
    "Payment provider exists, but no direct checkout URL verified"
  ]
}
```

Если `confidence_reasons` еще нет, frontend может временно выводить derived reasons из текущих полей:

- high source class / official source -> “официальный или проверенный источник”;
- `source_url` exists -> “есть ссылка на источник”;
- `evidence_url` exists -> “есть evidence”;
- `price_status` unknown/stale -> “цена не подтверждена”;
- `payment_url` absent -> “нет прямой ссылки оплаты”;
- `confidence < 0.7` -> “низкая/средняя уверенность, нужна проверка”.

## 7. API/data contract backlog

Не ломать существующие публичные API. Добавлять optional fields и derived UI logic.

Будущие optional fields:

- `parkingusa_id`;
- `location_id`;
- `zone_id`;
- `trust_state` или frontend-derived equivalent;
- `confidence_reasons: string[]`;
- `payment_link_status`;
- `payment_link_type`;
- `payment_provider_id` / `provider_zone_id`;
- `is_valet`;
- `valet_dropoff_address`;
- `review_reason_codes: string[]`.

Backwards-compatible requirement:

- если этих полей нет, UI должен честно работать на текущих `price_status`, `rule_status`, `enrichment_status`, `source_url`, `evidence_url`, `payment_url`, `booking_url`, `payment_app_url`, `payment_provider`, `confidence`.

## 8. Implementation backlog

### DEV-50A — Trust-state copy/model spec

Scope:

- зафиксировать trust-state enum, RU/EN copy, CSS tone mapping;
- описать какие states блокируют verified-offer вид.

Acceptance:

- unknown price/payment unavailable never uses verified/primary offer tone;
- regulatory zone text clearly says it is not a standalone parking offer.

### DEV-50B — Product layer filters

Scope:

- добавить фильтры `facilities`, `curb`, `zones`, `uncertain`, `valet`;
- не ломать текущий `displayMode`/API compatibility.

Acceptance:

- facilities excludes regulatory zones;
- uncertain aggregates price/rule/enrichment/source/payment/confidence gaps;
- valet is visible as separate first-class filter even when count is 0.

### DEV-50C — Card/popup/detail anti-false-offer styling

Scope:

- добавить trust badge в facility cards, popup и detail header;
- disabled/secondary payment UI для unavailable links;
- warning row для unknown/stale/low-confidence states.

Acceptance:

- пользователь видит difference between “known parking candidate” and “verified priced offer” before opening detail panel;
- no active primary Pay/Book CTA when no direct payment/booking link exists.

### DEV-50D — Evidence panel

Scope:

- отдельный evidence panel in detail;
- поля source URL, evidence URL, source/location/zone/provider IDs, payment provider, confidence reasons.

Acceptance:

- source ID and zone/location ID visible when present;
- absent source/payment/evidence explains what is missing;
- current safe-link sanitization remains enforced.

### DEV-50E — Optional API derived metadata

Scope:

- optional helper/loader fields for trust state, confidence reasons, payment link classification;
- tests for derivation semantics.

Acceptance:

- old GeoJSON fields still work;
- `/api/facilities`, `/api/parking-index`, `/api/geojson/[layer]` keep backwards-compatible responses;
- typecheck and focused tests cover known/unknown/payment-unavailable cases.

### DEV-50F — QA/browser verification

Scope:

- manual/browser smoke for Miami and SF map;
- verify filters, counters, detail panel, popup, unavailable payment states.

Acceptance:

- Tester verifies with real browser/system checks and reports only;
- implementation owner fixes follow-up issues separately.

## 9. Suggested first implementation slice

Implemented first slice on 2026-07-07:

1. Added frontend-derived trust helpers in `apps/frontend/lib/data-quality.ts`: driver confidence, review/conflict detection, trust label/rank, trust filter.
2. Added backward-compatible `/api/facilities?trust=reliable|likely|all|review|conflict`; existing filters remain valid.
3. Reworked the main map sidebar into search-first controls with `Find parking` / `Data quality`, trust presets, price/type chips, source/confidence advanced filters and sort modes.
4. Facility cards now show trust badges before detail-panel open, so a candidate/review/conflict object is not visually identical to a reliable offer.

Remaining backlog:

1. Add the same trust badge and reasons to popup/detail header.
2. Add disabled explanatory payment row when no `payment_url`/`booking_url` exists.
3. Persist optional `trust_state`, `confidence_reasons` and `review_reason_codes` only after loader/API schema design.
4. Build the future admin/review UI for conflict and low-confidence queues.

This keeps production/deploy/secrets untouched and does not promote payment/booking candidates into canonical links.

## 10. Non-goals for DEV-50

- No production/deploy changes.
- No secrets/token changes.
- No payment-provider scraping.
- No canonical promotion of payment/booking links.
- No DB schema migration unless opened as separate implementation task.

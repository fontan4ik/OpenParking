# ParkingUSA — поток пользовательских полевых доказательств v1

Дата: 2026-07-03
Статус: дизайн/backlog, без реализации в этом срезе.
Задача: DEV-52 — OpenParking product: user field evidence ingestion flow.

## 1. Цель

Спроектировать первый продуктовый поток, где пользователь может прислать полевое доказательство по парковке:

- фото знака, тарифа, паркомата, гаража или скрин оплаты;
- скриншот страницы оператора/приложения оплаты;
- голосовую заметку;
- точку на карте или новый parking candidate;
- ручной комментарий, цену, правила, payment/booking URL.

Результат не должен сразу менять canonical parking record. Он создает `SourceObservation` / correction candidate с evidence, статусом review, confidence и явной связью с ParkingUSA объектом. После OCR/metadata/manual review подтвержденные facts могут повысить confidence и обновить canonical fields.

## 2. Что уже есть

Текущая реализация уже дает базовую, безопасную точку входа:

- UI detail panel: форма `Suggest price or info` / `Предложить цену или данные` в `apps/frontend/app/page.tsx`.
- API: `POST /api/observations` в `apps/frontend/app/api/observations/route.ts`.
- Data model: `SourceObservation` в `apps/backend/prisma/schema.prisma`.
- Поведение: создается observation с `sourceName = User Report`, `entityType = user_report`, `confidence = 0.35`, `status = pending_review` в `rawProperties`.
- Безопасность: canonical `ParkingFacility` / `CurbSegment` / `ParkingZone` не меняются до review.

Ограничения текущего MVP:

- нет upload endpoint для binary photo/screenshot/audio;
- `evidence_url` — только ссылка, а не сохраненный asset;
- нет OCR/transcript pipeline;
- нет review UI;
- нет correction object/status history;
- нет автоматического confidence recompute.

## 3. Поток v1

```text
User evidence
  -> client-side capture / manual fields
  -> POST /api/observations или future evidence upload endpoint
  -> SourceObservation(status=pending_review, confidence=0.20-0.45)
  -> OCR / EXIF / GPS / audio transcript / URL metadata extraction
  -> review queue
  -> reviewer chooses: reject, needs_more_info, accept_observation, promote_correction
  -> canonical ParkingFacility/CurbSegment/ParkingZone update only after acceptance
  -> confidence update + audit note
```

### 3.1 Входы

| Input | Пример | Первичная обработка | Начальный confidence |
| --- | --- | --- | ---: |
| Фото | знак с тарифом, паркомат, въезд в гараж | EXIF/GPS, OCR, image hash, optional manual crop | 0.30 |
| Скриншот | экран оплаты, сайт оператора | OCR, URL/app metadata если пользователь добавил ссылку | 0.30 |
| Голос | “здесь $4/час до 6 вечера” | speech-to-text transcript, language detect | 0.20 |
| Точка на карте | новое место или correction geometry | координаты + selected layer context | 0.25 |
| Ручное поле | price/rules/link/comment | validation + normalization hints | 0.35 |
| Source URL | страница оператора/города | fetch metadata/content hash when legally safe | 0.40 |

Начальный confidence ниже official/imported sources. Он повышается только после совпадения с геометрией, OCR/transcript quality, source reliability и manual review.

## 4. Data model mapping без schema change

Для первой версии не требуется менять Prisma schema. Используем текущий `SourceObservation` и кладем расширенные данные в `rawProperties`.

### 4.1 `SourceObservation`

| Поле | Значение v1 |
| --- | --- |
| `sourceName` | `User Report` или будущий verified contributor/source name |
| `sourceId` | стабильный id вида `user-report:<entity>:<timestamp>`; для upload — asset/correction id |
| `entityType` | `user_report`, `field_evidence`, `map_correction`, `new_parking_candidate`, `price_correction`, `rule_correction`, `payment_link_correction` |
| `entitySourceId` | `<parking_source_name>:<parking_source_id>` или temporary candidate id |
| `rawProperties.status` | `pending_review`, `ocr_pending`, `needs_manual_review`, `accepted`, `rejected`, `promoted`, `needs_more_info` |
| `rawProperties.evidence_kind` | `photo`, `screenshot`, `voice`, `map_point`, `text`, `url` |
| `rawProperties.extracted_facts` | normalized candidate facts: price, hours, rule text, payment URL, booking URL, operator, capacity, geometry |
| `rawProperties.review` | reviewer id/name, decision, reason, reviewed_at |
| `rawProperties.asset_refs` | future file paths/object keys, hashes, mime type, OCR/transcript refs |
| `confidence` | observation-level confidence, not canonical object confidence |
| `notes` | human-readable summary for review queue |

### 4.2 Future schema после v1

Если rawProperties станет тесным местом, вынести в отдельные модели:

- `EvidenceAsset`: file/object key, mime type, sha256, source observation id, EXIF/GPS, OCR/transcript status.
- `ReviewTask`: moderation queue item, assignee, priority, status, SLA.
- `ParkingCorrection`: proposed canonical fact update with before/after payload and review decision.
- `Contributor`: optional trusted contributor profile/reputation if user reports become frequent.

Пока это backlog, а не обязательная миграция.

## 5. API backlog v1

### A. Расширить текущий `POST /api/observations`

Сохранить backward compatibility с текущей формой. Добавить optional JSON fields:

```json
{
  "parking_source_name": "OpenStreetMap",
  "parking_source_id": "osm:way:123",
  "entity_type": "price_correction",
  "evidence_kind": "photo",
  "map_point": { "lat": 25.774, "lng": -80.19, "accuracy_m": 15 },
  "suggested_price": "$4/hour",
  "suggested_rules": "Mon-Sat 9am-6pm",
  "payment_url": "https://...",
  "evidence_url": "https://...",
  "comment": "Фото знака у въезда",
  "client_metadata": {
    "language": "ru",
    "captured_at": "2026-07-03T10:00:00Z",
    "app_surface": "parking_detail_panel"
  }
}
```

Правила:

- если `entity_type` не задан, оставить текущий `user_report`;
- запрещать прямое canonical update;
- сохранять status `pending_review`;
- rate limit оставить, но отдельно считать upload-heavy flow;
- `GET /api/observations` по-прежнему скрывает `User Report` без review token.

### B. Future upload endpoint

`POST /api/observations/evidence` или `POST /api/evidence`:

- принимает multipart photo/screenshot/audio;
- ограничивает размер, MIME, количество файлов;
- сохраняет asset в локальное/object storage хранилище;
- считает sha256/perceptual hash;
- создает `SourceObservation(entityType=field_evidence)`;
- возвращает `observation_id`, `asset_refs`, `status=ocr_pending|pending_review`.

Это отдельная implementation task, потому что затрагивает хранение файлов и security limits.

### C. Review API

`PATCH /api/observations/[id]/review`:

- protected by `PARKINGUSA_REVIEW_TOKEN` / future auth;
- принимает `decision`, `reason`, `extracted_facts`, `canonical_update_intent`;
- не меняет canonical rows без explicit `promote=true` и validation;
- пишет review metadata в `rawProperties.review`.

`POST /api/observations/[id]/promote`:

- отдельный explicit action;
- применяет correction к `ParkingFacility` / `CurbSegment` / `ParkingZone`;
- обновляет `priceStatus`, `ruleStatus`, `paymentUrl`, `bookingUrl`, `evidenceUrl`, `lastVerifiedAt`, `confidence` по правилам confidence model;
- сохраняет before/after в observation rawProperties.

## 6. UI backlog v1

### Пользовательская карта/detail panel

1. Добавить компактные entry points:
   - “Add photo / Добавить фото”;
   - “Report wrong info / Исправить данные”;
   - “Add missing parking here / Добавить парковку здесь”.
2. Для текущего selected parking сохранять текущую форму как fallback.
3. Для map point flow разрешить выбор точки на карте без selected facility.
4. После отправки показывать честный статус: “Отправлено на проверку, карта обновится после review”.
5. Не показывать пользователю internal confidence как абсолютную истину; показывать “pending review / verified / rejected” простым языком.

### Review/Admin UI

Первый минимальный экран:

- список pending observations;
- фильтры: city, evidence_kind, entity_type, status, low/high confidence;
- preview rawProperties/evidence link/OCR/transcript;
- related ParkingUSA object and map preview;
- actions: reject, needs more info, accept observation, promote correction.

Если полноценный admin UI откладывается, допустим temporary review via protected `GET /api/observations?source=User%20Report` + CLI/script report.

## 7. Confidence update rules v1

Начинать консервативно:

| Событие | Confidence impact |
| --- | --- |
| raw user text only | 0.20-0.35 |
| user text + valid source/payment URL | до 0.45 |
| photo/screenshot with readable OCR | до 0.50 |
| GPS/map point within 50 м от target object | +0.05 |
| совпадает с official/operator source | +0.20 |
| trusted reviewer accepts | минимум 0.65 |
| conflict with official source | status `conflict`, не повышать без reviewer decision |
| stale/old evidence | cap 0.50 или status `stale` |

Canonical record confidence не равен observation confidence. При promotion canonical confidence пересчитывается как функция source reliability + evidence quality + reviewer decision + freshness.

## 8. Acceptance criteria для DEV-52

В этом срезе готово, если:

- создан дизайн-документ с потоком фото/скрин/голос/точка -> OCR/metadata/manual review -> observation/correction -> confidence update;
- документ явно привязан к текущим `SourceObservation`, `/api/observations`, detail panel и canonical models;
- docs source of truth обновлен ссылками на этот поток;
- roadmap содержит backlog для API/UI/review/confidence;
- код production/deploy/secrets не менялись;
- проверка документационных правок выполнена минимально достаточными командами.

## 9. Implementation subtasks после approval

1. API: расширить `POST /api/observations` optional fields и добавить tests на backward compatibility.
2. API: добавить protected review PATCH для observation decision без promotion.
3. Data: добавить helper для status/confidence normalization внутри `rawProperties`.
4. UI: добавить map-point user report flow.
5. UI: добавить photo/screenshot URL-first flow без binary upload.
6. Review: сделать protected pending observations view или CLI report.
7. Evidence assets: спроектировать storage limits и только потом делать multipart upload.
8. Confidence: добавить pure function + tests для canonical confidence recompute после accepted correction.

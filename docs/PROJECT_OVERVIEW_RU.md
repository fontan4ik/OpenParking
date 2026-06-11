# ParkingUSA - понятное описание проекта и главный источник правды

Дата: 2026-06-11

Этот документ - главный продуктовый и архитектурный источник правды для ParkingUSA. Остальные документы, задачи, API, импортеры и UI должны сверяться с ним. Если другой документ противоречит этому файлу, сначала обновляем этот файл, потом приводим остальные материалы и код к нему.

Документ объясняет ParkingUSA простым языком: что мы строим, как это будет работать, какие данные нужны, откуда брать парковки по США, где нужны обычные API, где нужны парсеры, где нужны браузерные агенты, а где уже придется подключать звонки, партнерства или ручную проверку.

Термины на английском оставлены там, где они важны для разработки. Рядом дается перевод или пояснение в скобках.

## 0. Как сейчас устроен проект в репозитории

Если смотреть на текущий код, ParkingUSA работает так:

```text
data/*.geojson и data/research/*.json
  -> apps/backend/scripts/* импортируют, проверяют или готовят данные
  -> apps/backend/prisma/schema.prisma описывает будущую PostGIS/Prisma базу
  -> apps/frontend/lib/data-loader.ts читает PostGIS, а если БД недоступна - GeoJSON fallback
  -> apps/frontend/app/api/* отдает JSON/GeoJSON API
  -> apps/frontend/components/ParkingMap.tsx показывает карту через MapLibre
```

То есть сейчас есть два режима:

1. File fallback (режим файлов): API читает готовые файлы из `data/`. Это работает даже без базы.
2. DB mode (режим базы): если есть `DATABASE_URL`, API пробует читать через Prisma из PostGIS. Если база недоступна, код автоматически возвращается к файлам.

Главные места в коде:

| Что | Где находится | Зачем нужно |
| --- | --- | --- |
| Главная карта | `apps/frontend/app/page.tsx`, `apps/frontend/components/ParkingMap.tsx` | Пользовательский экран с MapLibre |
| API routes | `apps/frontend/app/api/*/route.ts` | Публичные ручки для карты и данных |
| Загрузка данных | `apps/frontend/lib/data-loader.ts` | Общий вход: БД или GeoJSON fallback |
| Загрузка из БД | `apps/frontend/lib/db-loader.ts` | Prisma -> GeoJSON для frontend |
| Подключение Prisma | `apps/frontend/lib/db.ts` | Проверка `DATABASE_URL` и fallback при ошибке |
| Схема БД | `apps/backend/prisma/schema.prisma` | DataSource, ParkingFacility, CurbSegment, ParkingZone, SourceObservation |
| Импорт SF в БД | `apps/backend/scripts/import_sf_to_db.mjs` | Загружает текущие San Francisco файлы в Prisma/PostGIS |
| Research worker v0 | `apps/backend/scripts/run_phase6_research_worker.mjs` | Генерирует/проверяет research manifests |
| Research manifests | `data/research/*.json` | Источники, ссылки, parser specs, gaps |

### 0.1 Какие API уже реализованы

API реализован прямо в Next.js frontend-приложении через App Router. Физически это файлы `route.ts` внутри `apps/frontend/app/api/`.

| URL | Файл | Что возвращает | Откуда берет данные |
| --- | --- | --- | --- |
| `/api/stats` | `apps/frontend/app/api/stats/route.ts` | Сводку: сколько facilities, priced facilities, curb segments, zones | `loadAllLayers()` из `data-loader.ts` |
| `/api/facilities` | `apps/frontend/app/api/facilities/route.ts` | GeoJSON парковочных объектов с фильтрами | `loadFacilities()` |
| `/api/geojson/facilities` | `apps/frontend/app/api/geojson/[layer]/route.ts` | Полный GeoJSON слой street meters/facilities | `loadFacilities()` |
| `/api/geojson/segments` | `apps/frontend/app/api/geojson/[layer]/route.ts` | GeoJSON curb segments | `loadCurbSegments()` |
| `/api/geojson/zones` | `apps/frontend/app/api/geojson/[layer]/route.ts` | GeoJSON parking zones/lots из OSM | `loadZones()` |
| `/api/observations` | `apps/frontend/app/api/observations/route.ts` | Наблюдения/доказательства по источникам из БД | Prisma `SourceObservation` |

Поддержанные фильтры в `/api/facilities`:

- `type` - например `street_meter`;
- `price=known` или `price=unknown`;
- `source` - фильтр по `source_name` / `last_verified_source`;
- `confidence=high|medium|low|review`;
- `q` - поиск по name/operator/source_id/street/neighborhood;
- `limit` - ограничение количества объектов.

Важно: links to source/payment еще не полностью выведены в UI. В данных частично уже есть `source_name`, `source_id`, `last_verified_source`, `website`, но нужно добавить единые поля `source_url`, `api_url`, `payment_url`, `booking_url`, `evidence_url` в БД, GeoJSON и карточку объекта на карте.

### 0.2 Какие данные реально есть сейчас

Сейчас боевой baseline - San Francisco. Он лежит в `data/` и может быть импортирован в PostGIS.

| Файл | Что внутри | Количество | Источник | Ссылка на источник/API |
| --- | --- | ---: | --- | --- |
| `data/sf_parking_datasf.geojson` | Уличные parking meters в SF | 33,511 | DataSF Parking Meters + Meter Rate Schedules | Source: https://data.sfgov.org/Transportation/Parking-Meters/8vzz-qzz9, API: https://data.sfgov.org/resource/8vzz-qzz9.json, policies: https://data.sfgov.org/Transportation/Meter-Policies/qq7v-hds4 |
| `data/sf_parking_curb_segments.geojson` | Производные curb segments, сгруппированные по `blockface_id` | 2,889 | Derived from DataSF meters | Это наш derived слой из DataSF, не отдельный официальный источник |
| `data/sf_parking_zones_osm.geojson` | OSM parking zones/lots в downtown SF | 403 | OpenStreetMap via Overpass | OSM: https://www.openstreetmap.org/, Overpass-derived local export |
| `data/street_parking_normalized.json` | Нормализованные OSM parking tags | 403 records | `Referenss/osm-tag-updater` logic + OSM | Используется для street-parking normalization |

Что означают эти слои:

- `sf_parking_datasf.geojson` - самый надежный текущий слой, потому что это city open data.
- `sf_parking_curb_segments.geojson` - полезный, но производный слой: мы группируем meter points по blockface. Его нельзя считать официальной линией бордюра.
- `sf_parking_zones_osm.geojson` - кандидатный слой parking lots/zones из OSM. У него ниже confidence, потому что OSM может быть неполным, а некоторые геометрии сейчас display fallback.

### 0.3 Где лежат найденные источники по городам

Research Phase 6 уже нашел источники для benchmark cities. Они пока не все импортированы в карту, но ссылки уже сохранены в manifests.

| Город | Manifest | Что найдено |
| --- | --- | --- |
| San Francisco | `data/research/cities/san-francisco.ca.json` | DataSF Parking Meters, DataSF Meter Policies |
| New York City | `data/research/cities/new-york-city.ny.json` | NYC Parking Meters Locations and Status, Parking Regulation Locations and Signs |
| Los Angeles | `data/research/cities/los-angeles.ca.json` | LADOT Parking Meter Occupancy, LADOT Metered Parking Inventory and Policies |
| Seattle | `data/research/cities/seattle.wa.json` | Paid Parking Occupancy, Blockface FeatureServer |
| Chicago | `data/research/cities/chicago.il.json` | ParkChicago rates/hours, Chicago official meter page |

Главный общий inventory: `data/research/phase6-source-inventory-20260610.json`.

В каждом source manifest важные поля:

- `source_name` - человеческое название источника, например `DataSF Parking Meters`;
- `source_type` - тип источника: `city_open_data`, `city_gis`, `official_operator_page`, `operator_public_site`;
- `portal_type` - технический тип: `socrata`, `arcgis_rest`, `html`, `ckan`;
- `source_url` - страница источника для человека;
- `metadata_url` - машинная мета-информация, если есть;
- `api_url` - прямой endpoint, откуда можно грузить данные;
- `parking_layers` - что источник покрывает: meters, rates, signs, curb rules, occupancy;
- `recommended_connector` - чем забирать источник: Socrata importer, ArcGIS importer, parser, browser agent;
- `legal_risk` - риск по лицензии/ToS;
- `confidence` - насколько мы уверены, что источник релевантен и пригоден.

### 0.4 Что значит source/provenance простыми словами

`source` - это ответ на вопрос: "Откуда мы это знаем?"

Для каждого parking record нужно хранить:

- `source_name` - название источника;
- `source_id` - стабильный id записи внутри источника;
- `source_url` - ссылка на страницу источника;
- `api_url` - ссылка на машинный API, если есть;
- `raw_properties` - оригинальные поля, как они пришли из источника;
- `confidence` - уверенность;
- `last_verified_at` - когда мы последний раз проверили факт;
- `data_as_of` - на какую дату сам источник считает данные актуальными;
- `evidence_url` или `evidence_file` - screenshot, HTML snapshot, transcript, metadata JSON;
- `payment_url` / `booking_url` - ссылка на оплату или бронирование, если источник ее дает.

Пример:

```json
{
  "source_name": "DataSF Parking Meters + Meter Rate Schedules",
  "source_id": "datasf:meter:216-29160",
  "source_url": "https://data.sfgov.org/Transportation/Parking-Meters/8vzz-qzz9",
  "api_url": "https://data.sfgov.org/resource/8vzz-qzz9.json",
  "payment_url": null,
  "confidence": 0.85,
  "data_as_of": "2026-06-06T02:12:10.000"
}
```

Если источник - operator site или parking app, там наоборот может быть `payment_url` или `booking_url`. Например для Parking.com, ABM, airport/event parking или monthly parking.

### 0.5 Текущий пробел, который надо закрыть следующим

Сейчас проект уже хранит базовую provenance-информацию, но пользователю она видна недостаточно явно. Следующий важный шаг:

1. Добавить в Prisma модели поля `sourceUrl`, `apiUrl`, `paymentUrl`, `bookingUrl`, `evidenceUrl`.
2. Протащить эти поля через importers и GeoJSON fallback.
3. Показать в карточке парковки на карте:
   - источник данных;
   - ссылку "Открыть источник";
   - ссылку "Оплатить/забронировать", если есть;
   - свежесть данных;
   - confidence.
4. Сделать отдельный экран/панель "Источники", где видно все найденные sources по городам и их статус: research only, ready for import, imported, needs parser, needs legal review.

## 1. Что такое ParkingUSA

ParkingUSA - это платформа данных о парковках в США.

Главная идея: собрать в одном месте максимально полный слой парковок:

- уличные парковочные счетчики (street meters - парковочные места/счетчики на улице);
- правила у бордюра (curb rules - можно ли стоять, когда, сколько стоит, есть ли permit, loading zone, street cleaning);
- гаражи (garages - многоуровневые или крытые парковки);
- открытые парковочные площадки (surface lots / lots - наземные парковки);
- зоны парковки (parking zones - районы тарифов, permit-зоны, event-зоны);
- valet (valet parking - когда ключи отдаешь сотруднику, а он сам паркует машину);
- airport/event/monthly parking (парковки аэропортов, мероприятий и долгосрочные месячные парковки);
- цены, расписания, ограничения, свежесть данных и уверенность в данных.
- ссылки на источник и ссылки на оплату

Продукт для пользователя должен выглядеть как удобная карта: человек открывает карту, видит парковки вокруг, фильтрует по цене, времени, типу парковки, доступности, долгосрочности, valet, гаражам, уличным местам и правилам, А также четко видит парковочные зоны.

## 2. Важная реальность: всех парковок из одного источника не получить

В США нет одного официального API, где лежат все парковки.

Поэтому ParkingUSA должен быть не просто приложением, а многоисточниковой системой данных (multi-source data platform - платформа, которая собирает данные из разных мест).

У разных типов парковок разные источники:

| Что собираем | Где обычно лежит | Как получать |
| --- | --- | --- |
| Уличные счетчики | Городские open data порталы | API-коннекторы: Socrata, ArcGIS REST, CKAN |
| Правила у бордюра | City GIS, знаки, open data, OSM tags | API + rule parser (парсер правил) |
| Гаражи и lots | OSM, Overture, сайты операторов, city facilities | OSM import + парсеры сайтов |
| Valet | Сайты ресторанов, отелей, venue, airport, hospital | Парсер + browser agent + иногда AI-call |
| Event parking | Сайты стадионов, концертных площадок, аэропортов | Browser agent, потому что цена зависит от даты/события |
| Monthly parking | Операторы, гаражи, city permits, marketplace | Парсер форм/страниц + ручная проверка |
| Availability (доступность) | Sensors, payment providers, operators, partners | Партнерские feeds или вероятностная модель |

Вывод: сейчас у нас еще не все парковки США. У нас есть research foundation (исследовательская база) и первые benchmark cities (проверочные города). Дальше нужно строить production ingestion pipeline (боевой пайплайн загрузки данных).

## 3. Как проект будет работать технически

Общая схема:

```text
Источники данных
  -> research worker (ищет и классифицирует источники)
  -> importers/parsers/browser agents (загружают данные)
  -> normalization (приведение к единой схеме)
  -> PostGIS + Prisma (хранилище)
  -> API
  -> MapLibre frontend (карта)
  -> vector tiles через Martin/Tippecanoe для масштаба
```

### 3.1 Research worker (исследовательский воркер)

Research worker - это сервис, который отвечает на вопросы:

- какие источники парковок есть в городе;
- это Socrata, ArcGIS, CKAN, CSV, PDF, HTML или динамический сайт;
- какие слои данных там есть: meters, curb rules, garages, lots, valet, rates, availability;
- можно ли брать данные легально и стабильно;
- какой connector нужен;
- нужен ли parser spec (описание логики парсера);
- чего не хватает и что надо поставить в missing queue (очередь недостающих данных).
- ссылки на оплату нужных парковок

Уже сделано в Phase 6:

- source inventory (инвентарь источников);
- coverage estimate (оценка покрытия);
- parser specs (описания парсеров);
- browser backlog (очередь для браузерных проверок);
- ResearchTask / ResearchFinding в Prisma schema.

### 3.2 Importers (импортеры)

Importer - это код, который берет структурированный источник и загружает его в нашу базу.

Примеры:

- Socrata importer (для городских open data порталов типа DataSF, NYC Open Data, LA Data);
- ArcGIS REST importer (для GIS слоев через FeatureServer/MapServer);
- CKAN/Data.gov importer (для государственных каталогов);
- CSV/GeoJSON importer (для файлов);
- OSM importer (для OpenStreetMap данных).

Это самые надежные источники, потому что они обычно официальные.

### 3.3 Parsers (парсеры сайтов)

Parser - это логика, которая вытаскивает данные из сайта, где нет нормального API.

Например, сайт оператора парковок может иметь страницы:

- список гаражей;
- страница конкретной парковки;
- цена за час;
- цена за день;
- monthly parking;
- valet;
- часы работы;
- ограничения по высоте;
- booking link.
- ссылки на оплату нужных парковок

Для каждого такого источника нужен parser spec (спецификация парсера), где написано:

- какие URL обходить;
- как искать страницы;
- какие selectors (CSS-селекторы) или network endpoints (сетевые API-запросы внутри страницы) использовать;
- какие поля извлекать;
- как обрабатывать pagination (пагинацию/много страниц);
- какие сценарии цены проверять: now, weekday, weekend, overnight, event, monthly;
- как дедуплицировать записи;
- какие evidence (доказательства) сохранять: HTML, screenshot, network metadata, content hash, observed_at.

### 3.4 Browser agents (браузерные агенты)

Browser agent нужен, когда обычный fetch страницы недостаточен.

Примеры:

- сайт рисуется JavaScript-ом;
- цены появляются только после выбора даты/времени;
- поиск парковки работает через карту;
- информация приходит из скрытого API в network;
- event parking зависит от события;
- valet/airport/venue pages требуют сценариев.

То есть browser agent открывает сайт как настоящий браузер, кликает, выбирает дату/время, смотрит DOM/network, делает screenshot и сохраняет evidence.

Уже проверено для ParkChicago rates/hours:

- страница открыта в браузере;
- сохранен DOM snapshot;
- сохранен screenshot;
- сохранены parser hints;
- обнаружены rate bands и информация про примерно 36,000 on-street spaces.

### 3.5 AI-call workflow (ИИ-звонки) - бета функционал

AI-call (звонок ИИ-агента) не должен быть первым массовым методом.

Его стоит использовать только когда:

- объект важный;
- цена устарела;
- данные конфликтуют;
- valet/monthly/event информация недоступна на сайте;
- сайт не дает понять, существует ли парковка;
- нужен телефонный факт: цена, часы, availability, valet drop-off.

Результат звонка должен сохраняться как evidence:

- номер телефона;
- дата звонка;
- transcript (текст разговора);
- extracted facts (извлеченные факты);
- confidence score (уверенность);
- кто/что подтвердило информацию.

## 4. Главные типы парковок и как их собирать

### 4.1 Street meters (уличные счетчики)

Что это:

Уличные платные парковочные места или счетчики.

Где брать:

- city open data;
- Socrata;
- ArcGIS REST;
- CKAN/Data.gov;
- иногда payment provider / operator pages.

Как собирать:

- через API, не через парсинг;
- сохранять meter id, координаты, тариф, часы, статус;
- делать idempotent upsert (повторный импорт не должен создавать дубликаты).

Примеры:

- San Francisco: DataSF Parking Meters;
- NYC: Parking Meters Locations and Status;
- Los Angeles: LADOT Parking Meter Inventory;
- Seattle: Paid Parking Occupancy / Blockface data.

### 4.2 Curb rules (правила у бордюра)

Что это:

Правила по сторонам улиц: no parking, loading, permit, street cleaning, time limits, paid parking.

Где брать:

- datasets со знаками;
- city GIS blockfaces;
- OSM parking tags;
- CurbLR/CDS, если город публикует.

Как собирать:

- API ETL;
- rule parser (парсер текстовых правил);
- `osm-tag-updater` для нормализации OSM parking tags;
- geometry matching (привязка правил к стороне улицы).

Сложность:

Это один из самых сложных слоев, потому что правило часто зависит от дня недели, времени, стороны улицы, исключений и типа транспорта.

### 4.3 Garages and lots (гаражи и парковочные площадки)

Что это:

Офстрит-парковки: здания-гаражи, surface lots, private lots, parking lots у ТЦ, офисов, университетов, больниц.

Где брать:

- OSM / Overture как baseline;
- city-owned facilities;
- сайты операторов: ABM, SP+, LAZ, Premium, Ace, Propark и т.д.;
- сайты venue/airport/hospital/university;
- marketplace только после ToS/legal review.

Как собирать:

- сначала OSM/osm2pgsql для nationwide baseline;
- потом operator parsers;
- потом browser agents для динамических цен;
- потом missing queue и human review.

Дедупликация:

- normalized address;
- координаты;
- operator;
- phone;
- website;
- source id;
- близость геометрии.
- ссылки на оплату нужных парковок

### 4.4 Valet (когда ключи отдаешь и машину паркуют)

Что это:

Valet parking - услуга, где водитель оставляет машину сотруднику. Это может быть:

- hotel valet;
- restaurant valet;
- hospital valet;
- event valet;
- airport valet;
- private valet-only parking.

Почему важно:

Valet почти не лежит в городских open data. Если мы хотим “все парковки”, valet должен быть отдельным first-class layer (полноценный слой данных), а не заметка в описании.

Где брать:

- сайты отелей;
- сайты ресторанов;
- сайты аэропортов;
- сайты event venues;
- операторы valet;
- phone/AI-call для подтверждения.

Что хранить:

- valet flag;
- drop-off address;
- часы работы;
- цена;
- phone;
- operator;
- ссылка на страницу и страницу оплаты;
- confidence;
- last_verified_at.

### 4.5 Airport/event parking

Что это:

Парковки аэропортов, стадионов, концертных площадок, выставочных центров.

Почему сложно:

Цена часто зависит от даты, времени и события.

Как собирать:

- official pages first;
- browser agent для сценариев;
- сохранять scenario evidence (например, weekday evening, weekend, event day, overnight);
- не обещать real-time availability без feed.

### 4.6 Monthly parking

Что это:

Долгосрочная парковка по месячной оплате.

Где брать:

- operator pages;
- city permit programs;
- garage pages;
- marketplace после legal review;
- звонки для важных пробелов.

Что хранить:

- monthly price;
- monthly availability flag;
- contact URL/phone;
- waitlist;
- restrictions;
- last verified date.

## 5. Что уже есть в проекте

Текущий проект уже имеет основу:

- Next.js (фреймворк приложения);
- React (frontend);
- MapLibre GL JS (карта);
- Prisma (ORM для базы);
- PostGIS direction (целевая гео-база);
- GeoJSON fallback (файлы данных как запасной режим);
- research scripts для Phase 6;
- первые benchmark city manifests.

Есть публичные API, которые нужно сохранять:

- `/api/stats`;
- `/api/facilities`;
- `/api/geojson/[layer]`.

Есть baseline по San Francisco:

- 33,511 meter facilities;
- 2,889 curb segments;
- 403 OSM zones.

## 6. Что значит “получить абсолютно все парковки”

Практически это значит не “одним разом скачать идеальную базу”, а построить систему, которая постоянно добирает покрытие.

Нужны 6 механизмов:

1. Official sources first (сначала официальные источники).
2. OSM/Overture baseline (базовый слой по всей стране).
3. Public parsers (парсеры публичных страниц операторов и объектов).
4. Browser agents (браузерные агенты для сложных сайтов и динамических цен).
5. Partner feeds later (партнерские фиды позже, когда будет бизнес-основание).
6. Missing-parking queue (очередь дыр в покрытии, которые надо закрывать research/parser/call/manual review).
7. Добавить функционал чтобы пользователи могли сами ставить парковки на карте отмечать их

Критерии полноты:

- source coverage (сколько источников найдено и обработано);
- geographic coverage (какие города/штаты покрыты);
- facility count (сколько объектов найдено);
- price coverage (у скольких объектов есть цена);
- rule coverage (у скольких объектов есть правила);
- freshness (как давно проверено);
- confidence (насколько мы уверены);
- missing queue size (сколько дыр осталось).

## 7. Где создавать “велосипед”, а где не создавать

### Не создавать с нуля

Не писать свое, если уже есть надежный инструмент:

- OSM JSON/XML -> GeoJSON: использовать `osmtogeojson`;
- OSM PBF -> PostGIS: использовать `osm2pgsql` как внешний CLI/Docker;
- vector tiles: использовать Martin и Tippecanoe;
- OSM street parking tag normalization: использовать `Referenss/osm-tag-updater`;
- backend/PostGIS patterns: смотреть `Referenss/parking`.

### Создавать свое

Нужно создавать свое там, где нет универсального инструмента:

- ParkingUSA source scoring (оценка качества источника);
- parser specs для операторских/venue/valet сайтов;
- dedupe engine (склейка дублей между OSM, city data, operators);
- confidence model (оценка уверенности);
- missing-parking queue;
- evidence storage;
- city readiness score;
- valet/monthly/event extraction workflow;
- browser runner по нашим parking scenarios.
- функционал чтобы пользователи сами могли отмечать парковки

## 8. Данные, которые нужно хранить у каждой парковки

Минимальная сущность parking record должна иметь:

- name (название);
- facility_type (тип: meter, garage, lot, valet, curb segment, zone);
- geometry (точка/линия/полигон);
- address;
- operator;
- rates;
- hours;
- restrictions;
- access type (public, private, customers-only, permit-only, valet-only, monthly-only, event-only);
- source_name;
- source_id;
- raw_properties;
- confidence;
- last_verified_at;
- data_as_of;
- evidence URLs/files.
- зонирование чтобы можно было четко точками разграничить верную зону

Важно: если факт получен из парсера или звонка, он не должен выглядеть так же уверенно, как official API. У него должен быть confidence и provenance.

## 9. План работ дальше

### P0 - самое важное

1. Сделать importer templates для Socrata, ArcGIS, CKAN, CSV/GeoJSON.
2. Импортировать benchmark cities в PostGIS.
3. Сделать OSM baseline через `osm2pgsql`.
4. Сделать parser runner v1 по parser specs.
5. Сделать missing-parking queue.
6. Сделать dedupe logic между official/open/OSM/operator sources.
7. Добавить valet как отдельный тип парковки.

### P1 - после базы

1. City readiness score.
2. Browser runner для operator/venue/airport/event/monthly scenarios.
3. Vector tiles через Martin/Tippecanoe.
4. Rule parser для curb/sign datasets.
5. Admin/review UI для конфликтов и low-confidence данных.

### P2 - позже

1. AI-call workflow.
2. User reports.
3. Partner feeds.
4. Availability prediction.
5. B2B/API monetization.

## 10. Как объяснить проект одной фразой

ParkingUSA - это не просто карта парковок, а система, которая строит самый полный parking graph (граф парковочных объектов и правил) по США из официальных данных, OSM, операторских сайтов, браузерных проверок, звонков и пользовательских подтверждений, сохраняя для каждого факта источник, свежесть и уверенность.

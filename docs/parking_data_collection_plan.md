# Parking USA: как собирать данные по сотням тысяч парковок

Дата: 2026-06-08

Роль документа: практический план сбора и нормализации данных. Рыночный контекст лежит в `parking_usa_research.md`, глубокий список источников/городов/GitHub pieces - в `parking_full_data_strategy.md`.

## 1. Главная идея пайплайна

Нужно строить не "парсер парковок", а фабрику данных:

1. Найти кандидаты парковок из разных источников.
2. Нормализовать их в единую схему.
3. Сдедуплицировать одинаковые объекты.
4. Обогатить ценами, правилами, типами, входами/въездами.
5. Проставить source, freshness и confidence.
6. Отобразить на карте как точки, полигоны и зоны.
7. Постоянно перепроверять через парсинг, звонки, user reports и партнерские фиды.

Самое важное: не смешивать "парковка существует" и "мы знаем актуальную цену". Это разные факты с разной надежностью.

## 1.1 Самый простой вариант для старта

Самый удобный MVP-путь:

1. Взять один город с сильным open data, например San Francisco.
2. Загрузить официальный DataSF Parking Meters dataset.
3. Присоединить Meter Rate Schedules по `post_id`.
4. Показать на карте тысячи официальных meter points с базовой hourly price.
5. Рядом добавить второй слой из OSM для garages/lots.
6. Все, где цена неизвестна, отправлять в очередь enrichment: сайт оператора, ручная проверка, AI-звонок.

Почему это проще всего:

- не нужен Google API key;
- нет риска нарушить Google Places caching policy;
- данные официальные и обновляются;
- сразу можно показать карту с ценами;
- появляется понятная модель масштабирования: для каждого города искать похожие open datasets и подключать их коннекторами.

## 2. Почему Google Maps как главный вход, но не как master database

Google Places/Maps можно использовать для поиска parking POI вокруг города/района, но есть ограничения:

- Places API поддерживает searchNearby/Text Search и фильтры по типам мест.
- В официальных политиках Google Places указано, что нельзя pre-fetch/cache/store Places API content сверх разрешенных исключений; place_id является отдельным исключением.
- Places API results на карте должны показываться с Google attribution и, если это карта, на Google Map.

Практический вывод:

- Google можно использовать для initial discovery, ручной проверки, place_id matching, links и "а есть ли тут парковка вообще".
- Нельзя строить независимую долгосрочную базу, просто выгрузив все парковки из Google.
- Master record должен иметь собственные поля и источники: OSM, городские open data, сайт оператора, звонок, пользовательское подтверждение, партнерский API.

Поэтому общий слой ParkingUSA должен называться не "Google layer", а `coverage baseline`: все парковки, которые мы можем законно хранить как собственные candidate records. Google может помочь найти пробел или сопоставить объект, но карта должна показывать ParkingUSA canonical records с явным статусом enrichment: цена известна, цена неизвестна, правила известны, источник слабый, нужен review.

## 3. Источники данных: что брать на первом этапе

### A. OpenStreetMap / Overpass

Что дает:

- amenity=parking;
- parking=surface/multi-storey/underground/street_side и другие теги;
- capacity, fee, access, operator, opening_hours, charge, website, phone, name;
- иногда полигоны, иногда только точки.

Плюсы:

- можно хранить и использовать при соблюдении ODbL;
- быстрый старт без API-ключа;
- хорошо подходит для карты и базового inventory.

Минусы:

- покрытие и цены неполные;
- не всегда есть entrance points;
- часть объектов устаревшая.

### B. City open data

Что искать:

- parking meter locations;
- parking meter rates;
- parking regulation signs;
- curb/loading/no parking zones;
- garages/lots owned by city;
- occupancy datasets;
- permits/residential zones.

Где искать:

- city open data portals: Socrata, ArcGIS, CKAN;
- Data.gov;
- DOT/parking authority websites;
- GitHub/open data catalogs.

### C. Operator websites

Операторы:

- SP+/Parking.com;
- LAZ Parking;
- ABM Parking;
- Premium Parking;
- Metropolis;
- Ace Parking;
- Propark;
- Icon/Quik Park;
- airport/venue/campus parking.

Что собирать:

- адрес, координаты, название;
- тип: garage/lot/valet/monthly/event;
- тарифы;
- hours;
- height clearance;
- monthly availability;
- booking URL;
- phone/email.

Лучше сначала использовать публичные страницы и партнерские/affiliate фиды, а scraping checkout и private endpoints оставить как рискованную зону.

### D. Marketplace data

SpotHero, ParkWhiz/BestParking, Parking.com, Flash demand network и похожие игроки могут быть:

- источником ссылок на бронирование;
- источником price signals;
- будущими affiliate/partner channels.

Но на первом этапе не стоит строить бизнес на несанкционированном scraping их данных.

### E. Обзвон / AI agents

Обзвон хорош не как первый источник для сотен тысяч объектов, а как validation/enrichment слой:

- проверка цены;
- проверка, работает ли парковка;
- monthly availability;
- правила overnight;
- valet conditions;
- event pricing;
- entrance/phone/site.

Звонить нужно не всем подряд, а приоритизировать:

- объекты с высоким спросом;
- объекты без цены;
- объекты с конфликтующими источниками;
- объекты, где цена давно не обновлялась;
- объекты, которые пользователи часто открывают/репортят.

## 4. Схема данных

### parking_facility

- id
- canonical_name
- facility_type: street, garage, surface_lot, valet, airport, event, monthly, private, unknown
- geometry_type: point, polygon, curb_segment
- lat
- lng
- polygon_geojson
- entrance_lat
- entrance_lng
- address
- city
- state
- zip
- operator
- owner
- phone
- website
- booking_url
- payment_provider
- access: public, customers, permit, private, unknown
- capacity
- height_clearance
- ev_charging
- accessible
- covered
- overnight
- monthly_available
- source_confidence
- last_verified_at
- created_at
- updated_at

### parking_price

- id
- facility_id
- price_type: hourly, daily, nightly, monthly, event, flat, free, unknown
- amount_min
- amount_max
- currency
- duration_minutes
- starts_at_time
- ends_at_time
- days_of_week
- effective_from
- effective_to
- source_id
- confidence
- raw_text

### parking_rule

- id
- facility_id
- rule_type: allowed, no_parking, loading, residential_permit, street_cleaning, max_duration, validation
- applies_days
- start_time
- end_time
- text
- source_id
- confidence

### source_observation

- id
- facility_id
- source_type: osm, google_places, city_open_data, operator_site, marketplace, phone_call, user_report, manual_review
- source_name
- source_url
- external_id
- observed_at
- raw_payload_hash
- extracted_fields_json
- confidence

## 5. Дедупликация

Один и тот же гараж может быть:

- точкой в Google;
- полигоном в OSM;
- страницей на Parking.com;
- предложением в SpotHero;
- городским объектом в open data.

Matching logic:

1. География: distance до 30-80 метров, отдельно для downtown/high-density.
2. Название: fuzzy match name/operator.
3. Адрес: normalized address + zip.
4. Phone/website/domain.
5. Entrance proximity.
6. Capacity/height/hours совпадают.

Результат не должен сразу merge навсегда. Лучше хранить candidate links:

- same_facility_probability;
- matched_by;
- reviewed_by_human;
- reviewed_at.

## 6. Карта и зоны

На карте нужно показывать 3 уровня:

1. Точки: отдельные гаражи/лоты/valet/entrance.
2. Полигоны: территория surface lot, гараж, campus/airport lot.
3. Curb segments/zones: street parking rules, meter zones, permit zones, no parking/loading.

После PoC важно разделять:

- `authoritative_polygon` - реальная зона из city GIS, OSM closed way/relation, parcel/building footprint, Overture или operator feed.
- `inferred_polygon` - зона, восстановленная алгоритмом и прошедшая проверку.
- `candidate_polygon` - временный placeholder вокруг точки или search result. Нельзя показывать как реальную парковочную зону без пометки.
- `curb_line` - линия вдоль дороги для street parking.
- `point` - meter/pay station/garage entrance/valet stand.

Визуализация:

- цвет по типу парковки;
- opacity/outline по confidence;
- бейдж цены: "$8/h", "$25/day", "$180/mo";
- штриховка/серый цвет для неизвестной цены;
- слой "needs verification";
- heatmap спроса или плотности парковок.

## 7. Как масштабировать до 100k+ парковок

### Этап 1: 1 город, 1-2 недели

- OSM import;
- Google Places manual/API sample for candidate discovery;
- 1-2 city open datasets;
- 2-3 operator websites;
- карта;
- ручная проверка 200-500 объектов.

Цель: понять coverage delta.

### Этап 2: 5 городов, 4-8 недель

- универсальный city source crawler;
- normalized schema;
- dedupe engine;
- queue на enrichment;
- user/admin moderation;
- AI call scripts для validation.

Цель: доказать, что pipeline переносится между городами.

### Этап 3: 25-50 metro areas

- автоматическое обнаружение open data portals;
- партнерские фиды;
- operator outreach;
- call center/AI calls только по high-priority объектам;
- freshness SLAs.

Цель: national useful coverage, но не 100%.

## 8. Как использовать AI-обзвонщиков

AI-звонок должен быть строго структурированным:

1. Представиться как parking information service.
2. Спросить, доступна ли публичная парковка.
3. Узнать hourly/daily/monthly rates.
4. Узнать hours/overnight.
5. Узнать entrance/address.
6. Узнать height clearance, если garage.
7. Узнать valet/event pricing, если применимо.
8. Подтвердить website/booking/payment method.
9. Записать transcript + extracted fields.
10. Поставить confidence и next_review_at.

Пример prompt для оператора:

"Здравствуйте. Мы обновляем информацию о парковках для водителей. Подскажите, пожалуйста, это публичная парковка? Какие сейчас цены за час, день и месяц? Есть ли ночная парковка? По какому адресу или въезду лучше направлять водителей?"

Юридически важно:

- соблюдать TCPA/robocall rules;
- не звонить на emergency/частные номера без оснований;
- давать opt-out;
- хранить source/transcript аккуратно;
- для записи звонков учитывать one-party/two-party consent laws по штатам.

## 9. Что можно "пощупать" прямо сейчас

В этом workspace добавлен PoC:

- `apps/backend/scripts/fetch_datasf_meters.py` - самый простой PoC: забирает официальные SF meters + base rates.
- `apps/backend/scripts/build_sf_curb_segments.py` - строит примерные линии вдоль дороги из SF meters по `blockface_id`.
- `apps/backend/scripts/fetch_osm_parking_zones.py` - строит candidate polygon layer для демонстрации зон; это не authoritative footprints.
- `apps/backend/scripts/fetch_osm_parking.py` - забирает парковки из OSM/Overpass по bbox, но большие bbox могут таймаутиться, поэтому для продакшена нужен tile queue.
- `parking_map_poc.html` - показывает GeoJSON на карте Leaflet.
- `data/sf_parking_datasf.geojson` - пример официальных meter points по San Francisco, если скрипт успешно запущен.
- `data/sf_parking_curb_segments.geojson` - пример derived curb lines.
- `data/sf_parking_zones_osm.geojson` - candidate polygons для визуальной проверки, не реальные границы парковок.

Режимы карты:

- линии вдоль дороги;
- кандидаты зон;
- точки счетчиков;
- линии + точки;
- линии + кандидаты зон + точки.

Это не финальная база. Это быстрый способ увидеть, как выглядит слой парковок на карте и какие поля реально приходят из открытых данных.

## 10. Источники

- Google Places policies: https://developers.google.com/maps/documentation/places/web-service/policies
- Google Places Search: https://developers.google.com/maps/documentation/places/web-service/search
- Google Places Nearby Search: https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places/searchNearby
- Google Places place types: https://developers.google.com/maps/documentation/places/web-service/place-types
- OSM amenity=parking: https://wiki.openstreetmap.org/wiki/Tag:amenity%3Dparking
- Overpass API manual: https://dev.overpass-api.de/overpass-doc/en/
- Overpass QL: https://wiki.openstreetmap.org/wiki/OverpassQL
- CurbLR: https://www.curblr.org/
- OMF Curb Data Specification: https://github.com/openmobilityfoundation/curb-data-specification

## 11. Что не писать с нуля

Готового open-source продукта уровня "Parkopedia/SpotHero для всех парковок США" не найдено. Но базу проекта можно собрать из готовых блоков:

- PNNL / parking: https://github.com/pnnl/parking
  - Самый близкий skeleton: Dynamic Curb Allocation Application.
  - Уже есть Next.js frontend, Postgres/PostGIS, GraphQL, Prisma, Docker Compose, OSM map tiles, real-time availability, predictive modeling, external sensor data.
  - Использовать как reference architecture, не как готовую базу парковок.
- A/B Street: https://github.com/a-b-street/abstreet
  - Полезная модель: street parking как lane, parking lots из OSM, capacity.
  - Parking model docs: https://a-b-street.github.io/docs/tech/trafficsim/parking.html
  - Parking mapper ideas: https://a-b-street.github.io/docs/software/parking_mapper.html
- OSM Parking Lane Tag Updater: https://github.com/osmberlin/osm-tag-updater
  - TypeScript-инструмент для перехода со старых `parking:lane` тегов к новой OSM street parking schema.
- osmtogeojson: https://github.com/tyrasd/osmtogeojson
  - Использовать вместо простого самописного OSM-парсера, чтобы нормально получать polygons/relations из Overpass/OSM JSON.
- osm2pgsql + PostGIS: https://github.com/osm2pgsql-dev/osm2pgsql
  - Production-путь: импортировать OSM PBF в PostGIS и доставать parking polygons/ways/relations SQL-запросами, а не дергать Overpass на масштабе страны.
- MapLibre GL JS, Martin, Tippecanoe:
  - https://github.com/maplibre/maplibre-gl-js
  - https://github.com/maplibre/martin
  - https://github.com/felt/tippecanoe
  - Стек для больших карт: vector tiles, стили, линии, полигоны, зоны.

Рекомендация:

1. Взять архитектурные идеи из PNNL parking: PostGIS, Docker, frontend map, data model.
2. Для OSM использовать `osm2pgsql` или `osmtogeojson`, а не текущий PoC-парсер.
3. Для street parking изучить A/B Street и OSM Parking Lane Tag Updater.
4. Для карты перейти на MapLibre/vector tiles, если цель - города/штаты, а не один PoC.
5. Уникальный слой продукта: city open data connectors, operator parsers, AI-звонки, confidence/freshness.

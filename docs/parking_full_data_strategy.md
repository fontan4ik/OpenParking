# Parking USA: стратегия сбора "почти всех" парковок и зон

Дата: 2026-06-08

Роль документа: самый полный технический план. Короткий market research лежит в `parking_usa_research.md`, практическая схема ingestion/MVP - в `parking_data_collection_plan.md`, общий индекс workspace - в `README.md`.

## 1. Реальность задачи

Собрать "прям все-все парковки" одним методом нельзя. В США парковки живут в разных слоях:

- street parking: городские счетчики, знаки, curb rules, permit zones;
- off-street: гаражи, surface lots, private lots, ТЦ, офисы, отели, больницы, кампусы;
- valet: рестораны, отели, event venues, временные curb permits;
- event/airport/monthly: отдельные тарифы и availability;
- операторские сети: SP+/Parking.com, ABM, LAZ, Premium, Metropolis, Flash, Ace, Propark;
- платежные провайдеры: ParkMobile, PayByPhone, Passport, Flowbird, ParkChicago, ParkSmarter;
- маркетплейсы: SpotHero, ParkWhiz/BestParking, Parking.com.

Поэтому архитектура должна быть многоисточниковой. Цель MVP: не "100% truth", а лучший known parking graph с source, freshness, confidence и queue на добор данных.

## 2. Самый простой рабочий путь

1. Начать с городов, где есть официальные open data.
2. Для street parking рисовать линии/curb segments, а не только точки.
3. Для garages/lots взять OSM + operator websites + city-owned lots.
4. Цены добирать по приоритету: official rates -> operator page -> marketplace public price -> AI call -> user report.
5. Google Places использовать только как discovery/matching, а не как master database, потому что Google Places policy запрещает pre-fetch/cache/store Places content сверх исключений; `place_id` можно хранить.

## 3. Источники по типам парковок

| Слой | Источник | Что дает | Метод | AI нужен? |
|---|---|---|---|---|
| Street meters | City open data: Socrata/ArcGIS/CKAN | meter points, blockfaces, status, zones, иногда rates | API ETL | нет |
| Street rules/signs | NYC signs, CurbLR/CDS, city sign inventory | no parking/loading/street cleaning/permit | API ETL + rule parser | да, для text-to-rule |
| Curb segments | city blockface datasets, OSM highway, CurbLR | линии вдоль дороги, стороны улицы | GIS algorithm | нет/иногда |
| Garages/lots | OSM `amenity=parking`, Overture Places/Buildings, city facilities | base inventory, polygons, names | ETL + dedupe | нет |
| Private operator inventory | ABM, Parking.com/SP+, LAZ, Premium, Metropolis, airports, venues | адрес, цена, booking, monthly | site/API parser | да, для dynamic pages |
| Marketplace inventory | SpotHero, ParkWhiz, BestParking, Parking.com | bookable prices | партнер/API/affiliate; scraping risky | да, но осторожно |
| Valet | city valet permits, restaurant/hotel pages, Google/OSM clues | valet zones, hours, phone | permit ETL + web enrichment | да |
| Pricing | city rates, operator pages, rate PDFs, app flows | hourly/daily/monthly/event | parser + structured extraction | да |
| Availability | sensors, payment occupancy, operator feeds, predictions | real-time/probability | model/API | да, для prediction |
| Verification | calls, user photos, admin review | актуальность | workflow | да |

## 4. Где брать city open data

### Поиск источников

Автоматический crawler должен искать:

- Socrata portals: `data.<city>.gov`, `data.cityof...`, `dev.socrata.com/foundry/...`;
- ArcGIS REST: `FeatureServer`, `MapServer`, `query?where=1=1&outFields=*&f=json`;
- CKAN/Data.gov records;
- city DOT / parking authority pages;
- PDF/CSV attachments с rate schedules;
- CurbLR/CDS feeds, если город их публикует.

Поисковые запросы для автоматического discovery:

- `"parking meters" site:data.<city>.gov`
- `"meter rate" "Socrata" "<city>"`
- `"parking regulation signs" "<city>" open data`
- `"curb" "CurbLR" "<city>"`
- `"parking meter inventory" "FeatureServer" "<city>"`
- `"parking occupancy" "open data" "<city>"`

### Проверенные города и ссылки

#### San Francisco

Лучший стартовый город.

- Parking Meters DataSF / Socrata: https://dev.socrata.com/foundry/data.sfgov.org/8vzz-qzz9
- SFMTA Parking Meters overview: https://www.sfmta.com/tl/node/24103
- Meter Rate Schedules: https://catalog-beta.data.gov/dataset/meter-rate-schedules
- Meter Policies: https://data.sfgov.org/Transportation/Meter-Policies/qq7v-hds4
- DataSF portal: https://data.sfgov.org/

Актуальность:

- Parking Meters dataset обновляется weekly.
- Meter Policies dataset указывает daily updates для изменений operating/rate schedules.
- Rate Schedules содержит Base Rate и overrides; нужно учитывать operating schedules и time limit = 0 как "parking unavailable".

Что строить:

- meter points;
- curb segments через `blockface_id`;
- price schedule table по `post_id`;
- rules: base/override rate, operating schedule, tow/loading exceptions.

#### New York City

Очень хороший город для street rules.

- NYC Parking Meters Locations and Status: https://data.cityofnewyork.us/Transportation/Parking-Meters-Locations-and-Status/693u-uax6
- NYC Parking Regulation Locations and Signs: https://data.cityofnewyork.us/Transportation/Parking-Regulation-Locations-and-Signs/nfid-uabd
- NYC DOT parking rates page: https://www.nyc.gov/html/dot/html/motorist/parking-rates.shtml
- Socrata API for parking signs: https://dev.socrata.com/foundry/data.cityofnewyork.us/nfid-uabd

Актуальность:

- Meter locations/status dataset: weekly update, daily data change frequency, automated.
- Parking signs dataset: current and historical signs; updated in May 2026 на момент проверки.
- Цены сложнее: dataset дает meter hours/status/pay-by-cell, а тарифы часто берутся из rate zones DOT page. Нужен rate-zone join.

Что строить:

- munimeter points;
- signs -> curb rule points;
- line segments по `on_street`, `from_street`, `to_street`, `side_of_street`;
- NLP parser для знаков: alternate side, no standing, commercial loading, school days.

#### Los Angeles

Хорош для live/sensor концепции, но сложнее как первый город.

- LADOT Parking Meters: https://ladotparking.org/parking-meters/
- LA Express Park about: https://www.laexpresspark.org/about-la-expresspark/
- LA Express Park apps: https://www.laexpresspark.org/technology/apps/
- LADOT real-time parking data press release: https://ladot.lacity.gov/sites/default/files/press-releases/ladot-press-release-publishes-real-time-parking-data-to-empower-drive-innovation.pdf
- DataLA portal: https://lacity.gov/government/open-data
- LADOT Parking Meter Occupancy dataset page: https://data.lacity.org/w/e7h6-4a3e/ir6t-6fx6

Актуальность:

- LADOT пишет про 35,000+ metered spaces.
- LA Express Park использует demand-based pricing.
- LADOT press release говорит о 5,450 sensors в Downtown, Westwood, Hollywood и API/open portal для inventory + live occupancy.

Что строить:

- meter inventory ETL;
- occupancy polling для sensor subset;
- demand price schedule по ExpressPark areas;
- fallback на ParkMobile/ParkSmarter/ParkMe app data через партнерства или осторожный app/web analysis.

#### Seattle

Хорош для blockface model и occupancy.

- Paid Parking Occupancy Last 30 Days: https://data.seattle.gov/Transportation/Paid-Parking-Occupancy-Last-30-Days-/rke9-rsvs
- Blockface space inventory: https://data.seattle.gov/Transportation/Blockface-space-inventory/kqdm-4wfs
- SDOT maps and data: https://www.seattle.gov/transportation/projects-and-programs/programs/parking-program/maps-and-data
- SDOT rate update blog example: https://sdotblog.seattle.gov/2024/03/14/street-parking-rates-update-march-2024/

Актуальность:

- Occupancy Last 30 Days обновляется weekly и имеет 7-day delay.
- В описании occupancy dataset прямо сказано, что `PaidParkingRate` blank для текущих time-of-day rates, потому что ставки варьируются morning/mid-day/evening.
- SDOT обновляет street parking rates сезонно/регулярно и показывает их на interactive map.

Что строить:

- blockface lines как primary geometry;
- time-of-day rate table;
- occupancy probability model, а не true real-time.

#### Chicago

Open data слабее по meter rates, но есть сильный official app/map.

- ParkChicago map: https://map.parkchicago.com/
- ParkChicago find parking: https://parkchicago.com/find-parking
- ParkChicago FAQ/rates: https://parkchicago.com/faq
- ParkChicago about/rate tiers: https://parkchicago.com/about/
- Chicago Parking Permit Zones open data: https://catalog.data.gov/dataset/parking-permit-zones

Актуальность:

- ParkChicago заявляет 36,000 metered spaces.
- Rates mostly tiered: $2.50 outside Loop/CBD, $4.75 CBD, $7.00 Loop, $14 commercial loading zones.
- ParkChicago Map itself предупреждает, что signage prevails and app information may be inaccurate if actual signage differs.

Что строить:

- rate tier polygons/areas;
- ParkChicago zone extraction только если юридически допустимо или через partnership;
- residential permit zones из city open data.

## 5. Как делать зонирование как на фото

Нужно поддерживать 4 типа геометрии:

1. `Point` - meter, pay station, garage entrance, valet stand.
2. `LineString` - curb segment / street-side parking along road.
3. `Polygon` - garage footprint, surface lot, airport lot, campus lot, parking zone.
4. `MultiPolygon` - большие зоны: rate district, permit zone, demand-pricing area.

### Street parking вдоль дороги

Да, лучше линиями. Правильная модель:

- один curb segment = одна сторона блока от intersection A до intersection B;
- поля: `street`, `from_street`, `to_street`, `side`, `rate_schedule_id`, `rule_schedule_id`, `capacity`, `confidence`;
- линия должна идти не по центру дороги, а offset к стороне curb.

MVP:

- группировать meter points по `blockface_id`;
- сортировать точки вдоль dominant axis;
- строить LineString;
- цветом показывать price/rule/confidence.

Production:

- взять road centerline из OSM/Overture/city GIS;
- найти соответствующий segment по street/from/to/side или nearest-line matching;
- сделать offset line на 3-6 метров вправо/влево по стороне улицы;
- split line на участки, где меняются правила;
- snap meter/pay station points к curb line;
- если есть CurbLR/CDS, использовать их line geometry как primary source.

### Зоны/полигоны

Для off-street parking:

- OSM polygons `amenity=parking`;
- Overture building footprints/places;
- city parcel/building footprints;
- image segmentation с aerial imagery только как advanced;
- operator lot boundary из сайта/Google визуально не копировать как master.

Важное уточнение по текущему PoC:

- красные квадраты на карте сейчас являются `candidate polygons`, а не реальными parking footprints;
- они нужны только как временная демонстрация слоя;
- в продукте их нельзя показывать как "реальную парковочную зону" без пометки confidence/approximate;
- настоящая зона должна быть `Polygon/MultiPolygon` из authoritative GIS, OSM polygon/relation, parcel/building footprint, operator-provided geometry или human-reviewed tracing.

Приоритет источников для таких зон:

1. City GIS parking/parcel/lot polygons.
2. OSM closed ways/multipolygon relations with `amenity=parking`, `parking=*`, `parking=surface`, `parking=multi-storey`, `parking=underground`.
3. Overture Maps buildings/places + parcel/building matching.
4. Microsoft/other building footprints для garage footprint, если гараж внутри building.
5. Operator-provided maps/feeds.
6. Semi-automated aerial imagery segmentation + human QA.

Для OSM важно не терять relations. Простого Overpass `out center` недостаточно: он часто дает center point, а не polygon. Нужен полноценный OSM parser:

- `osmtogeojson` for Overpass JSON -> GeoJSON polygons;
- `pyosmium`/`osmium` for PBF extracts;
- `osm2pgsql`/PostGIS для production import;
- обработка multipolygon relations;
- fallback point должен помечаться как candidate, не footprint.

Для rate/permit zones:

- city zone polygons, если есть;
- иначе geocode signs/meters and infer convex/concave hull by neighborhood/block groups;
- хранить как inferred zone с низким confidence.

### Визуальная схема

- Красный polygon: off-street lot/garage footprint.
- Синяя/зеленая/оранжевая линия: street curb parking по цене/доступности.
- Пунктир: rule uncertain / needs verification.
- Серый: unknown price.
- Толщина линии: capacity или meter density.
- Opacity: confidence/freshness.

## 6. Где подключать AI-агентов

### Не нужен AI, достаточно алгоритмов

- Socrata/ArcGIS/CKAN API ingestion;
- OSM/Overture import;
- geocoding open datasets;
- dedupe по distance/name/address;
- построение линий из blockface/meter points;
- join rates по `post_id`, `zone`, `blockface_id`;
- scheduled freshness checks;
- map tiling/vector tile generation.

### Нужен AI, но не LLM-агент в браузере

- парсинг текстовых rules/signs в структуру;
- извлечение цен из PDF/rate boards;
- нормализация "Mon-Fri 8AM-6PM except holidays";
- classification: garage vs lot vs valet vs customer-only;
- conflict resolution summary for admin.

### Нужны web agents / browser automation

Там, где site dynamic и нет API:

- operator search pages;
- booking pages with date/time selectors;
- airport/venue parking pages;
- monthly parking forms;
- rate pages hidden behind JS.

Алгоритм:

1. Agent открывает страницу location/search.
2. Вводит адрес/дату/время.
3. Сохраняет screenshot/HTML/network metadata.
4. Извлекает cards: name, address, price, available, booking URL.
5. Сравнивает с предыдущим snapshot.
6. Если поменялась структура страницы, отправляет в parser repair queue.

Важно: для крупных маркетплейсов лучше партнерство/API/affiliate. Browser scraping использовать как research/prototype, не как устойчивую основу.

### Нужны AI-звонки

Звонки использовать только для high-value gaps:

- нет цены;
- цена конфликтует;
- популярное место;
- event/airport/monthly;
- закрытие/открытие неясно;
- valet conditions.

Скрипт звонка:

1. "Мы обновляем справочник парковок для водителей."
2. "Это публичная парковка?"
3. "Какие цены за час/день/ночь/месяц?"
4. "Меняется ли цена по времени или событиям?"
5. "Какие часы работы?"
6. "Есть ли overnight/monthly/EV/accessible/height clearance?"
7. "Где въезд?"
8. "Есть сайт или страница бронирования?"

Выход:

- transcript;
- extracted structured facts;
- confidence;
- next_review_at;
- flag if human review needed.

Юридически: TCPA/robocall, consent на запись по штатам, opt-out, не звонить слишком часто.

## 7. Продвинутый парсинг операторов

### Parking.com / SP+ / Metropolis

Что брать:

- location pages;
- daily/monthly/event rates;
- booking URLs;
- entrance/address/hours/amenities.

Алгоритм:

- sitemap/search by city;
- карточки locations;
- network инспекция JSON endpoints;
- даты/времени для price scenarios: now + 2h, today 8h, overnight, monthly;
- хранить price scenario, not one price.

### ABM Parking

ABM пишет, что у них 2,000+ parking locations в 230+ cities и rates/book direct на сайте.

Источник: https://abmparking.com/

Алгоритм:

- search page по city/address;
- extract cards + facility pages;
- query combinations для hourly/monthly;
- если цена отсутствует, AI call или contact form/manual.

### Premium Parking

Premium support page говорит, что daily/monthly rates visible on website/app, rates can change.

Источник: https://support.premiumparking.com/support/solutions/folders/12000011947

Алгоритм:

- location page parser;
- API/network extraction if website loads location JSON;
- scenario-based price checks;
- monthly availability flag.

### LAZ Parking

LAZ часто не дает универсальный публичный API; rates vary by location/time/event.

Алгоритм:

- location page discovery via search/sitemap/Google only as pointer;
- parse individual facility pages/PDFs;
- phone validation for high-demand locations;
- operator outreach for feed.

### Airports / venues / universities / hospitals

Это отдельный слой, часто самый ценный:

- airport official parking pages/reservation engine;
- stadium/event venue parking pages;
- university parking maps;
- hospital visitor parking.

Алгоритм:

- seed list from FAA/airport directories, venue APIs, Google/OSM;
- parse official parking pages;
- extract lots/garages as polygons or points;
- event pricing as separate `price_type=event`.

## 8. Цена по времени

Нельзя хранить `price=5`. Нужно хранить schedule:

```json
{
  "facility_id": "...",
  "price_type": "hourly",
  "amount": 4.0,
  "days": ["Mon", "Tue", "Wed", "Thu", "Fri"],
  "start_time": "09:00",
  "end_time": "18:00",
  "max_duration_minutes": 120,
  "effective_from": "2026-01-01",
  "effective_to": null,
  "source": "DataSF Meter Rate Schedules",
  "confidence": 0.85
}
```

Для dynamic/event rates:

- scenario pricing: `weekday_morning`, `weekday_midday`, `evening`, `weekend`, `event`;
- observed_at timestamp;
- source URL/screenshot/transcript;
- expiration/next refresh.

## 9. Data freshness score

Каждый факт должен иметь freshness:

- official API daily/weekly: high;
- operator page last seen < 7 days: medium-high;
- phone call < 30 days: medium-high;
- user report with photo < 14 days: medium;
- OSM old object with no price: low;
- marketplace price screen: valid only for scenario/time.

Пример:

- existence_confidence;
- price_confidence;
- rule_confidence;
- geometry_confidence;
- availability_confidence.

## 10. Инструменты

### ETL/API

- Python: requests/httpx, duckdb, polars/pandas, pydantic.
- Socrata: SODA API, app token optional.
- ArcGIS REST: query endpoints, pagination by resultOffset/resultRecordCount.
- OSM: Overpass for small areas; for scale use Geofabrik extracts + osmium/osmnx.
- Overture: DuckDB over GeoParquet on S3.

### GIS

- PostGIS for master storage.
- Tippecanoe or Martin for vector tiles.
- Turf.js for frontend geometry operations.
- Shapely/GeoPandas for backend geometry.
- MapLibre GL / Mapbox GL for vector tile rendering.
- Leaflet is enough for PoC, not ideal for national-scale.

### AI

- LLM structured extraction for PDF/web/rules.
- Browser agents for dynamic web pages.
- Speech-to-text + structured extraction for call transcripts.
- Vision/OCR for rate board photos and user-submitted signs.

## 11. Рекомендуемый порядок запуска

### Week 1-2: SF

- DataSF meters + rates + policies.
- Lines by blockface.
- OSM garages/lots.
- Admin screen for gaps.

### Week 3-4: NYC

- Munimeters + parking signs.
- Rule parser.
- Line segments by side of street.

### Week 5-6: Seattle

- Blockface inventory + occupancy.
- Time-of-day pricing model.

### Week 7-8: Off-street operators

- ABM parser.
- Parking.com/SP+ parser or affiliate outreach.
- Premium/LAZ sample parsers.
- AI call queue.

### Week 9-12: Proof of coverage

- Compare against Google/SpotHero/Parkopedia/ParkMobile manually in 10 zones per city.
- Measure:
  - objects found;
  - objects with price;
  - objects with usable rule;
  - stale/conflict rate;
  - user task success: cheapest/closest/legal-now.

## 12. Реализованный PoC

В workspace уже есть:

- `apps/backend/scripts/fetch_datasf_meters.py` - official DataSF meters + rates.
- `apps/backend/scripts/build_sf_curb_segments.py` - группирует meter points в approximate curb lines.
- `apps/backend/scripts/fetch_osm_parking_zones.py` - загружает OSM parking candidates и строит candidate polygon layer для визуальной проверки.
- `parking_map_poc.html` - режимы "Линии вдоль дороги", "Кандидаты зон", "Точки", "Линии + точки", "Линии + кандидаты зон + точки".
- `data/sf_parking_datasf.geojson` - 33,511 SF meter points.
- `data/sf_parking_curb_segments.geojson` - 2,889 derived curb segments.
- `data/sf_parking_zones_osm.geojson` - 403 candidate polygons для downtown SF; это не authoritative footprints.

Локально:

http://localhost:8765/parking_map_poc.html

## 13. Ключевые ссылки

- Google Places policies: https://developers.google.com/maps/documentation/places/web-service/policies
- Google Place IDs: https://developers.google.com/places/place-id
- OSM Street parking: https://wiki.openstreetmap.org/wiki/Street_parking
- OSM Parking: https://wiki.openstreetmap.org/wiki/Parking
- Overture docs: https://docs.overturemaps.org/
- Overture AWS data: https://registry.opendata.aws/overture/
- CurbLR: https://www.curblr.org/
- OMF Curb Data Specification: https://github.com/openmobilityfoundation/curb-data-specification

## 14. Готовые open-source pieces, чтобы не начинать с нуля

Не нашел готового open-source продукта уровня "единая Parkopedia для США", который можно просто взять и запустить. Но есть хорошие строительные блоки:

Самый близкий найденный проект - PNNL / parking. Это "Dynamic Curb Allocation Application": full-stack web app для real-time parking availability на карте. Его стоит рассматривать как reference architecture или skeleton, а не как готовую базу всех парковок.

| Проект | Ссылка | Что можно взять |
|---|---|---|
| PNNL parking | https://github.com/pnnl/parking | Самый близкий найденный skeleton: Dynamic Curb Allocation Application. Есть Next.js frontend, Postgres/PostGIS, GraphQL, Prisma, Docker Compose, OSM map tiles, real-time availability, predictive modeling, external sensor data. Не "все парковки США", но хороший reference architecture. |
| OMF Curb Data Specification | https://github.com/openmobilityfoundation/curb-data-specification | Стандарт данных/API для curb zones, rules, events, metrics. Нужен как целевая модель для curb/parking regulation слоя. |
| CurbLR | https://www.curblr.org/ | GeoJSON-формат для curb regulations на базе linear referencing. Полезен для street/curb zones. |
| A/B Street | https://github.com/a-b-street/abstreet | Open-source traffic sim на OSM; есть parking model и parking mapper ideas. Хорошо изучить модель street parking/lots/capacity. |
| A/B Street parking docs | https://a-b-street.github.io/docs/tech/trafficsim/parking.html | Как моделировать on-street parking как lane и parking lots как public/private capacity. |
| A/B Street parking mapper | https://a-b-street.github.io/docs/software/parking_mapper.html | Идеи для интерфейса маппинга street parking. |
| OSM Parking Lane Tag Updater | https://github.com/osmberlin/osm-tag-updater | TypeScript tool для преобразования старых `parking:lane` тегов в новую OSM street parking schema. |
| osmtogeojson | https://github.com/tyrasd/osmtogeojson | Конвертация Overpass/OSM JSON в GeoJSON с polygon/relation support. Лучше нашего простого PoC-конвертера. |
| osm2pgsql | https://github.com/osm2pgsql-dev/osm2pgsql | Production import OSM в PostGIS, включая polygons/relations. |
| pyosmium | https://github.com/osmcode/pyosmium | Python bindings для чтения OSM PBF/history, удобно для ETL. |
| MapLibre GL JS | https://github.com/maplibre/maplibre-gl-js | Frontend карта для vector tiles; лучше Leaflet для национального масштаба. |
| Martin | https://github.com/maplibre/martin | Tile server из PostGIS/PMTiles. |
| Tippecanoe | https://github.com/felt/tippecanoe | Генерация vector tiles из GeoJSON/large geodata. |
| Raster Vision | https://github.com/azavea/raster-vision | Open-source framework для segmentation/object detection на aerial/satellite imagery. Advanced вариант для parking lot footprint detection. |
| ParkSeg / parking lot segmentation paper | https://huggingface.co/papers/2412.13179 | Исследование/датасет по segmentation parking lots from satellite/NIR imagery. Не product-ready, но полезно для ML-пайплайна. |

Рекомендация: не искать один "готовый проект", а собрать stack из этих pieces:

- PostGIS + osm2pgsql/pyosmium для геоданных;
- Socrata/ArcGIS connectors для city data;
- OMF CDS/CurbLR-compatible schema;
- MapLibre + vector tiles для карты;
- osmtogeojson/osmium для OSM polygons/relations;
- AI agents только для enrichment gaps.

Практический вывод:

1. Взять идеи/архитектуру из PNNL parking: PostGIS, Docker, frontend map, data model.
2. Для OSM использовать `osm2pgsql` или `osmtogeojson`, а не текущий простой PoC-парсер.
3. Для street parking изучить A/B Street и OSM Parking Lane Tag Updater.
4. Для карты сразу переходить на MapLibre/vector tiles, если цель - города/штаты, а не один PoC.
5. Уникальный слой продукта: connectors к city open data, operator parsers, AI-звонки, confidence/freshness.

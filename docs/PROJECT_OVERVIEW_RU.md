# OpenParking - понятное описание проекта и главный источник правды

Дата: 2026-07-08

Этот документ - главный продуктовый и архитектурный источник правды для OpenParking. Проект раньше назывался ParkingUSA; внутренние API-пути, canonical fields и технические идентификаторы с префиксом `parkingusa` могут сохраняться для совместимости, пока не будет отдельной миграции. Остальные документы, задачи, API, импортеры и UI должны сверяться с этим файлом. Если другой документ противоречит этому файлу, сначала обновляем этот файл, потом приводим остальные материалы и код к нему.

Документ объясняет OpenParking простым языком: что мы строим, как это будет работать, какие данные нужны, откуда брать парковки по США, где нужны обычные API, где нужны парсеры, где нужны браузерные агенты, а где уже придется подключать звонки, партнерства или ручную проверку.

Термины на английском оставлены там, где они важны для разработки. Рядом дается перевод или пояснение в скобках.

## 0. Как сейчас устроен проект в репозитории

Если смотреть на текущий код, OpenParking работает так:

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
| Лендинг | `apps/frontend/app/page.tsx`, `apps/frontend/public/hero/openparking-hero-dark.mp4`, `apps/frontend/public/hero/openparking-hero-light.mp4` | Публичный OpenParking first screen с брендом, CTA, синхронизированной светлой/темной темой и полноэкранным theme-aware видеофоном |
| Главная карта | `apps/frontend/app/map/page.tsx`, `apps/frontend/components/ParkingMap.tsx` | Пользовательский map-first экран с MapLibre, поиском, desktop SVG shortcut controls в стиле map-service sidebar, compact city/mode controls, Yandex-inspired навигационной панелью `Откуда`/`Куда`, bottom-sheet фильтрами на mobile, auto-peek поведением панели при движении карты, compact mobile theme toggle, отдельным режимом Data quality для review/conflict объектов и skeleton/error state при загрузке карты |
| Админ-карта | `apps/frontend/app/map/admin/page.tsx` | Скрытый внутренний маршрут `/map/admin`: тот же полнофункциональный MapLibre workspace, что `/map`, но с начальной review-очередью, conflict/review/payment actions и служебными фильтрами; публичная карта не содержит ссылки на админку |
| API routes | `apps/frontend/app/api/*/route.ts` | Публичные ручки для карты и данных |
| Загрузка данных | `apps/frontend/lib/data-loader.ts` | Общий вход: БД или GeoJSON fallback |
| Загрузка из БД | `apps/frontend/lib/db-loader.ts` | Prisma -> GeoJSON для frontend |
| Подключение Prisma | `apps/frontend/lib/db.ts` | Проверка `DATABASE_URL` и fallback при ошибке |
| Схема БД | `apps/backend/prisma/schema.prisma` | DataSource, ParkingFacility, CurbSegment, ParkingZone, SourceObservation |
| Импорт SF в БД | `apps/backend/scripts/import_sf_to_db.mjs` | Загружает текущие San Francisco файлы в Prisma/PostGIS |
| Research worker v0 | `apps/backend/scripts/run_phase6_research_worker.mjs` | Генерирует/проверяет research manifests |
| Research manifests | `data/research/*.json` | Источники, ссылки, parser specs, gaps |

Полное операторское обновление текущего Miami/Miami-Dade контура запускается из корня репозитория командой `npm run data:refresh:all`. Сначала она обновляет официальные Miami Beach fallback fixtures и записывает фактическое время live snapshot в `data_as_of`, затем запускает установленный Docker Desktop на Windows при необходимости, поднимает локальный PostGIS, принудительно скачивает свежий Florida Geofabrik PBF и Miami-Dade boundary, импортирует ArcGIS и OSM в canonical DB tables и выполняет geometry audit, validation, typecheck, tests и frontend build. Нужны установленный Docker Desktop и сетевой доступ; предварительный план без скачивания и изменений доступен через `npm run data:refresh:all:dry-run`.

### 0.1 Какие API уже реализованы

API реализован прямо в Next.js frontend-приложении через App Router. Физически это файлы `route.ts` внутри `apps/frontend/app/api/`.

| URL | Файл | Что возвращает | Откуда берет данные |
| --- | --- | --- | --- |
| `/api/stats` | `apps/frontend/app/api/stats/route.ts` | Сводку: сколько facilities, priced facilities, curb segments, zones, а также отдельные metrics для provenance, payment links и booking links | `loadAllLayers()` + canonical `/api/parking-index` properties из `data-loader.ts` |
| `/api/facilities` | `apps/frontend/app/api/facilities/route.ts` | GeoJSON парковочных объектов с фильтрами | `loadFacilities()` |
| `/api/parking-index` | `apps/frontend/app/api/parking-index/route.ts` | Единый ParkingUSA canonical coverage feed: facilities + curb lines + zones в одном GeoJSON | `loadParkingIndex()` |
| `/api/geojson/facilities` | `apps/frontend/app/api/geojson/[layer]/route.ts` | Полный GeoJSON слой street meters/facilities | `loadFacilities()` |
| `/api/geojson/segments` | `apps/frontend/app/api/geojson/[layer]/route.ts` | GeoJSON curb segments | `loadCurbSegments()` |
| `/api/geojson/zones` | `apps/frontend/app/api/geojson/[layer]/route.ts` | GeoJSON parking zones/lots из OSM | `loadZones()` |
| `/api/geojson/boundary` | `apps/frontend/app/api/geojson/[layer]/route.ts` | Нейтральный контур выбранной coverage-зоны города; для `city=miami` это Miami-Dade County | `loadCityBoundary()` |
| `/api/observations` | `apps/frontend/app/api/observations/route.ts` | Наблюдения/доказательства по источникам из БД | Prisma `SourceObservation` |
| `/api/route` | `apps/frontend/app/api/route/route.ts` | MVP-маршрут от текущей/ручной/выбранной на карте точки до выбранной парковки или выбранного на карте финиша | Server-side Valhalla через `VALHALLA_URL` |
| `/api/geocode/forward` | `apps/frontend/app/api/geocode/forward/route.ts` | Forward-геокодинг через OpenCage: поиск адреса/места по тексту `q` c опциональным `language=en|ru`; результат кликабелен — карта летит к выбранной точке | Server-side OpenCage API через `OPENCAGE_API_KEY`; без ключа возвращает `{ status: "unconfigured" }` и не показывает строку поиска |

Поддержанные фильтры в `/api/facilities`:

- `type` - например `street_meter`;
- `price=known`, `price=unknown` или `price=free`; фильтр использует canonical `price_status`, где известной ценой считаются только `known_priced` и `known_free`;
- `source` - фильтр по `source_name` / `last_verified_source`;
- `trust=reliable|likely|all|review|conflict` - driver-facing фильтр надежности: по умолчанию UI использует `likely`, включая review-only кандидатов без явного конфликта для максимального покрытия; `all` не показывает явные conflicts, а `review/conflict` нужны для проверки данных;
- `confidence=high|medium|low|review`;
- `q` - поиск по name/operator/source_id/street/neighborhood и canonical `facility_type`; поддерживаются двуязычные ключевые слова для типов (например, `garage`/`гараж`, `surface lot`/`площадка`, `street meter`/`паркомат`, `valet`);
- `limit` - ограничение количества объектов.

`trust` не заменяет технический `confidence`: для пользователя он строится из `display_confidence`, затем `offer_confidence`, затем `confidence/source_confidence`, а также из флагов `not_ordinary_parking_offer`, `needs_field_review`, stale/conflict statuses и `access=no`. Это сохраняет важное разделение DEV-63: источник может быть official/high-confidence, но конкретный parking offer для водителя может оставаться низкоуверенным или conflict evidence.

Важно: единые поля `source_url`, `api_url`, `payment_url`, `booking_url`, `evidence_url` уже протянуты через schema/loaders/API/UI contract. Главный оставшийся product gap - сами transactional links: в проверенных GeoJSON `payment_url` и `booking_url` почти везде отсутствуют, поэтому UI показывает готовые поля, но metrics честно отражают нулевое или низкое покрытие ссылками оплаты/брони.

### 0.2 Какие данные реально есть сейчас

Сейчас default city для приложения - Miami. В DB mode он читает широкий `Miami + Miami-Dade` OSM/Geofabrik baseline, чтобы на карте появлялись parking candidates уровня OpenStreetMap `P` icons, включая Miami Beach и соседние районы. Official Miami/Miami Beach файлы остаются enrichment/fallback-слоями с более сильной provenance для конкретных объектов. San Francisco остается benchmark baseline: он лежит в `data/` и может быть импортирован в PostGIS.

Miami fallback:

| Файл | Что внутри | Количество | Источник | Ссылка на источник/API |
| --- | --- | ---: | --- | --- |
| `data/miami_parking_facilities.geojson` | Garages/lots/facilities в Miami | 12 | Miami Parking Authority + Miami-Dade County parking facilities | MPA: https://www.miamiparking.com/, Miami-Dade: https://www.miamidade.gov/global/service.page?Mduid_service=ser1478201414291250 |
| `data/miami_beach_parking_wpgmza.geojson` | Miami Beach garages/lots official map markers | 74 | City of Miami Beach Parking Department | Source: https://www.miamibeachfl.gov/city-hall/parking/parking-garages-lot-locations/, API: https://www.miamibeachfl.gov/wp-json/wpgmza/v1/markers?map_id=17 |
| `data/miami_beach_parking_arcgis_facilities.geojson` | Miami Beach official parking lot centroids + street meters | 535 | City of Miami Beach Parking GIS | API root: https://gis.miamibeachfl.gov/public/rest/services/mb/Parking/FeatureServer |
| `data/miami_beach_parking_arcgis_lots_zones.geojson` | Miami Beach official parking lot polygons plus residential/regulatory parking-zone polygons | 532 | City of Miami Beach Parking GIS | Layer 5 = actual Parking Lots; layer 7 = Residential Parking Zones / rule boundaries, not guaranteed parking places; one upstream null-geometry zone is preserved only in raw evidence |
| `data/miami_beach_parking_arcgis_spaces.geojson` | Raw official Miami Beach street parking spaces | 10,998 | City of Miami Beach Parking GIS | Layer 3 from ArcGIS FeatureServer; preserved for future street-space UI, not yet counted as facilities |
| `data/miami_parking_osm.geojson` | Optional OSM mixed-geometry coverage baseline: points, street-side/open ways, polygons | generated by `npm run fetch:osm:miami` | OpenStreetMap via Overpass | Loader automatically splits Point -> facilities, LineString -> curb/segments, Polygon/MultiPolygon -> zones |
| `data/research/miami-source-inventory-20260611.json` | Source inventory для расширения Miami | 23 source candidates | MPA, Miami-Dade, Miami Beach ArcGIS, MIA, PortMiami, Coral Gables, OSM/Geofabrik, Overture, operators | Используется для следующего ingestion/parser шага |

Что значит этот слой:

- `miami_parking_facilities.geojson` - seed fixture, а не полный city baseline. Он нужен, чтобы ParkingUSA работал по Miami first и сразу сохранял source/provenance.
- OSM `parking=yes` на родительском объекте (парк, гольф-клуб, отель, магазин, здание и т.п.) означает только наличие парковки где-то у объекта и не превращает весь родительский полигон в parking facility. Такие incidental tags исключаются audit/fetch-скриптами и frontend fallback loader; отдельная парковка принимается только как `amenity=parking/parking_entrance/parking_space` либо как самостоятельная геометрия с конкретным `parking=surface/multi-storey/underground/...` без другого основного назначения.
- `miami_beach_parking_wpgmza.geojson` - adjacent Miami metro official-source layer. Он добавляет 74 public garage/lot records с координатами, spaces, hourly/event rates, ParkMobile zones и EV charging notes. Для записей с ParkMobile zone ParkingUSA теперь также протягивает `payment_provider = ParkMobile / PayByPhone`, официальный Miami Beach PayByPhone app URL и `payment_note`; `payment_url` остается пустым, пока нет точной per-record checkout-ссылки.
- `miami_beach_parking_arcgis_facilities.geojson` - первый большой прирост покрытия: 75 official Miami Beach lot/garage centroids плюс 460 official street meters. Это official GIS source, но географически это Miami Beach, а не City of Miami municipal inventory.
- `miami_beach_parking_arcgis_lots_zones.geojson` смешивает два разных смысла: layer 5 `Parking Lots` - реальные lot/garage полигоны, а layer 7 `Parking Zones` - residential/regulatory road-side rule areas. Для layer 7 нельзя говорить "здесь есть парковка на всей площади"; это зоны правил/permit/метерного режима вдоль дорог. В canonical metadata такие записи сохраняют расшифровку `ZONE_`, `ZONE_TYPE` и `RESTRICTED_RES_TIME`, но они не отдаются как нормальные `/api/geojson/segments` curb lines и не рендерятся как обычное parkable curb offer на главной карте.
- `miami_beach_parking_arcgis_spaces.geojson` сохраняет 10,998 official street-space records как raw fixture по refresh 2026-07-15. Их нельзя показывать как отдельные прямоугольные полигоны или внутренние ряды парковки в curb-слое: frontend loader сначала исключает точки, попавшие внутрь parking lot/garage polygon, а оставшиеся street-side points группирует в прямые `LineString` curb rows. Если legacy rows приходят как Polygon/MultiPolygon, они нормализуются в линии по длинной оси. Parking lots остаются polygon zones, regulatory/residential rule polygons остаются вне normal curb layer, а слишком длинные generated parking-space rows (>150 м) не публикуются как обычные curb segments до road-side snapping/field review. Для Miami добавлен детерминированный geometry QA: `apps/frontend/lib/parking-geometry-quality.ts` и `npm run audit:parking-geometry:miami` сверяют generated curb rows с OSM road centerlines, OSM buildings и official lot/garage polygons. Accepted line должна быть прямой, параллельной дороге, offset от road centerline, рядом с дорогой и не пересекать building/parking-area interior; плохие road matches остаются `needs_field_review`, пересечения с buildings/interiors подавляются.
- DEV-49 field audit по South Beach/Ocean Drive/Collins/Lincoln зафиксирован в `docs/SOUTH_BEACH_FALSE_POSITIVE_AUDIT_DEV-49_RU.md` и `data/research/field-audits/dev-49-south-beach-false-positive-audit.json`: layer 7 `Parking Zones` не является ordinary parking offer; layer 3 generated curb rows должны иметь пониженный `display_confidence` до road-side snapping/valet-dropoff/no-parking conflict checks; layer 1 meter points являются payment-equipment evidence; OSM `parking_entrance`, `access=no/private/customers/permit` и low-detail unnamed candidates не должны попадать в default public-parking layer. DEV-63 реализует split `source_confidence` vs `offer_confidence`/`display_confidence`: source evidence для официальных Miami Beach ArcGIS слоев остается высоким, но driver-facing confidence для layer 7 regulatory zones capped at `0.35`, для layer 3 generated curb rows capped at `0.55`, для layer 1 meter/payment equipment capped at `0.5`; field evidence по valet/drop-off/no ordinary parking и zone/location `40208` сохраняется как `SourceObservation` conflict/payment evidence, а не как гарантированная parking availability.
- DEV-69 frontend safety: главная MapLibre карта разделяет curb `segments` на обычные высокоуверенные curb offers и справочные/низкоуверенные evidence-сегменты. `not_ordinary_parking_offer`, `needs_field_review`, residential/regulatory zones, payment-equipment evidence и `display_confidence < 0.6` больше не рисуются как обычные синие бордюрные линии в default `both/all` view; они вынесены в отдельный пунктирный amber overlay, видимый только в режиме `segments`, с отдельным счетчиком `справочные/проверка`.
- Текущий UX refinement главной карты: карта остается главным объектом. Фокус в крупном поиске открывает Yandex Maps-inspired discovery panel с touch-friendly SVG-категориями (`Garages`, `Lots`, `Meters`, `Known price`, `Valet`, `All types`); после начала ввода категории заменяются числом найденных мест и сортировкой. До поискового запроса сортировка не показывается. Затем идут city chips, compact `Find parking` / `Data quality` segmented control и быстрые reliability presets; type/price/display/source/confidence убраны в collapsible `Advanced filters`, чтобы не перегружать первый экран. Для типа парковки используются только единые пользовательские чипы без второго raw-списка с повторяющимися подписями. Режим отображения карты зафиксирован на `Все слои`: точки, бордюрные линии и парковочные зоны показываются одновременно на desktop и mobile. Сама карта на desktop рендерится без декоративной рамки, чтобы она воспринималась как рабочая карта, а не превью внутри карточки. Счетчики разведены по смыслу: `Dataset total` показывает общий объем данных города, `Visible on map` - реально отфильтрованные/отрендеренные слои, `Matched by search` - результат текущего поискового запроса или списка. Route panel следует Yandex-like паттерну: в свернутом виде это компактный pill на карте, а в раскрытом состоянии он показывает режим `Drive`, действия `My location` / `Pick start` / `Pick finish`, читаемые endpoint-блоки `Откуда`/`Куда` и source-подсказку внутри `Откуда`; UI не показывает неподдержанные типы маршрута, потому что MVP `/api/route` сейчас принимает только `costing: "auto"`. На mobile интерфейс работает как bottom sheet поверх карты: сразу видна MapLibre canvas, search/city/reliability chips используют горизонтальные scroll rows, а фильтры раскрываются ниже. Верхняя ручка mobile sheet сворачивает/разворачивает фильтры тапом или свайпом, рядом есть компактная иконка переключения светлой/темной темы, а при drag/zoom карты раскрытая панель временно сдвигается вниз в auto-peek state и затем возвращается, чтобы водитель видел больше карты во время движения. Основные водительские пресеты надежности: `Reliable`, `More options` (`likely`, default), `All candidates`, `Needs review`, `Conflicts`. Режим Data quality имеет amber active state, счетчик review/conflict records, переключает trust/confidence/sort в review-сценарий и показывает review/conflict evidence-сегменты вместо того, чтобы смешивать их с обычными parking offers. Detail panel theme-safe: в dark mode панель, header и секции остаются темными с читаемым светлым текстом. При долгой загрузке или ошибке карты UI показывает skeleton-map state с progress bar, marker dots, layer statuses, Retry и честным сообщением про file fallback вместо бесконечного blur-spinner.
- Driver-first refinement выстраивает карту как последовательность `место назначения -> район -> надежность -> сравнение -> маршрут`: над поиском и результатами есть явные шаги, число подходящих вариантов отделено от технических dataset/map counters, а полные счетчики покрытия убраны в disclosure. В detail panel цена, driver-facing trust и кнопка маршрута показываются первым экраном; location/amenities, provenance/quality, официальные ссылки и пользовательское предложение раскрываются по запросу. Паттерн адаптирует логику SpotHero/ParkWhiz/ParkMobile без обещания бронирования или доступности, которых нет в данных OpenParking.
- В City of Miami proper все еще нет подтвержденного official street-meter point API. Для него следующий путь - MPA partner/public-records, Geofabrik/OSM baseline и аккуратные browser/manual evidence flows.
- OSM expansion для Miami теперь имеет production DB path: Florida Geofabrik PBF импортируется через `osm2pgsql`, затем `normalize:osm:pbf:miami-dade:boundary` загружает county-wide baseline в PostGIS. Старый `data/miami_parking_osm.geojson` остается только file fallback и может быть неполным из-за public Overpass limits.
- Главная проблема Miami теперь решается через масштабный baseline: в локальной БД импортирован Miami-Dade OSM coverage `1,425` facility/entrance points, `185` parking lines и `6,821` parking polygons. Следующий правильный путь - не вручную добавлять по одной парковке, а обогащать этот baseline источниками качества:
  - Miami Parking Authority main/commerce/annual-report sources для municipal garages, lots, on-street, monthly, special-event, valet/meter-rental contexts;
  - Miami-Dade County facilities, transit parking, MIA parking, PortMiami parking;
  - Coral Gables official ArcGIS/parking department sources;
  - OSM через Geofabrik Florida PBF или tiled Overpass;
  - private operator/payment pages: Metropolis/SP+/Parking.com, LAZ, ABM, Propark, Ace, Premium, REEF/Republic, Towne, Interstate, Platinum, Flash/ParkMobile payment networks;
  - marketplace/payment sources только после ToS/legal review или partner path.

San Francisco benchmark:

| Файл | Что внутри | Количество | Источник | Ссылка на источник/API |
| --- | --- | ---: | --- | --- |
| `data/sf_parking_datasf.geojson` | Уличные parking meters в SF | 33,511 | DataSF Parking Meters + Meter Rate Schedules | Source: https://data.sfgov.org/Transportation/Parking-Meters/8vzz-qzz9, API: https://data.sfgov.org/resource/8vzz-qzz9.json, policies: https://data.sfgov.org/Transportation/Meter-Policies/qq7v-hds4 |
| `data/sf_parking_curb_segments.geojson` | Производные curb segments, сгруппированные по `blockface_id` | 2,889 | Derived from DataSF meters | Это наш derived слой из DataSF, не отдельный официальный источник |
| `data/sf_parking_zones_osm.geojson` | OSM parking zones/lots в downtown SF | 403 | OpenStreetMap via Overpass | OSM: https://www.openstreetmap.org/, Overpass-derived local export |
| `data/sf_parking_osm.geojson` | Optional OSM mixed-geometry coverage baseline для всего SF bbox | generated by `npm run fetch:osm:sf` | OpenStreetMap via Overpass | Loader automatically splits Point/LineString/Polygon geometries across facilities/segments/zones |
| `data/street_parking_normalized.json` | Нормализованные OSM parking tags | 403 records | `Referenss/osm-tag-updater` logic + OSM | Используется для street-parking normalization |

Что означают эти слои:

- `sf_parking_datasf.geojson` - самый надежный текущий слой, потому что это city open data.
- `sf_parking_curb_segments.geojson` - полезный, но производный слой: мы группируем meter points по blockface. Его нельзя считать официальной линией бордюра.
- `sf_parking_zones_osm.geojson` - кандидатный слой parking lots/zones из OSM. У него ниже confidence, потому что OSM может быть неполным, а некоторые геометрии сейчас display fallback.

### 0.3 Где лежат найденные источники по городам

Research Phase 6 уже нашел источники для benchmark cities. Они пока не все импортированы в карту, но ссылки уже сохранены в manifests.

| Город | Manifest | Что найдено |
| --- | --- | --- |
| Miami | `data/research/cities/miami.fl.json` | Miami Parking Authority, Miami-Dade County parking facilities, Miami Beach ArcGIS, Coral Gables, OSM candidates |
| San Francisco | `data/research/cities/san-francisco.ca.json` | DataSF Parking Meters, DataSF Meter Policies |
| New York City | `data/research/cities/new-york-city.ny.json` | NYC Parking Meters Locations and Status, Parking Regulation Locations and Signs |
| Los Angeles | `data/research/cities/los-angeles.ca.json` | LADOT Parking Meter Occupancy, LADOT Metered Parking Inventory and Policies |
| Seattle | `data/research/cities/seattle.wa.json` | Paid Parking Occupancy, Blockface FeatureServer |
| Chicago | `data/research/cities/chicago.il.json` | ParkChicago rates/hours, Chicago official meter page |

Главный общий inventory: `data/research/phase6-source-inventory-20260610.json`.

Для frontend и будущей панели "Источники" есть единый TypeScript-каталог `apps/frontend/lib/sources.ts`. Он вручную консолидирует city manifests и national/operator evidence в одну frontend-accessible структуру, отсортированную helpers по городам, и хранит `source_url`, `metadata_url`, `api_url`, `payment_url`, `booking_url`, evidence, confidence, legal risk и ingestion status. Research JSON остается исходной доказательной базой; `sources.ts` - удобный runtime registry для UI/API.

Важно для city fallback: API больше не подставляет Miami данные для неизвестных или еще не импортированных городов. Если `city` не настроен, `/api/stats`, `/api/facilities`, `/api/geojson/*` и `/api/parking-index` должны возвращать пустой слой с `data_status = unsupported` и честным `support_message`. Для известных, но не импортированных городов статус остается `research_only`; UI показывает предупреждение, а не Miami counts.

NYC сейчас имеет только узкий DEV-62 fixture `data/nyc_garage_tariff_evidence.geojson`: один garage/tariff evidence record для поиска Dock / `1540 Broadway` / `164 West 46th`. Это не citywide NYC coverage. Тарифные компоненты (`hourly`, `daily`, `fees`, `taxes`, `oversize`, `re-entry`) хранятся отдельными `*_status` полями, чтобы не смешивать неизвестные и известные факты. Dynamic Dock/ParkMobile/ParkWhiz-style operator/payment links остаются `source_observation_pending_review`; `payment_url` и `booking_url` не заполняются до проверки прямого checkout и policy/legal review.

DEV-54 feasibility matrix для выбора следующего города/источника лежит в `docs/CITY_SOURCE_FEASIBILITY_DEV_54_RU.md`, а machine-readable результат - в `data/research/city-source-feasibility-dev54.json`. Короткий вывод: самый простой immediate source path - San Francisco DataSF meters + policies; самый простой net-new city после текущих Miami/SF слоев - Los Angeles LADOT inventory + occupancy. NYC вынесен в отдельный rule-parser track, Miami - в browser/manual/operator evidence track для MPA, City of Miami proper и payment/booking links.

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

### 0.5 Семантика parking zone / facility / curb

Новая design-only фиксация для DEV-48 лежит в `docs/data_taxonomy_parking_semantics_DEV-48.md`. Главное решение: `parking_zone` нельзя читать как доказательство физического места для парковки. Canonical API и будущая схема должны явно разделять `entity_kind` и visual/API layer:

- physical facility: garage, surface lot, airport/campus/event/monthly lot;
- garage entrance: точка въезда/выезда, а не весь объект;
- curb segment: линия у бордюра, где действуют parkability/rule facts;
- payment/regulatory zone: зона оплаты, permit, rate, residential или rule boundary, не обязательно parkable area;
- valet/drop-off/loading/no-parking: отдельные curb/service/regulation semantics;
- uncertain candidate: OSM/operator/user/browser candidate с низким confidence/review status.

До отдельной implementation task текущие endpoints остаются совместимыми, но новые импортеры и schema changes должны добавлять first-class semantic fields (`entity_kind`, `geometry_role`, `display_layer`, `parking_availability_semantics`, `regulation_kind`, `semantic_confidence`) и при этом сохранять provenance contract: `source_name`, `source_id`, `source_url`, `api_url`, `payment_url`, `booking_url`, `raw_properties`, `confidence`, `last_verified_at`, `data_as_of`.

DEV-55 теперь частично реализован как детерминированный geometry-quality gate для Miami generated curb rows: `apps/frontend/lib/parking-geometry-quality.ts` проверяет road parallelism, road offset/distance, пересечения с building polygons и parking-lot/garage interiors, а `apps/backend/scripts/audit_miami_parking_geometry.ts` обновляет OSM road/building cache через Overpass и пишет `data/research/miami-parking-geometry-quality-report.json`. Design docs `docs/ROAD_CURB_ENTRANCE_SNAPPING_HEURISTICS_DEV_55.md` и `data/research/road-curb-entrance-snapping-dev55.json` остаются полной целевой моделью для road/blockface snapping, side assignment, curb offset lines, cuts by intersections/crosswalks/hydrants/driveways/loading/valet/no-parking conflicts, parking-lot interior filtering и entrance/access evidence. Ключевое правило сохраняется: official/source confidence, geometry confidence и driver-facing `offer_confidence` должны быть разными фактами.

### 0.6 Текущий пробел, который надо закрыть следующим

Сейчас проект уже хранит и показывает базовую provenance/status-информацию: schema, loaders, `/api/facilities`, `/api/parking-index`, `/api/stats` и detail panel знают `source_url`, `api_url`, `payment_url`, `booking_url`, `evidence_url`, freshness, confidence и granular `price_status`/`rule_status`. `/api/facilities?price=known` и карта должны использовать одинаковую canonical semantics: `known_priced` и `known_free` считаются price-known; `known_unpriced`, `paid_unknown`, `variable`, `stale`, `not_applicable` и `unknown` остаются unknown для фильтра цены.

Следующий важный шаг теперь не schema plumbing, а наполнение и production ingestion:

1. Добыть реальные `payment_url` / `booking_url` из official/operator источников: MPA commerce, MIA/airport parking, PortMiami, Parking.com/SP+, ABM, Premium и другие низкорисковые public/partner paths. Это нельзя считать обычной задачей backend static parser: текущие operator/payment сайты часто отдают `403`, client-authorized GraphQL, Incapsula/challenge или только страницы локаций без прямого checkout. Для этой части нужны отдельные external parsers: browser/network extraction через Playwright/Chrome, provider deep-link parser для ParkMobile/PayByPhone zone flows, либо partner/API feed. Логичный порядок такой: сначала external parser в dry-run снимает DOM/network/evidence и классифицирует ссылку как `direct_checkout`, `facility_page`, `app_zone` или `operator_search`; потом сохраняет `SourceObservation` с evidence/hash/raw payload; только после ToS/legal review и стабильного direct checkout URL ссылка повышается в canonical `payment_url` / `booking_url`. Первый безопасный Premium slice добавлен как `npm run enrich:premium:dry-run`: он проверяет публичный Premium GraphQL/client contract, сохраняет только `SourceObservation` candidates из browser-captured/fixture данных и не продвигает operator facility pages в canonical `payment_url` / `booking_url`, пока нет прямой checkout-ссылки и ToS review.
2. На 2026-06-18 operator/payment evidence расширен: кроме Parking.com/SP+, ABM и Premium, в очередь источников добавлены LAZ, Propark, Ace, REEF/Republic, Towne, Interstate, Flash/ParkMobile и Platinum. Они остаются source candidates до parser specs, evidence capture и отдельного решения о том, какие ссылки можно повышать до canonical `payment_url` / `booking_url`.
3. Довести остальные connector templates из foundation-level до canonical upsert в `ParkingFacility`/`CurbSegment`/`ParkingZone` после отдельной dry-run проверки geometry, layer routing и idempotent keys. Miami Beach ArcGIS уже продвинут первым: `connector:arcgis:import` сохраняет `DataSource`, `ImportRun`, `SourceObservation`, а затем idempotent upsert-ом пишет layer 1 meters и layer 5 lot centroids в `ParkingFacility`, layers 5/7 polygons в `ParkingZone`; layer 3 spaces остается raw fixture. Socrata/CKAN и generic ArcGIS targets пока остаются foundation-level.
4. Довести Miami fixtures до того же status/provenance контракта, что SF: Miami Beach WPGMZA/ArcGIS уже протягивают rates, ParkMobile zones, payment-provider evidence и granular statuses, но City of Miami proper и часть Miami-Dade/MIA/PortMiami источников еще требуют parser/importer promotion.
5. Держать metrics раздельными: provenance/source coverage отдельно, payment completeness отдельно, booking completeness отдельно, чтобы высокий source coverage не скрывал нулевые transactional links.
6. Сделать UI честным для неизвестных или неполных данных: unknown/stale price, unavailable payment/booking link, missing source/evidence или low confidence не должны выглядеть как verified offer. DEV-50 proposal/backlog для этого UX лежит в `docs/UI_DATA_TRUST_PROPOSAL_RU.md` и описывает trust states, layer filters facilities/curb/zones/uncertain/valet, evidence panel, source/location/zone IDs, payment provider и confidence reasons.
7. Сделать отдельный экран/панель "Источники", где видно все найденные sources по городам и их статус: research only, ready for import, imported, needs parser, needs legal review. Базовый frontend registry для такой панели уже лежит в `apps/frontend/lib/sources.ts`.

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

Продукт для пользователя должен выглядеть как удобная карта: человек открывает карту, видит парковки вокруг, фильтрует по надежности (`reliable/likely/review/conflict`), цене, времени, типу парковки, доступности, долгосрочности, valet, гаражам, уличным местам и правилам, а также четко видит парковочные зоны.

Важная UX-цель: карта должна ощущаться как привычный общий поиск парковок - пользователь вводит или открывает район и видит все известные ParkingUSA парковки, как в Google Maps при поиске "parking". Но внутри ParkingUSA существование парковки и знание тарифов - разные факты. Если парковка найдена в baseline, но цена неизвестна, она все равно показывается на карте с честным статусом: "цена неизвестна", "правила неизвестны", "нужна проверка". Если тариф, правила, ссылка на оплату или booking link известны, карточка показывает эти факты вместе с источником, свежестью и confidence.

Пользовательские предложения - часть продукта, а не второстепенная форма обратной связи. Для неизвестной или неполной парковки пользователь должен иметь возможность нажать "предложить тариф/информацию" и отправить цену, часы, фото знака, ссылку на оплату, ссылку на сайт оператора или комментарий. Такое предложение не должно сразу перезаписывать подтвержденные данные: оно создает observation/review item с источником `user_report`, evidence, временем, confidence и статусом moderation/review. После проверки ParkingUSA может повысить confidence и обновить canonical tariff/rule fields.

Минимальный workflow уже реализован: detail panel на карте содержит форму user report (`Suggest price or info` / `Предложить цену или данные`), а `POST /api/observations` сохраняет отправку как `SourceObservation(entityType = user_report, sourceName = User Report, confidence = 0.35, status = pending_review)`. Пользователь может отправить suggested price, rules/hours, payment/booking URL, evidence/photo/source URL и comment. UI главной карты поддерживает переключение English/Russian через кнопку с флагами в сайдбаре; выбор языка сохраняется локально в браузере и не меняет публичные API. Это intentionally non-destructive: canonical price/rule fields не меняются до review.

Первая версия расширенного полевого evidence flow спроектирована в `docs/USER_FIELD_EVIDENCE_INGESTION_FLOW_RU.md`: пользовательские фото/скриншоты/голосовые заметки/точки на карте должны входить как `SourceObservation` или correction candidate, проходить OCR/metadata/transcript/manual review, и только после принятия review повышать confidence или обновлять canonical `ParkingFacility` / `CurbSegment` / `ParkingZone`. Этот документ является backlog/API/UI планом без production implementation: текущий безопасный контракт `/api/observations` и detail-panel форма сохраняются как backward-compatible base.

Навигационный MVP добавляет `POST /api/route`: браузер отправляет только same-origin запрос в ParkingUSA, а серверный route handler обращается к Valhalla (`VALHALLA_URL`, по умолчанию `http://127.0.0.1:8002`). Сейчас поддерживается только `costing: "auto"`, лимит прямой дистанции 100 км, таймаут 5 секунд, линия маршрута на MapLibre и summary расстояния/времени. На карте есть Yandex-inspired панель навигации: свернутый pill открывает маршрутный блок, `My location` показывает текущую точку, а режимы `Pick start` и `Pick finish` позволяют выбрать точки на MapLibre. Панель явно показывает водительский режим, источник старта в блоке `Откуда`, выбранные координаты в блоках `Откуда`/`Куда` и readiness-подсказку, чтобы пользователь понимал, почему кнопка маршрута включена или выключена. Поддержанные сценарии: выбранный на карте старт -> выбранная парковка, geolocation/manual start -> выбранная парковка, выбранный старт -> выбранный финиш, текущее местоположение -> выбранный финиш. Все они идут через тот же `/api/route`. Forward-геокодинг теперь доступен как отдельный endpoint `/api/geocode/forward`, но сам `/api/route` его не включает. Turn-by-turn, route history, типы маршрута кроме `auto` и persistence местоположения не входят в этот MVP.

## 2. Важная реальность: всех парковок из одного источника не получить

В США нет одного официального API, где лежат все парковки.

Поэтому ParkingUSA должен быть не просто приложением, а многоисточниковой системой данных (multi-source data platform - платформа, которая собирает данные из разных мест).

Важно про Google Maps/Google Places: Google может быть полезен как ручной ориентир, discovery/matching инструмент и источник `place_id`, но не должен быть общей мастер-базой ParkingUSA. Мы не строим продукт как выгрузку всех парковок из Google, потому что такие данные нельзя свободно pre-fetch/cache/store как независимый долгосрочный слой и показывать на MapLibre без ограничений Google attribution/map policy. Правильная модель: общий слой покрытия строится из источников, которые можно хранить и проверять - OSM/Overture, city open data, official parking authority feeds, операторские сайты/API, партнерские feeds, user reports и manual/browser evidence.

Для пользователя это должно выглядеть как единая карта покрытия, а не как список источников: на карте показываются все известные ParkingUSA кандидаты парковок, а каждая карточка явно говорит, какие факты подтверждены. Например: "парковка существует - известно", "цена неизвестна", "тариф подтвержден official source", "нужна проверка", "есть ссылка на оплату/бронирование", "пользователь предложил тариф, ожидает проверки". То есть существование парковки и знание цены - разные факты с разным confidence.

Про "один общий источник" важно разделить два смысла:

1. Внешний единый источник, из которого можно законно скачать все парковки США с ценами и ссылками на оплату, сейчас практически не существует. Google похож на такой источник визуально, но не подходит как master database из-за policy/cache/map restrictions. SpotHero/ParkWhiz/Parking.com/ParkMobile тоже не являются полным нейтральным источником: они покрывают только партнерские, оплатные или операторские объекты.
2. Для продукта нужен один внутренний canonical source of truth: база ParkingUSA. Она собирает baseline из OSM/Geofabrik + Overture + official city/authority datasets, а затем поверх baseline перезаписывает/обогащает конкретные facts более надежными источниками: official rates, operator pages/APIs, payment links, partner feeds, browser evidence, user reports, manual review.

Поэтому практическая стратегия такая: "один источник для приложения" = ParkingUSA canonical database и единый API feed `/api/parking-index`; "один внешний источник для начального покрытия" = OSM/Geofabrik как primary nationwide baseline, желательно сверяемый с Overture. Все остальные источники не заменяют baseline целиком, а повышают качество отдельных объектов: точнее геометрия, тариф, правила, payment_url, booking_url, freshness и confidence.

`/api/parking-index` - это первый реализованный вариант одного master feed для приложения. Он объединяет facilities, curb segments и parking zones в один GeoJSON FeatureCollection и добавляет каждому объекту ParkingUSA-level поля: `parkingusa_id`, `parkingusa_layer`, `existence_status`, `price_status`, `rule_status`, `needs_enrichment`, `canonical_source = ParkingUSA Parking Index`. Это именно тот слой, который дальше должен пополняться ценами, payment/booking links, official/operator facts и user reports.

Public metrics are record completeness/provenance coverage indicators, not deduped real-world coverage. Provenance/source coverage, payment-link completeness, and booking-link completeness are separate metrics.

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

Продуктовый принцип для карты: сначала строим максимально широкий `coverage baseline` - слой candidate parking inventory, где объект может быть известен даже без цены. Затем поверх него добавляем `pricing/rules enrichment` - тарифы, часы, ограничения, availability, payment/booking links и свежесть. Поэтому на карте должны быть видны и парковки с известными тарифами, и парковки без тарифов: вторые становятся рабочей очередью для research, parser, browser agent, звонка, партнерства или пользовательского подтверждения.

Рекомендуемая иерархия источников для общего слоя покрытия:

1. Official city/authority datasets - самый высокий приоритет для meters, municipal garages/lots, curb rules и zones.
2. OSM/Geofabrik + Overture - nationwide baseline для garages/lots/parking polygons и первичная оценка полноты.
3. Operator/venue/airport/university/hospital public pages or APIs - enrichment для off-street, valet, monthly, event и booking/payment links.
4. Partner/affiliate feeds - preferred path для marketplace/payment/operator данных, где scraping рискованный.
5. Browser/manual/user evidence - точечное закрытие пробелов, конфликтов и stale prices.
6. Google Places/Maps - только discovery/matching/manual QA, не источник долговременного независимого слоя; хранить можно только разрешенные идентификаторы/метаданные в рамках policy, например `place_id`, и связывать их с собственным canonical record.

Нужны 6 механизмов:

1. Official sources first (сначала официальные источники).
2. OSM/Overture baseline (базовый слой по всей стране).
3. Public parsers (парсеры публичных страниц операторов и объектов).
4. Browser agents (браузерные агенты для сложных сайтов и динамических цен).
5. Partner feeds later (партнерские фиды позже, когда будет бизнес-основание).
6. Missing-parking queue (очередь дыр в покрытии, которые надо закрывать research/parser/call/manual review).
7. Добавить функционал чтобы пользователи могли сами ставить парковки на карте отмечать их

Первый реализованный шаг coverage baseline: `apps/backend/scripts/fetch_osm_parking.py` получает OSM parking candidates через Overpass и сохраняет mixed GeoJSON. Frontend `data-loader.ts` читает optional `data/<city>_parking_osm.geojson` и раскладывает геометрию по текущим слоям: `Point/MultiPoint` -> значки/places, `LineString/MultiLineString` -> линии along roads, `Polygon/MultiPolygon` -> parking zones/lots. Это не делает OSM authoritative, но быстро показывает больше парковок и помечает неизвестные цены через `price_status=unknown` / `needs_enrichment=true`.

Чтобы OSM raster-basemap не показывала `P`, которого нет даже в candidate-слое OpenParking, добавлен bounded reconciliation audit: `npm run audit:osm-coverage:miami-beach`. Он сверяет live OSM API по полной bbox Miami Beach (сетка 6x6) с локальными fallback GeoJSON, сопоставляет точные OSM ID для POI/ways/relations и сохраняет отсутствующие объекты в `data/miami_beach_osm_basemap_candidates.geojson`. Запуск идемпотентен: существующие актуальные candidates сохраняются, устаревшие ID удаляются; при ошибках тайлов предыдущий набор не заменяется. Несвязанные объекты вроде кафе/ночных клубов только с тегом `parking=*` не продвигаются в парковочные кандидаты. Все найденные объекты получают `existence_status=candidate`, `enrichment_status=needs_review`, `ordinary_parking_status=unknown_pending_access_rule_check` и не считаются verified public offer, пока access/правила не подтверждены. Неполный `review_only` слой может отображаться для discovery, но `complete=false` сохраняется в metadata и не должен выдаваться за полное покрытие. Нулевой `missing_from_fallback` в отчёте означает отсутствие незакрытых OSM POI только для полностью успешно проверенной bbox; при сбоях ориентируемся на `coverage_complete=false`. Широкая Overpass выгрузка `npm run fetch:osm:miami-beach` считается production-покрытием только при `metadata.complete=true` и пустом `failed_bboxes`; baseline по-прежнему строится из Geofabrik PBF.

В режимах `Надежные` и `Больше вариантов` кандидаты ниже порога доверия не считаются результатами поиска, но остаются на карте янтарными reference-маркерами; площадки дополнительно получают полупрозрачную янтарную заливку и пунктирный контур. Они открывают обычную карточку `needs_review`, поэтому синяя `P` raster-basemap или видимый контур lot не выглядит как потерянная нами парковка. Объекты с `access=private/customers/permit/residents/employees/delivery/destination` считаются конфликтом для обычного водителя и показываются только в workflow `Конфликты`.

Для выбранного `city=miami` карта отдельно загружает Census TIGERweb boundary Miami-Dade County через `/api/geojson/boundary`. Граница показывает текущую coverage-зону как административный контур без цветной заливки и без перекрашивания территории: нейтральная светлая обводка плюс темная пунктирная линия остаются читаемыми в обеих темах. Parking layers продолжают использовать тот же `Miami + Miami-Dade` scope, поэтому Miami Beach не оказывается визуально вне выбранной зоны.

Второй реализованный шаг для масштаба: `apps/backend/scripts/download_geofabrik_pbf.mjs` добавляет повторяемую загрузку Geofabrik PBF extract, сейчас для Florida через `npm run fetch:pbf:florida`. После загрузки preferred command `npm run import:osm:pbf -- --input=data/osm/florida-latest.osm.pbf --schema=osm_raw --flex=apps/backend/scripts/osm2pgsql_parking.lua` импортирует PBF через внешний `osm2pgsql` в focused raw tables: `osm_raw.parking_points`, `osm_raw.parking_lines`, `osm_raw.parking_polygons`. Это production path для полного Miami/Florida baseline без публичных Overpass timeout; следующий слой поверх raw import должен нормализовать эти rows в ParkingUSA facilities/segments/zones.

Третий реализованный шаг: `apps/backend/scripts/normalize_osm_raw_parking_to_db.mjs` читает `osm_raw.parking_points`, `osm_raw.parking_lines`, `osm_raw.parking_polygons` и idempotent upsert-ом переносит их в публичные модели `ParkingFacility`, `CurbSegment`, `ParkingZone`. Команда `npm run normalize:osm:pbf:miami:dry-run` показывает raw counts и planned upserts, а `npm run normalize:osm:pbf -- --city=Miami --state=FL` выполняет запись после успешного PBF import.

Первый полный прогон Florida PBF -> Miami bbox выполнен локально 2026-06-12: `osm2pgsql` processed Florida Geofabrik PBF into `osm_raw`, затем `npm run normalize:osm:pbf:miami` импортировал в публичные модели 609 OSM facility points, 120 OSM parking lines и 1,108 OSM parking polygons для bbox `25.7090,-80.3198,25.8558,-80.1395`. Эти записи были первой проверкой pipeline и позже заменены City of Miami polygon boundary baseline. Все такие записи являются candidate coverage baseline, не authoritative city data; их цены в основном остаются `price_status=unknown` и требуют enrichment.

Текущий refinement для соответствия реальности: bbox считается только быстрым prefilter. Для точной границы используются Census TIGERweb polygons. `npm run fetch:boundary:miami` сохраняет City of Miami Incorporated Place boundary в `data/boundaries/miami_place_boundary.geojson`, а `npm run fetch:boundary:miami-dade` сохраняет Miami-Dade County boundary в `data/boundaries/miami_dade_county_boundary.geojson`. После этого preferred dry-run для City of Miami: `npm run normalize:osm:pbf:miami:boundary:dry-run`; county-wide baseline: `npm run normalize:osm:pbf:miami-dade:boundary:dry-run`. Normalizer поддерживает `--boundary-geojson` и применяет PostGIS `ST_Intersects` к реальному polygon boundary, сохраняя bbox как необязательный ускоряющий фильтр.

City of Miami boundary import выполнен локально 2026-06-12 командой `npm run normalize:osm:pbf:miami:boundary`: старые bbox rows `609/120/1108` были заменены на `407` OSM facility points, `34` OSM parking lines и `572` OSM parking polygons внутри реальной Census Incorporated Place boundary. 2026-06-13 для default Miami app scope также импортирован county-wide Miami-Dade baseline командой `node apps/backend/scripts/normalize_osm_raw_parking_to_db.mjs --city=Miami-Dade --state=FL --boundary-geojson=data/boundaries/miami_dade_county_boundary.geojson`: `1,425` points, `185` lines и `6,821` polygons. `apps/frontend/lib/data-loader.ts` для `city=miami` читает DB scope `Miami + Miami-Dade`, поэтому OSM `P` candidates из Miami Beach/Muss Park появляются в ParkingUSA Index, а official Miami/Miami Beach fixtures добавляются как enrichment/fallback.

Критерии полноты:

- source coverage (сколько источников найдено и обработано);
- geographic coverage (какие города/штаты покрыты);
- facility count (сколько объектов найдено);
- price coverage (у скольких объектов есть цена);
- payment completeness (у скольких объектов есть ссылка оплаты);
- booking completeness (у скольких объектов есть ссылка бронирования);
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

1. Продвинуть следующие importer templates из foundation-level до canonical upsert: после Miami Beach ArcGIS следующим кандидатом остается Socrata benchmark source, затем CKAN/generic ArcGIS targets после dry-run проверки geometry, layer routing и idempotent keys.
2. Импортировать benchmark cities в PostGIS.
3. Сделать OSM baseline через `osm2pgsql`.
4. Сделать parser runner v1 по parser specs.
5. Сделать missing-parking queue.
6. Сделать dedupe logic между official/open/OSM/operator sources.
7. Добавить valet как отдельный тип парковки.
8. Поддерживать в UI и API раздельные coverage metrics: `existence/provenance coverage`, `price/rule coverage`, `payment completeness` и `booking completeness`, чтобы неизвестные цены и отсутствующие transactional links были видимой очередью пополнения данных.

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
- UI note: внутренняя проверка доступна только по прямому маршруту `/map/admin`. Публичный `/map` не содержит кнопки или ссылки на админку; скрытый маршрут повторно использует тот же MapLibre workspace со всеми поисковыми, маршрутными, фильтровочными и detail-panel функциями, но по умолчанию открывает review/conflict workflow.

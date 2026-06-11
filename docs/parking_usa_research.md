# Parking USA: глобальный ресерч идеи централизованной карты парковок в США

Дата: 2026-06-08

Связанные документы:

- `parking_data_collection_plan.md` - как практически собирать данные, схема БД, дедупликация, AI-обзвон.
- `parking_full_data_strategy.md` - глубокая стратегия источников, city open data, зонирование, open-source/GitHub pieces.
- `README.md` - карта workspace и текущий PoC.

## 1. Короткий вывод

Идея "единого места со всеми парковками США" попадает в реальную боль, но это не greenfield. В США уже есть крупные игроки:

- агрегаторы и B2C-маркетплейсы: Parkopedia, SpotHero, ParkWhiz/BestParking, Parking.com;
- платежные муниципальные приложения: ParkMobile, PayByPhone, Passport, Flowbird;
- навигационные платформы: Google Maps, Waze, Apple Maps;
- B2B/PARCS/операторские сети: Flash, SP+/Parking.com, Metropolis, LAZ, ABM, Premium Parking и др.;
- стандарты/инфраструктура данных: CurbLR, OMF Curb Data Specification, городские open data.

Главная проблема рынка не в том, что "никто не делал парковки", а в том, что данные, права на оплату, цены, доступность, правила curbside и фактические въезды разнесены по разным владельцам. Поэтому в одном приложении часто нет части парковок, особенно:

- частных surface lots;
- valet;
- малых операторов;
- временных event lots;
- street parking с правилами по времени/стороне улицы;
- долгосрочной/monthly парковки;
- новых парковок и парковок при бизнесах, ТЦ, кампусах, больницах;
- точной real-time occupancy и live prices.

Вывод: делать "еще один SpotHero" опасно. Более перспективная ниша: data-first parking search layer, который агрегирует публичные данные, операторские фиды, user/community corrections, computer vision/OSM/Google Places enrichment и умеет честно показывать confidence score, coverage gaps, тип парковки, правила, цену и сценарий использования.

## 2. Правда ли есть проблема с парковками

Да, боль подтверждается независимыми источниками, но она разная по сегментам.

### Боль водителя

INRIX в исследовании 2017 года оценивал, что средний водитель в США тратит 17 часов в год на поиск парковки, а суммарная стоимость поиска парковки для экономики США превышает $72 млрд в год. Источник старый, но его до сих пор цитируют в материалах про parking pain, и он хорошо показывает масштаб проблемы.

Google прямо пишет, что поиск парковки рядом с destination доступен только в selected US cities. Это важный сигнал: даже у Google покрытие парковок не универсальное.

Waze в справке указывает, что rates предоставляются третьими сторонами, могут быть недоступны для всех площадок и не всегда accurate in real time. Это почти прямое подтверждение проблемы качества/полноты данных.

### Боль городов

Города пытаются оцифровывать curb и paid parking, но данные разнородны:

- San Francisco публикует meter locations/rates через DataSF/Socrata и поддерживает demand-responsive parking.
- NYC публикует датасет parking regulation signs; это знаки, а не готовый consumer-friendly слой "можно ли здесь парковаться сейчас".
- Seattle публикует paid parking occupancy data, но это исторический/аналитический набор.
- LADOT объявлял real-time/open parking data, но это отдельная городская инициатива, а не национальный стандарт.

### Боль операторов

Операторы хотят revenue/yield/demand channels. Flash прямо продает Digital Demand Network и пишет, что интегрирует 30,000+ locations от 800+ parking operators в Waze/Google/Ticketmaster/Groupon. Это показывает, что спрос на distribution и booking layer есть, но доступ к инвентарю контролируют B2B-платформы.

## 3. Размер и структура рынка

Точный TAM считать сложно: "parking" включает on-street, off-street, residential, event, airport, campus, monthly, valet, EV charging, enforcement, permits, PARCS hardware/software.

Ориентиры:

- Census Bureau показывает 12,189 employer establishments для NAICS 812930 Parking Lots and Garages.
- Research and Markets по global parking lots and garages оценивал off-street segment в $57 млрд в 2023 как 65.4% глобального сегмента.
- В отраслевых материалах встречается оценка NPA, что parking генерировал около $131 млрд direct revenue в 2020, но это лучше перепроверять при финансовом моделировании, так как источник часто цитируется через СМИ.

Практический вывод: рынок большой, но highly fragmented. Национальная карта потребует не одного API, а pipeline из десятков источников.

## 4. Конкурентная карта

| Игрок | Тип | Масштаб/покрытие | Сильные стороны | Слабые места / окно |
|---|---|---:|---|---|
| Parkopedia | глобальный parking data provider + consumer app | заявляет 90M spaces, 90 countries | static/dynamic data, API/feed, OEM-партнерства, Apple/auto ecosystem | B2C app не всегда лучшая consumer destination; данные не гарантируют оплату/booking; после покупки EasyPark/Parkopedia может стать больше B2B/embedded |
| SpotHero | marketplace reservations | 11,000+ garages/lots/valets, 400+ North American cities | бронирование, event/airport/monthly, сильный UX, Apple/Google integrations | в основном off-street партнерский inventory; не все street/municipal/private lots; зависит от операторов |
| ParkMobile | mobile payment + reservations | 50M+ users, 600+ cities по материалам компании | городские контракты, on-street pay-by-zone, event reservations | не "все парковки"; платежи только там, где подключен город/оператор |
| PayByPhone | mobile payment | 95M+ drivers, 1,300+ locations globally | сильный pay-by-code, app/web/phone/SMS | фрагментированность по городам; ограниченная карта для discovery |
| Passport | city/operator mobility platform | 800+ clients worldwide | rate engine, enforcement, permits, city backoffice | B2B/municipal; consumer discovery не основной фокус |
| Flowbird | parking hardware/mobile payments | 15M users, 150M+ transactions/year, US locations list | pay stations + mobile + city systems | больше infrastructure/vendor, не consumer meta-search |
| Flash | B2B parking tech + demand network | 17K+ locations на сайте; 30K+ via Waze announcement | интеграции Google/Waze/Ticketmaster/Groupon, operator network | B2B demand channel; не нейтральный consumer-wide агрегатор |
| Parking.com / SP+ | operator-owned platform | North America, SP+ managed inventory | прямой inventory, daily/monthly/event | только/в основном площадки оператора или партнеров |
| Google Maps / Waze | navigation + parking discovery | massive user base, selected cities/features | привычная карта, destination intent | данные не полные; booking/rates через партнеров; слабая детализация правил |
| Apple Maps | navigation + partner parking | SpotHero/Parkopedia integrations | in-car/mobile ecosystem | зависит от партнеров, не parking-first |
| SpotAngels / niche apps | crowdsourced street parking/rules | city-specific strength | street rules, community | покрытие uneven, monetization harder |

## 5. Почему у всех "пусто" или нет половины парковок

Причины системные:

1. Нет единого национального реестра парковок.
2. Street parking описывается правилами, знаками, днями, исключениями, permit zones, street cleaning, curb colors, loading zones.
3. Off-street parking принадлежит тысячам операторов, владельцев недвижимости, ТЦ, отелям, event venues, больницам, университетам.
4. Цены динамические: event pricing, early bird, validation, overnight, monthly, weekend, EV charging, convenience fees.
5. Availability real-time требует либо PARCS-интеграции, либо sensors/cameras, либо вероятностной модели.
6. Платежи завязаны на city/operator contracts, PCI, enforcement sync, refunds, disputes.
7. Навигационные карты могут знать POI, но не знать легальность/условия парковки.
8. User-generated data быстро устаревает без verification loop.

## 6. Реалистичная стратегия сбора данных

### Слои данных

1. Base POI inventory:
   - Google Places API, Apple Business Connect where possible, OpenStreetMap, SafeGraph/Data Axle/Foursquare/Precisely, operator sites.
   - Цель: адрес, координаты, entrance point, тип, название, owner/operator, phone/website.

2. Public municipal data:
   - Data.gov, Socrata city portals, ArcGIS portals, CKAN/open data portals.
   - Примеры: SFMTA meters/rates, NYC parking signs, Seattle occupancy, LADOT meters/real-time initiatives.

3. Operator/marketplace data:
   - SpotHero/ParkWhiz/Parking.com/Flash/LAZ/SP+/Premium/ABM/Metropolis pages and partnerships.
   - Легально лучше через партнерства/API/affiliate, а не scraping checkout.

4. Street/curb rules:
   - CurbLR/CDS where available.
   - OCR/sign detection from Street View-like imagery is legally и технически сложный участок. Лучше начинать с open datasets + city pages + user reports.

5. Prices:
   - Static price pages, city tariffs, operator public pages, reservation APIs/affiliate feeds.
   - Хранить effective_from/effective_to, source, confidence, last_seen_at.

6. Availability:
   - MVP: "known bookable inventory" + probabilistic availability.
   - Потом: PARCS/API partnerships, sensors, crowd signals, transaction signals.

7. Community corrections:
   - "This lot exists/closed/full/valet only/price changed".
   - Обязательно moderation + reputation + photo evidence.

## 7. MVP, который имеет шанс

Не стартовать сразу со "всех парковок США". Стартовать с 3-5 городов с высокой болью и хорошими открытыми данными:

- New York City: сложные street rules, huge demand, rich open data.
- San Francisco: meters/rates, demand-responsive parking, high parking pain.
- Los Angeles: LADOT + много private lots/event/valet.
- Chicago: strong off-street marketplace presence, event/commuter cases.
- Seattle или Boston/Washington DC: open data + высокая urban demand.

MVP-функции:

- карта парковок с типами: street, garage, lot, valet, monthly, airport/event, EV;
- фильтры: price, time window, max walk, height clearance, EV, accessible, covered, overnight, monthly, bookable/payable;
- карточка с confidence score и источником данных;
- "rate timeline": hourly/daily/monthly/event, если известно;
- legal/allowed now for street parking там, где данные позволяют;
- report/correction flow с фото;
- alert "данные устарели / цена не подтверждена";
- сравнение "cheapest / closest / lowest risk / bookable".

## 8. Монетизация

Возможные модели:

- affiliate/commission за reservations через SpotHero/ParkWhiz/Parking.com/Flash/операторов;
- lead-gen для monthly parking;
- B2B API для delivery/fleet/insurance/real estate/travel apps;
- white-label parking search для отелей, venues, campuses;
- premium consumer subscription: alerts, street parking rules, monthly deals, ticket risk, saved zones;
- data licensing: normalized parking/curb inventory with freshness/confidence.

Самая реалистичная early monetization: affiliate + monthly parking leads + B2B API для локальных use cases. Чистый consumer app без booking/payment будет трудно монетизировать.

## 9. Риски реализации

- Scraping risk: Terms of Service, антибот, pricing freshness, юридические претензии.
- Data liability: пользователь получил штраф/эвакуацию из-за ошибки.
- Payments/enforcement: нельзя просто "платить за все парковки" без договоров.
- Stale data: цены и правила быстро меняются.
- Coverage expectation: если обещать "все парковки", пользователи будут наказывать за каждую дыру.
- Unit economics: сбор/проверка данных по всей стране дорогой.
- Competition from platforms: Google/Waze/Apple/Arrive/Flash могут закрыть часть потребности на уровне default maps.

## 10. Рекомендация

Да, проблема существует, но формулировку нужно сдвинуть:

Плохо: "сделаем все парковки США в одном приложении".

Лучше: "сделаем самый полный и прозрачный parking data layer для США: показываем все известные варианты, источник, свежесть, confidence, реальные правила и лучший сценарий: park now, reserve, monthly, valet, street."

Первые 8-12 недель стоит делать не масштабирование на США, а proof of coverage в одном городе:

1. Выбрать город, например San Francisco или NYC.
2. Собрать 5-7 источников данных.
3. Построить normalized schema.
4. Сравнить покрытие против Google Maps, SpotHero, Parkopedia, ParkMobile/PayByPhone.
5. Вручную проверить 200-500 объектов.
6. Посчитать coverage delta: сколько новых/лучших/более точных парковок найдено.
7. Проверить willingness-to-use через простой web app.

Если на пилоте вы реально показываете на 20-40% больше полезных вариантов или лучше объясняете правила/цены, тогда есть основание расширяться.

### Что зафиксировано после PoC

- Street parking лучше показывать линиями/curb segments, а не отдельными точками.
- Off-street zones/lots/garages нужно показывать полигонами только при наличии настоящей геометрии.
- Candidate polygons вокруг точки нельзя выдавать за реальную parking zone; они должны иметь низкий confidence и явную пометку.
- Самый простой пилотный источник: DataSF meters + rate schedules + meter policies.
- Для national-scale карты лучше сразу планировать PostGIS + vector tiles + MapLibre, а Leaflet оставить как быстрый PoC.
- Готового open-source аналога "все парковки США" не найдено, но есть полезные базовые проекты: PNNL/parking, A/B Street, OMF CDS/CurbLR, osm2pgsql, osmtogeojson, MapLibre.

## 11. Источники

- Parkopedia Business: parking data, 90M spaces/90 countries, API/feed: https://business.parkopedia.com/parking-data
- Parkopedia about: OEM/driver use case: https://www.parkopedia.com/about-us/
- EasyPark acquires Parkopedia, 2025: https://www.prnewswire.com/news-releases/easypark-group-acquires-parkopedia-to-streamline-the-driver-experience-302376186.html
- EasyPark acquires Flowbird, 2025: https://www.easyparkgroup.com/news/easypark-group-closes-acquisition-of-flowbird/
- ParkMobile about: 50M people, top US cities: https://parkmobile.io/about-us/explore-parkmobile
- ParkMobile brochure/search result: 50M+ users, 600+ cities: https://parkmobile.io/wp-content/uploads/2024/10/ParkMobile_2024-General-Brochure-WEB.pdf
- PayByPhone App Store / Google Play: 95M drivers, 1,300+ locations: https://apps.apple.com/US/app/id448474183?mt=8
- PayByPhone locations: https://www.paybyphone.com/locations
- Passport parking product: https://www.passportinc.com/product/parking/
- Passport product/client page: https://www.passportinc.com/product/
- Flowbird mobile: 15M users, 150M+ transactions/year: https://www.flowbird.com/our-solutions/parking-solutions/mobile/
- Flowbird US locations: https://flowbirdapp.com/locations/
- SpotHero about: 11,000+ locations, 400+ North American cities: https://spothero.com/about
- SpotHero $1B reservations / 40M cars / 8,000 locations: https://spothero.com/press/spothero-eclipses-1-billion-in-parking-reservations-sold
- Flash + Waze: 30,000+ locations, 800+ operators: https://www.flashparking.com/news/flash-partners-with-waze/
- Flash platform metrics: https://www.flashparking.com/
- Parking.com/SP+ launch: https://www.globenewswire.com/news-release/2018/08/07/1547768/0/en/SP-Launches-Parking-com.html
- INRIX parking pain US: https://inrix.com/press-releases/parking-pain-us/
- Google Maps parking help, selected US cities: https://support.google.com/maps/answer/7257797
- Waze parking help, third-party rates and incomplete availability: https://support.google.com/waze/answer/7052890
- Waze book parking help: https://support.google.com/waze/answer/15113600
- Apple Maps + SpotHero coverage via TechCrunch: https://techcrunch.com/2023/01/09/apple-maps-spothero-parking-feature/
- Google Maps + SpotHero via TechCrunch: https://techcrunch.com/2024/10/08/google-partners-with-spothero-convenient-parking-reservations-maps-search/
- SFMTA parking meters: https://www.sfmta.com/tl/node/24103
- NYC parking regulation signs dataset: https://catalog.data.gov/dataset/parking-regulation-locations-and-signs
- Seattle paid parking occupancy data: https://techtalk.seattle.gov/2019/06/18/tech-talk-tuesday-new-dataset-helps-fuel-parking-choices-for-seattle-drivers/
- LADOT real-time parking data press release: https://ladot.lacity.gov/sites/default/files/press-releases/ladot-press-release-publishes-real-time-parking-data-to-empower-drive-innovation.pdf
- CurbLR standard: https://www.curblr.org/
- OMF Curb Data Specification: https://github.com/openmobilityfoundation/curb-data-specification
- Census NAICS 812930 Parking Lots and Garages: https://data.census.gov/profile/812930_-_Parking_Lots_and_Garages?codeset=naics~812930
- Research and Markets parking lots/garages market: https://www.researchandmarkets.com/reports/6031707/parking-lots-garages-market-opportunities

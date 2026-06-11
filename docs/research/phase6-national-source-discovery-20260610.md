# Phase 6 Research: National Parking Source Discovery And Research Worker Design

Date: 2026-06-10

Scope: ROADMAP.md Phase 6, "Research Worker And Source Discovery".

This note extends the earlier market and collection strategy documents with an
operational research inventory for ParkingUSA. It is not an implementation
commitment. It is the source-discovery baseline for building the production
researcher wrapper, deterministic source inspectors, and benchmark-city parser
recipes.

## Executive Findings

1. Full US parking coverage cannot be acquired from one source. ParkingUSA needs
   a layered acquisition system: official city data first, OSM/Overture base
   discovery second, operator/airport/venue pages with parser specs third, and
   partner/API/outreach paths for high-risk marketplace data.

2. The first five benchmark cities have usable official data, but each city has
   a different best source shape:
   - San Francisco: Socrata meter inventory and meter policies are strong.
   - New York City: Socrata meter inventory plus parking regulation signs are
     strong, but rates require zone/rule joins and signage caveats.
   - Seattle: Socrata occupancy is current; ArcGIS Blockface is the better curb
     geometry source than the older Socrata blockface-space dataset.
   - Los Angeles: Socrata/DataLA has live-ish occupancy and metered inventory;
     LA Express Park adds policy/rate context.
   - Chicago: official ParkChicago web/app coverage is strong, but open API
     availability is weaker; treat as official website/parser or partnership,
     not as a simple open-data ETL.

3. Deterministic inspectors are mandatory before LLM/browser extraction:
   Socrata, ArcGIS REST, CKAN/Data.gov, URL/PDF, content hashing, license/terms
   capture, source scoring, and duplicate/run tracking. The LLM research worker
   should decide and explain, not silently scrape.

4. Valet, customer-only, monthly-only, airport, event, private, and temporary
   parking must be first-class layers. If they are collapsed into generic
   "parking", coverage will look better than it is and downstream users will
   receive misleading results.

5. Google Places can support discovery and matching, but it should not become
   the master database. Google Places policy explicitly allows indefinite
   storage of place IDs as an exception to caching restrictions, while broader
   Places content has stricter storage limits. ParkingUSA should store its own
   sourced facts and optionally store `google_place_id` as a matching key.

6. OSM and Overture are national base layers, not authoritative price/rule
   sources. OSM is valuable for `amenity=parking`, street parking tags, and
   geometry, but ODbL obligations must be handled deliberately. Overture Places
   is useful for nationwide POI discovery and matching, with open cloud-native
   GeoParquet distribution.

7. A second tool pass with Tavily `search/map/extract` and background browser
   inspection confirmed that dynamic/operator websites can expose useful parser
   surfaces, but they must be separated from official ETL. ABM exposes facility
   and city pages with structured parking facts; ParkChicago exposes official
   rate bands and on-street program context but not a confirmed open API.

## Coverage Targets By Layer

ParkingUSA should measure coverage separately by layer instead of reporting a
single "parking coverage" number.

| Layer | Minimum target for benchmark cities | Primary acquisition path | Completeness metric |
| --- | --- | --- | --- |
| Street meters | Official meter inventory where published | Socrata/ArcGIS/CSV ETL | active meter count vs official source |
| Curb rules/signs | Official signs/rules or CurbLR/CDS where available | Socrata/ArcGIS/CurbLR/CDS | blockfaces with structured rules |
| Curb geometry | City blockface/centerline or derived meter blockface | ArcGIS/Socrata/PostGIS derivation | blockfaces with LineString geometry |
| Garages/lots | OSM/Overture plus operator/city facilities | OSM/osm2pgsql, Overture, city GIS | unique facilities with geometry or entrance |
| Valet | City permits, hotel/restaurant/venue pages, operator pages | official permit ETL, browser/parser, phone review | known valet stands/options by district |
| Airport/event | Official airport/venue pages and reservation engines | parser plus partner/outreach | lots/products with scenario prices |
| Monthly | Operator pages, city monthly permit pages, marketplace leads | parser/partner/outreach | facilities with monthly availability/range |
| EV/accessibility | Operator/city amenities plus OSM tags | ETL/parser/user reports | facilities with verified amenities |
| Private/customer-only | OSM/access tags, POI pages, human/user reports | OSM/Overture/parser/manual review | facilities explicitly classified by access |
| Availability | Sensors, occupancy feeds, bookable inventory, predictions | official API, partner feed, model | observations by source and freshness |

## Structured Research Output Schema

The research worker should emit both a Markdown audit note and structured JSON.
The JSON should be designed to map into `DataSource`, `SourceObservation`, and
future `research_tasks` / `research_findings` tables.

```json
{
  "task": {
    "task_type": "discover_city_sources",
    "city": "Seattle",
    "state": "WA",
    "target_layers": ["street_meters", "curb_rules", "occupancy"],
    "run_started_at": "2026-06-10T00:00:00Z",
    "tools_used": ["socrata_metadata", "arcgis_rest", "web_search"]
  },
  "sources": [
    {
      "source_name": "Seattle Paid Parking Occupancy (Last 30 Days)",
      "source_type": "city_open_data",
      "portal_type": "socrata",
      "source_url": "https://data.seattle.gov/Transportation/Paid-Parking-Occupancy-Last-30-Days-/rke9-rsvs",
      "api_url": "https://data.seattle.gov/resource/rke9-rsvs.json",
      "metadata_url": "https://data.seattle.gov/api/views/rke9-rsvs",
      "license": "unknown",
      "update_cadence": "weekly or better; verify from portal metadata",
      "last_observed_update": "2026-06-10",
      "parking_layers": ["occupancy", "rates", "blockface_reference"],
      "recommended_connector": "socrata",
      "legal_risk": "low for official open data; verify portal license",
      "confidence": 0.9,
      "evidence": [
        {
          "url": "https://data.seattle.gov/Transportation/Paid-Parking-Occupancy-Last-30-Days-/rke9-rsvs",
          "claim": "Official Seattle open data dataset for paid parking occupancy."
        }
      ],
      "field_mapping": {
        "source_id": "SourceElementKey + OccupancyDateTime",
        "observed_at": "OccupancyDateTime",
        "raw_properties": "full row",
        "occupancy": "PaidOccupancy",
        "capacity": "ParkingSpaceCount"
      },
      "parser_spec_required": false,
      "notes": "Use as an observation stream, not as static facility truth."
    }
  ],
  "gaps": [
    {
      "gap_type": "monthly_parking",
      "priority": "medium",
      "recommended_next_task": "operator_parser_or_partner_outreach"
    }
  ]
}
```

## DataSource Mapping

Each discovered source should create or update one `DataSource` record:

```json
{
  "name": "NYC Parking Regulation Locations and Signs",
  "type": "city_open_data:socrata",
  "homepageUrl": "https://data.cityofnewyork.us/Transportation/Parking-Regulation-Locations-and-Signs/nfid-uabd",
  "license": "portal license required",
  "notes": "Current and historical parking regulation signs; must be converted into curb rules with geometry matching."
}
```

Each observed fact, parser run, or metadata extraction should create a
`SourceObservation`:

```json
{
  "sourceName": "NYC Parking Regulation Locations and Signs",
  "sourceId": "nfid-uabd:metadata:2026-06-08",
  "entityType": "source_metadata",
  "entitySourceId": "nfid-uabd",
  "rawProperties": {
    "rowsUpdatedAt": "2026-06-08",
    "columns_sample": ["order_number", "record_type", "borough", "on_street"]
  },
  "confidence": 0.95,
  "notes": "Metadata observed through Socrata /api/views endpoint."
}
```

## Deterministic Inspector Requirements

### Socrata Inspector

Inputs:
- portal domain, dataset id, optional query.

Checks:
- `https://{domain}/api/views/{dataset_id}` metadata.
- `https://{domain}/resource/{dataset_id}.json?$limit=1` sample row.
- update timestamps, columns, row count if exposed, geometry fields, license,
  attribution, and API docs URL.

Connector output:
- `source_type = city_open_data`.
- `portal_type = socrata`.
- `recommended_connector = socrata`.
- API endpoint and SoQL query template.

Relevant official docs:
- https://dev.socrata.com/docs/endpoints.html
- https://dev.socrata.com/docs/queries/

### ArcGIS REST Inspector

Inputs:
- FeatureServer/MapServer URL.

Checks:
- service JSON metadata.
- layers/tables list.
- `supportsPagination`, `maxRecordCount`, geometry type, spatial reference,
  fields, update description if present.
- sample query:
  `query?where=1%3D1&outFields=*&f=json&resultRecordCount=1`.

Connector output:
- `source_type = city_gis`.
- `portal_type = arcgis_rest`.
- layer URLs and pagination strategy.

Relevant official docs:
- https://developers.arcgis.com/rest/services-reference/enterprise/query-feature-service-layer/

### CKAN / Data.gov Inspector

Inputs:
- catalog record URL or search phrase.

Checks:
- do not assume Data.gov behaves exactly like a plain CKAN endpoint.
- validate API flavor first.
- extract distributions and follow them to Socrata, ArcGIS, CSV, GeoJSON, PDF,
  ZIP, or HTML pages.
- persist the catalog URL as evidence, but use the authoritative downstream
  dataset/API as the ingestion source when possible.

Connector output:
- `recommended_connector = catalog_followthrough`.
- one source candidate per distribution.

### URL / PDF Fetcher

Inputs:
- URL, expected content type, parser profile.

Checks:
- HTTP status, content type, final URL after redirects, ETag/Last-Modified,
  content SHA-256, text extraction quality, table detection, crawl permission
  notes, and screenshot requirement if HTML is dynamic.

Connector output:
- `source_hash`, `retrieved_at`, `evidence_url`, `parser_profile`.

### Source Scoring

Suggested scoring dimensions:
- authority: official city/agency > operator official > open map/community >
  marketplace/public page > user report.
- legality/terms: explicit open license/API > public official page > unclear
  terms > anti-automation/checkout-only.
- freshness: live/daily > weekly > monthly > stale/unknown.
- structure: API/GeoJSON/CSV > ArcGIS/Socrata > table/PDF > dynamic page >
  natural language.
- coverage: citywide > district > sample/partial.
- extractability: deterministic ETL > parser > browser agent > phone/human.

## Benchmark City Inventory

### San Francisco, CA

Best current path:
- DataSF/Socrata for meters and policies.
- Existing ParkingUSA SF fixtures should remain the baseline until DB import is
  stable.
- OSM/osmtogeojson for garages/lots/zones, clearly marked as OSM or candidate
  geometry where incomplete.

Primary sources:
- Parking Meters, DataSF:
  https://data.sfgov.org/Transportation/Parking-Meters/8vzz-qzz9
- Socrata metadata:
  https://data.sfgov.org/api/views/8vzz-qzz9
- Meter Policies, DataSF:
  https://data.sfgov.org/Transportation/Meter-Policies/qq7v-hds4
- Socrata metadata:
  https://data.sfgov.org/api/views/qq7v-hds4
- SFMTA parking meters overview:
  https://www.sfmta.com/getting-around/drive-park/parking-meters

Observed metadata on 2026-06-10:
- `8vzz-qzz9` Parking Meters rows updated 2026-06-06.
- `qq7v-hds4` Meter Policies rows updated 2026-06-10.

Extraction:
- meters: `https://data.sfgov.org/resource/8vzz-qzz9.json`
- policies: `https://data.sfgov.org/resource/qq7v-hds4.json`
- join keys: `PARKING_SPACE_ID`, `POST_ID`, policy `ParkingSpaceID`,
  policy `PostID`.

ParkingUSA mapping:
- meter rows -> `ParkingFacility` with `facilityType = street_meter`.
- grouped blockfaces -> `CurbSegment`.
- policy rows -> `SourceObservation` and future rate/rule schedule tables.

Gaps:
- valet permits and private/customer-only lots need separate city permit,
  operator, hotel, restaurant, and venue source discovery.
- event-area rates should be modeled as scenario/rule observations, not a
  single static price.

### New York City, NY

Best current path:
- NYC Open Data/Socrata for meter locations/status and regulation signs.
- NYC DOT rates pages and metered parking map for rate zone context.
- Sign text needs a deterministic plus LLM-assisted rule parser.

Primary sources:
- Parking Meters Locations and Status:
  https://data.cityofnewyork.us/Transportation/Parking-Meters-Locations-and-Status/693u-uax6
- Metadata:
  https://data.cityofnewyork.us/api/views/693u-uax6
- Parking Regulation Locations and Signs:
  https://data.cityofnewyork.us/Transportation/Parking-Regulation-Locations-and-Signs/nfid-uabd
- Metadata:
  https://data.cityofnewyork.us/api/views/nfid-uabd
- NYC DOT meter rates:
  https://www.nyc.gov/html/dot/html/motorist/parking-rates.shtml

Observed metadata on 2026-06-10:
- `693u-uax6` rows updated 2026-06-08.
- `nfid-uabd` rows updated 2026-06-08.

Extraction:
- meters: `https://data.cityofnewyork.us/resource/693u-uax6.json`
- signs: `https://data.cityofnewyork.us/resource/nfid-uabd.json`
- signs should be matched into curb segments by borough, street, from/to
  street, side, sign order, and geospatial fields where present.

ParkingUSA mapping:
- meters -> `ParkingFacility` and possible `CurbSegment` anchor points.
- signs -> `SourceObservation(entityType = curb_rule_sign)` and future rule
  schedule records.
- rates -> source observations and rate-zone reference table.

Gaps:
- off-street garages/lots require OSM/Overture plus operator/marketplace/city
  sources.
- "legal now" must include exceptions and posted-sign precedence warnings.

### Seattle, WA

Best current path:
- Seattle Socrata occupancy for recent observations.
- Seattle ArcGIS Blockface FeatureServer for curb/blockface geometry and
  parking categories.
- SDOT maps/data pages for context and rate change pages.

Primary sources:
- Paid Parking Occupancy (Last 30 Days):
  https://data.seattle.gov/Transportation/Paid-Parking-Occupancy-Last-30-Days-/rke9-rsvs
- Metadata:
  https://data.seattle.gov/api/views/rke9-rsvs
- Seattle Blockface FeatureServer:
  https://services.arcgis.com/ZOyb2t4B0UYuYNYH/ArcGIS/rest/services/Blockface/FeatureServer
- Seattle GeoData Blockface page:
  https://data-seattlecitygis.opendata.arcgis.com/datasets/b35fb25c8c93425980705474b5e82815_1/about
- SDOT maps and data:
  https://www.seattle.gov/transportation/projects-and-programs/programs/parking-program/maps-and-data

Observed metadata on 2026-06-10:
- `rke9-rsvs` rows updated 2026-06-10.
- ArcGIS search result describes Blockface update cycle as weekly and includes
  parking categories/restricted parking zones.
- Socrata `kqdm-4wfs` blockface-space metadata appeared stale in the local
  inspector, so prefer ArcGIS Blockface until revalidated.

Extraction:
- occupancy: `https://data.seattle.gov/resource/rke9-rsvs.json`
- blockface ArcGIS layer query:
  `.../FeatureServer/1/query?where=1%3D1&outFields=*&f=json`

ParkingUSA mapping:
- occupancy rows -> `OccupancyEvent`.
- ArcGIS blockfaces -> `CurbSegment`.
- rate/paid parking area fields -> rate schedule observations.

Gaps:
- off-street and monthly parking need operator/city facility discovery.
- occupancy should be treated as observed/probabilistic, not true live
  availability for every space.

### Los Angeles, CA

Best current path:
- DataLA/Socrata for meter occupancy and metered inventory/policies.
- LA Express Park pages for rate program context and rate update notices.
- Browser/network inspection only after confirming terms and public endpoints.

Primary sources:
- LADOT Parking Meter Occupancy:
  https://data.lacity.org/Transportation/LADOT-Parking-Meter-Occupancy/e7h6-4a3e
- Metadata:
  https://data.lacity.org/api/views/e7h6-4a3e
- LADOT Metered Parking Inventory and Policies:
  https://data.lacity.org/A-Livable-and-Sustainable-City/Parking-Meter-Inventory/s49e-q6j2
- Metadata:
  https://data.lacity.org/api/views/s49e-q6j2
- LA Express Park open data page:
  https://www.laexpresspark.org/la-city-open-data/
- LA Express Park technology page:
  https://www.laexpresspark.org/technology/

Observed metadata on 2026-06-10:
- `e7h6-4a3e` rows updated 2026-06-10.
- `s49e-q6j2` rows updated 2026-06-09.

Extraction:
- occupancy: `https://data.lacity.org/resource/e7h6-4a3e.json`
- inventory/policies: `https://data.lacity.org/resource/s49e-q6j2.json`

ParkingUSA mapping:
- inventory -> `ParkingFacility(facilityType = street_meter)`.
- policy fields -> `SourceObservation(entityType = meter_policy)`.
- occupancy -> `OccupancyEvent`.

Gaps:
- LA has many private/event/valet layers; official meter data is not enough for
  useful citywide parking coverage.
- event and venue parking should be parser/outreach tasks.

### Chicago, IL

Best current path:
- Official ParkChicago and City of Chicago pages for on-street meter rates and
  map context.
- Permit zones from open data where available.
- Treat ParkChicago as an official website/app parser or partner target unless
  an explicit open API is discovered.

Primary sources:
- ParkChicago home:
  https://parkchicago.com/
- ParkChicago rates and hours:
  https://parkchicago.com/rates-hours
- ParkChicago map announcement:
  https://parkchicago.com/news/new-parkchicago-r-map-app-helps-find-open-parking-spots
- City of Chicago parking meters page:
  https://www.chicago.gov/city/en/depts/fin/supp_info/revenue/parking_meters.html
- Parking Permit Zones, Data.gov:
  https://catalog.data.gov/dataset/parking-permit-zones

Observed evidence:
- ParkChicago says Chicago Parking Meters is the official operator of the
  city's 36,000 on-street spaces.
- ParkChicago rates page publishes rate bands and emphasizes checking signage.
- The ParkChicago map app describes rates, limits, restrictions, and predictive
  availability, but this is app/web product evidence rather than a confirmed
  open ETL source.
- Background browser inspection on 2026-06-10 confirmed that the rendered
  ParkChicago rates page exposes the official-operator statement, rate bands,
  signage caveat, and mobile app links without requiring login.

Extraction:
- official web parser candidate for rates/hours and zone pages.
- browser/network inspection candidate for map data only after legal/terms
  review.
- permit zones should be traced through Data.gov to the authoritative city
  distribution.

ParkingUSA mapping:
- rate districts -> `ParkingZone` or future rate-zone table.
- metered-space map data, if lawfully accessible -> `CurbSegment` /
  `ParkingFacility`.
- app availability -> `Prediction` only if source terms allow reuse.

Gaps:
- no confirmed open dataset equivalent to SF/NYC/LA meters in this research
  pass.
- off-street inventory needs OSM/Overture plus operator networks.

## National Base Layers

### Off-Street Parking Research Dataset

Supplemental benchmark evidence:
- "Off-street Parking in 15 US Cities" uses satellite segmentation and manual
  correction to estimate surface parking polygons and parcel share in 15 US
  cities. The article reports, for example, Chicago at 6.1%, Los Angeles at
  5.7%, and Seattle at 5.1% total parcel land share used for surface parking.

ParkingUSA use:
- Do not treat the study as a production ingestion source without checking the
  dataset license, geometry download terms, and fitness for consumer parking
  navigation.
- Use it as a benchmark and QA signal for off-street coverage: if ParkingUSA's
  known lot/garage layer is far below the study's surface-parking footprint in
  a metro, add missing-parking queue tasks.

Source:
- https://findingspress.org/article/145256-off-street-parking-in-15-us-cities

### OpenStreetMap

Use:
- `amenity=parking`, `parking=*`, `access=*`, `fee=*`, `capacity=*`,
  `opening_hours=*`, parking-lane/street-parking tags, ways, nodes, and
  multipolygon relations.

ParkingUSA route:
- Overpass plus `osmtogeojson` for city-scale research.
- `osm2pgsql` as external GPL CLI/Docker service for production PBF imports.
- Do not manually rewrite multipolygon/relation handling.

Legal/provenance:
- OSM data is under ODbL; attribution and share-alike/database obligations must
  be reviewed before mixing/distributing derived databases.
- Store OSM object id/version/timestamp where available.

Sources:
- https://wiki.openstreetmap.org/wiki/Parking
- https://wiki.openstreetmap.org/wiki/Street_parking
- https://opendatacommons.org/licenses/odbl/

### Overture Maps

Use:
- national POI discovery, address/name/category/brand matching, building/place
  matching, and possible parking-related categories.

ParkingUSA route:
- DuckDB over cloud GeoParquet for bounded metro extracts.
- Match to OSM/city/operator records by name, category, address, distance, and
  GERS identifiers where relevant.

Sources:
- https://docs.overturemaps.org/guides/places/
- https://registry.opendata.aws/overture/
- https://github.com/OvertureMaps/data

### CurbLR And OMF CDS

Use:
- target data model references for curb regulations, curb zones, policies,
  spaces, and events.
- import format when a city publishes compatible data.

ParkingUSA route:
- map city-specific curb rules into an internal normalized model that can later
  export to or align with CurbLR/CDS concepts.

Sources:
- https://github.com/curblr/curblr-spec
- https://github.com/openmobilityfoundation/curb-data-specification
- https://www.openmobilityfoundation.org/about-cds/

## Operator, Marketplace, Airport, Venue, And Valet Source Paths

### Operator Networks

Operator pages are essential for off-street, monthly, valet, airport, and event
coverage, but they vary in legal/extraction risk.

Targets:
- ABM Parking: https://abmparking.com/
- Parking.com / SP+: https://parking.com/ and https://www.spplus.com/parking-com/
- Premium Parking: https://www.premiumparking.com/
- SpotHero: https://spothero.com/

Evidence:
- ABM publicly describes 2,000+ parking locations in 230+ cities.
- Parking.com/SP+ supports daily, monthly, and event parking pages.
- Premium Parking publishes daily/monthly/yearly product paths and support
  notes that rates can change.
- SpotHero exposes consumer reservation flows for garages, lots, valets,
  airports, monthly, and events.
- Tavily site mapping of ABM on 2026-06-10 found parser-relevant surfaces:
  `/facilities`, city pages such as `/locations/chicago-parking`,
  `/locations/san-francisco-parking`, `/locations/seattle`, individual facility
  pages, and `/search`.
- Tavily extraction of ABM facility page
  `https://abmparking.com/facilities/33-w-ontario-st-parking` found structured
  facts that are suitable for a parser spec: facility name, garage type,
  address, entrance descriptions, nearby destinations, office hours, operating
  hours, amenities, height restriction, phone number, and ALPR policy link.
- ABM search/facility URLs may include checkout parameters such as type,
  start/end time, and expected price. Treat those as scenario-price evidence
  only after terms/legal review; do not use checkout scraping as the default
  acquisition method.

Recommended acquisition order:
1. Partner/API/affiliate inquiry for marketplace and reservation data.
2. Public location-page discovery for operator-owned pages if terms allow.
3. Browser research only for parser design and high-value verification, not as
   an unreviewed production scraper.
4. AI call/human review for stale, conflicting, missing, or high-value facts.

### Parser Spec Template

Every parser-required source must have a spec before automation:

```yaml
source_name: ABM Parking
source_url: https://abmparking.com/
source_type: operator_public_site
target_layers:
  - garages_lots
  - monthly
  - valet
legal_risk: medium
acquisition_path: public_web_parser_or_partner
crawl_seed:
  - homepage search
  - city pages
  - facility pages
known_paths:
  - /facilities
  - /locations/chicago-parking
  - /locations/san-francisco-parking
  - /locations/seattle
  - /search
date_time_scenarios:
  - arrive_now_2h
  - weekday_8h
  - overnight
  - monthly
fields:
  - facility_name
  - address
  - entrance_hint
  - lat_lng_if_available
  - operator
  - facility_type
  - access
  - price_scenario
  - booking_url
  - hours
  - amenities
  - height_restriction
  - phone
  - alpr_policy_url
dedupe_keys:
  - operator_slug_or_location_id
  - normalized_address
  - name_address_distance
evidence_capture:
  - html_hash
  - screenshot
  - final_url
  - network_endpoint_if_used
refresh_cadence: weekly for prices, monthly for existence
failure_modes:
  - dynamic JS changed
  - anti-bot or checkout-only pricing
  - price depends on date/event
  - monthly price hidden behind login/form
fallback:
  - partner outreach
  - phone verification
  - human review
```

### Airports, Venues, Universities, Hospitals, Hotels, Restaurants

These should not be treated as a footnote. They are where "missing parking"
will be most visible to users.

Acquisition path:
- seed lists from official airport/venue/university/hospital directories,
  OSM/Overture places, and city-owned facility lists.
- prefer official parking pages and reservation engines.
- extract lots/garages, terminal/venue walking notes, shuttle notes, valet
  availability, ADA/EV/height restrictions, event pricing, and reservation URLs.
- use phone/AI-call tasks only for high-value missing or conflicting facts.

Example official airport source:
- Denver International Airport parking rates/lots:
  https://www.flydenver.com/parking-and-transportation/parking-lots/

## Missing-Parking Queue

ParkingUSA should maintain a missing-parking queue instead of treating unknowns
as complete. Queue records should include:

- city/state.
- search area or destination.
- missing layer type: valet, private lot, customer-only, event, airport,
  monthly, curb rule, meter, garage/lot.
- discovery evidence: OSM/Overture candidate, user report, operator hint,
  browser screenshot, phone transcript, or manual sample.
- priority: demand, destination importance, stale/conflict severity.
- recommended path: official ETL, parser, browser agent, partner/outreach,
  AI call, human review.
- due date and next review cadence.

## Legal And Terms Risk Matrix

| Source class | Risk | Recommended use |
| --- | --- | --- |
| Official open data API with clear license | Low | deterministic ETL |
| Official city page/PDF without API | Low-medium | URL/PDF fetcher, parser, citation |
| ArcGIS/Socrata public data with unclear license | Low-medium | ETL plus license review note |
| OSM | Medium | import with ODbL compliance and attribution |
| Overture | Low-medium | verify current license/release terms, use as discovery |
| Operator public pages | Medium | parser only after terms review; prefer partner |
| Marketplace reservation pages | Medium-high | partner/API/affiliate first; avoid checkout scraping |
| Google Places | Medium-high | discovery/matching only; do not master/cache broad content |
| Browser dynamic extraction | Medium-high | research/prototype, screenshots, parser specs, terms review |
| AI phone calls | Medium-high | TCPA/recording consent/opt-out policy by state |
| User reports/photos | Medium | moderation, consent, attribution, evidence retention |

Google Places policy source:
- https://developers.google.com/maps/documentation/places/web-service/policies

## Production Researcher Wrapper

Use `open_deep_research` as the architecture reference, but build a
ParkingUSA-specific wrapper around deterministic tools.

Suggested service boundary:

```text
Next.js / admin UI
  -> research task table or queue
  -> researcher-service
     -> deterministic inspectors
     -> Tavily/search/browser tools for discovery only
     -> structured JSON finding
     -> Markdown audit note
  -> Prisma persistence into DataSource / SourceObservation
  -> importer/parser task queue
```

Task types:
- `discover_city_sources`
- `classify_source`
- `extract_dataset_metadata`
- `inspect_socrata_dataset`
- `inspect_arcgis_layer`
- `inspect_catalog_record`
- `draft_parser_spec`
- `verify_operator_facility`
- `verify_conflicting_fact`
- `create_missing_parking_queue_items`

Research worker guardrails:
- Prefer official/open/public agency sources.
- Always store evidence URLs and retrieval metadata.
- Do not emit a parser-required source without a parser spec.
- Do not claim completeness without layer-specific metrics.
- Do not use Google Places, marketplaces, or operator pages as master data
  without legal/terms classification.
- Route deterministic ETL sources to code, not LLM/browser scraping.

## Immediate Implementation Backlog

1. Add deterministic inspectors:
   - `apps/backend/scripts/inspect_socrata_source.*`
   - `apps/backend/scripts/inspect_arcgis_source.*`
   - `apps/backend/scripts/inspect_url_source.*`
   - `apps/backend/scripts/score_research_source.*`

2. Add structured research persistence:
   - either dedicated `ResearchTask` / `ResearchFinding` models, or
   - temporary persistence through `SourceObservation(entityType =
     source_metadata | parser_spec | gap_candidate)`.

3. Create benchmark city manifests:
   - `data/research/cities/san-francisco.ca.json`
   - `data/research/cities/new-york.ny.json`
   - `data/research/cities/seattle.wa.json`
   - `data/research/cities/los-angeles.ca.json`
   - `data/research/cities/chicago.il.json`

4. Convert this research into source candidates:
   - official meter/rule/occupancy sources first.
   - OSM/Overture base discovery second.
   - operator parser specs third.

5. Add acceptance checks:
   - every finding has direct source URL.
   - every API source has an endpoint.
   - every parser source has a parser spec.
   - every non-official source has legal/terms risk.
   - every source maps to `DataSource` and at least one `SourceObservation`
     pattern.

## Source URLs Reviewed

Official city/open data:
- https://data.sfgov.org/Transportation/Parking-Meters/8vzz-qzz9
- https://data.sfgov.org/api/views/8vzz-qzz9
- https://data.sfgov.org/Transportation/Meter-Policies/qq7v-hds4
- https://data.sfgov.org/api/views/qq7v-hds4
- https://www.sfmta.com/getting-around/drive-park/parking-meters
- https://data.cityofnewyork.us/Transportation/Parking-Meters-Locations-and-Status/693u-uax6
- https://data.cityofnewyork.us/api/views/693u-uax6
- https://data.cityofnewyork.us/Transportation/Parking-Regulation-Locations-and-Signs/nfid-uabd
- https://data.cityofnewyork.us/api/views/nfid-uabd
- https://www.nyc.gov/html/dot/html/motorist/parking-rates.shtml
- https://data.seattle.gov/Transportation/Paid-Parking-Occupancy-Last-30-Days-/rke9-rsvs
- https://data.seattle.gov/api/views/rke9-rsvs
- https://services.arcgis.com/ZOyb2t4B0UYuYNYH/ArcGIS/rest/services/Blockface/FeatureServer
- https://data-seattlecitygis.opendata.arcgis.com/datasets/b35fb25c8c93425980705474b5e82815_1/about
- https://www.seattle.gov/transportation/projects-and-programs/programs/parking-program/maps-and-data
- https://data.lacity.org/Transportation/LADOT-Parking-Meter-Occupancy/e7h6-4a3e
- https://data.lacity.org/api/views/e7h6-4a3e
- https://data.lacity.org/A-Livable-and-Sustainable-City/Parking-Meter-Inventory/s49e-q6j2
- https://data.lacity.org/api/views/s49e-q6j2
- https://www.laexpresspark.org/la-city-open-data/
- https://www.laexpresspark.org/technology/
- https://parkchicago.com/
- https://parkchicago.com/rates-hours
- https://parkchicago.com/news/new-parkchicago-r-map-app-helps-find-open-parking-spots
- https://www.chicago.gov/city/en/depts/fin/supp_info/revenue/parking_meters.html
- https://catalog.data.gov/dataset/parking-permit-zones

Standards and national base layers:
- https://dev.socrata.com/docs/endpoints.html
- https://dev.socrata.com/docs/queries/
- https://developers.arcgis.com/rest/services-reference/enterprise/query-feature-service-layer/
- https://github.com/curblr/curblr-spec
- https://github.com/openmobilityfoundation/curb-data-specification
- https://www.openmobilityfoundation.org/about-cds/
- https://docs.overturemaps.org/guides/places/
- https://registry.opendata.aws/overture/
- https://github.com/OvertureMaps/data
- https://wiki.openstreetmap.org/wiki/Parking
- https://wiki.openstreetmap.org/wiki/Street_parking
- https://opendatacommons.org/licenses/odbl/
- https://developers.google.com/maps/documentation/places/web-service/policies

Operator/marketplace/public pages:
- https://abmparking.com/
- https://www.abm.com/solutions/service-family/parking-transportation
- https://parking.com/
- https://www.spplus.com/parking-com/
- https://www.premiumparking.com/
- https://support.premiumparking.com/support/solutions/articles/12000048385-rate-changes-
- https://spothero.com/
- https://spothero.com/parking/monthly-parking
- https://www.flydenver.com/parking-and-transportation/parking-lots/

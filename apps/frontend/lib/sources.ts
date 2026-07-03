/* ═══════════════════════════════════════════════════════════════
   ParkingUSA — Frontend Source Catalog
   Single frontend-accessible registry of parking data sources grouped by city.
   ═══════════════════════════════════════════════════════════════ */

export type SourceCityId =
  | 'chicago'
  | 'la'
  | 'miami'
  | 'nyc'
  | 'sf'
  | 'seattle'
  | 'national-operators';

export type SourceType =
  | 'city_open_data'
  | 'city_gis'
  | 'official_airport_page'
  | 'official_city_gis'
  | 'official_city_open_data'
  | 'official_city_page'
  | 'official_city_page_embedded_map'
  | 'official_county_open_data'
  | 'official_county_page'
  | 'official_county_transit_page'
  | 'official_operator_page'
  | 'official_parking_authority'
  | 'official_port_page'
  | 'open_geodata'
  | 'openstreetmap'
  | 'openstreetmap_extract'
  | 'operator_public_site';

export type PortalType =
  | 'arcgis_hub'
  | 'arcgis_rest'
  | 'browser_dynamic'
  | 'html'
  | 'national_operator'
  | 'overpass'
  | 'parquet'
  | 'pbf'
  | 'socrata'
  | 'wordpress_wpgmza_json';

export type SourceIngestionStatus =
  | 'fetched_fixture'
  | 'needs_browser_parser'
  | 'needs_parser'
  | 'ready_for_fetch'
  | 'ready_for_import_design'
  | 'ready_for_inspection'
  | 'research_only'
  | 'seed_fixture';

export interface ParkingSourceEvidence {
  url: string;
  claim: string;
}

export interface ParkingSourceCatalogEntry {
  id: string;
  cityId: SourceCityId;
  city: string;
  state: string;
  sourceName: string;
  sourceType: SourceType;
  portalType: PortalType;
  sourceUrl: string;
  metadataUrl?: string;
  apiUrl?: string;
  paymentUrl?: string;
  bookingUrl?: string;
  parkingLayers: string[];
  recommendedConnector: string;
  legalRisk: string;
  confidence: number;
  ingestionStatus: SourceIngestionStatus;
  parserSpecRequired: boolean;
  lastObservedUpdate?: string;
  evidence: ParkingSourceEvidence[];
}

export interface ParkingSourceCityGroup {
  cityId: SourceCityId;
  city: string;
  state: string;
  sources: ParkingSourceCatalogEntry[];
}

const sourceEntry = (entry: ParkingSourceCatalogEntry): ParkingSourceCatalogEntry => entry;

export const PARKING_SOURCE_CATALOG: ParkingSourceCatalogEntry[] = [
  sourceEntry({
    id: 'chicago-parkchicago-rates-hours',
    cityId: 'chicago',
    city: 'Chicago',
    state: 'IL',
    sourceName: 'ParkChicago Rates and Hours',
    sourceType: 'official_operator_page',
    portalType: 'html',
    sourceUrl: 'https://parkchicago.com/rates-hours',
    parkingLayers: ['rates', 'street_meter_context'],
    recommendedConnector: 'url_fetcher_plus_browser_research',
    legalRisk: 'medium_terms_review',
    confidence: 0.78,
    ingestionStatus: 'research_only',
    parserSpecRequired: true,
    lastObservedUpdate: '2026-06-10_browser_checked',
    evidence: [{ url: 'https://parkchicago.com/rates-hours', claim: 'Official ParkChicago rate and hour page discovered in Phase 6 research.' }],
  }),
  sourceEntry({
    id: 'chicago-city-about-parking-meters',
    cityId: 'chicago',
    city: 'Chicago',
    state: 'IL',
    sourceName: 'City of Chicago About Parking Meters',
    sourceType: 'official_city_page',
    portalType: 'html',
    sourceUrl: 'https://www.chicago.gov/city/en/depts/fin/supp_info/revenue/parking_meters.html',
    parkingLayers: ['street_meter_context', 'official_links'],
    recommendedConnector: 'url_fetcher',
    legalRisk: 'low_medium_terms_review',
    confidence: 0.82,
    ingestionStatus: 'research_only',
    parserSpecRequired: true,
    lastObservedUpdate: '2026-06-10_extracted',
    evidence: [{ url: 'https://www.chicago.gov/city/en/depts/fin/supp_info/revenue/parking_meters.html', claim: 'Official City of Chicago parking meter context page.' }],
  }),
  sourceEntry({
    id: 'la-ladot-parking-meter-occupancy',
    cityId: 'la',
    city: 'Los Angeles',
    state: 'CA',
    sourceName: 'LADOT Parking Meter Occupancy',
    sourceType: 'city_open_data',
    portalType: 'socrata',
    sourceUrl: 'https://data.lacity.org/Transportation/LADOT-Parking-Meter-Occupancy/e7h6-4a3e',
    metadataUrl: 'https://data.lacity.org/api/views/e7h6-4a3e',
    apiUrl: 'https://data.lacity.org/resource/e7h6-4a3e.json',
    parkingLayers: ['occupancy'],
    recommendedConnector: 'socrata',
    legalRisk: 'low_verify_license',
    confidence: 0.92,
    ingestionStatus: 'ready_for_inspection',
    parserSpecRequired: false,
    lastObservedUpdate: '2026-06-10',
    evidence: [
      { url: 'https://data.lacity.org/Transportation/LADOT-Parking-Meter-Occupancy/e7h6-4a3e', claim: 'Source landing page discovered in Phase 6 research.' },
      { url: 'https://data.lacity.org/resource/e7h6-4a3e.json', claim: 'Machine-readable API/query endpoint.' },
    ],
  }),
  sourceEntry({
    id: 'la-ladot-metered-parking-inventory-policies',
    cityId: 'la',
    city: 'Los Angeles',
    state: 'CA',
    sourceName: 'LADOT Metered Parking Inventory and Policies',
    sourceType: 'city_open_data',
    portalType: 'socrata',
    sourceUrl: 'https://data.lacity.org/A-Livable-and-Sustainable-City/Parking-Meter-Inventory/s49e-q6j2',
    metadataUrl: 'https://data.lacity.org/api/views/s49e-q6j2',
    apiUrl: 'https://data.lacity.org/resource/s49e-q6j2.json',
    parkingLayers: ['street_meters', 'street_meter_rules', 'rates'],
    recommendedConnector: 'socrata',
    legalRisk: 'low_verify_license',
    confidence: 0.92,
    ingestionStatus: 'ready_for_inspection',
    parserSpecRequired: false,
    lastObservedUpdate: '2026-06-09',
    evidence: [
      { url: 'https://data.lacity.org/A-Livable-and-Sustainable-City/Parking-Meter-Inventory/s49e-q6j2', claim: 'Source landing page discovered in Phase 6 research.' },
      { url: 'https://data.lacity.org/resource/s49e-q6j2.json', claim: 'Machine-readable API/query endpoint.' },
    ],
  }),
  sourceEntry({
    id: 'miami-mpa-main-site',
    cityId: 'miami',
    city: 'Miami',
    state: 'FL',
    sourceName: 'Miami Parking Authority Main Site',
    sourceType: 'official_parking_authority',
    portalType: 'html',
    sourceUrl: 'https://www.miamiparking.com/',
    paymentUrl: 'https://www.miamiparking.com/pay-by-phone/',
    parkingLayers: ['garages_lots', 'street_meters', 'on_street_zones', 'monthly', 'payments'],
    recommendedConnector: 'url_fetcher_plus_browser_research',
    legalRisk: 'low_medium_terms_review',
    confidence: 0.88,
    ingestionStatus: 'needs_browser_parser',
    parserSpecRequired: true,
    lastObservedUpdate: '2026-06-11_researched',
    evidence: [{ url: 'https://www.miamiparking.com/', claim: 'Official Miami Parking Authority entry point for City of Miami parking facilities, permits, payment, and parking services.' }],
  }),
  sourceEntry({
    id: 'miami-mpa-find-parking-commerce',
    cityId: 'miami',
    city: 'Miami',
    state: 'FL',
    sourceName: 'Miami Parking Authority Find Parking Commerce',
    sourceType: 'official_parking_authority',
    portalType: 'browser_dynamic',
    sourceUrl: 'https://commerce.miamiparking.com/facility/findparking',
    paymentUrl: 'https://commerce.miamiparking.com/',
    parkingLayers: ['garages_lots', 'monthly', 'on_street_meter_rentals', 'visitor_passes', 'special_event', 'validation'],
    recommendedConnector: 'browser_agent_network_inspection',
    legalRisk: 'medium_terms_review',
    confidence: 0.86,
    ingestionStatus: 'needs_browser_parser',
    parserSpecRequired: true,
    lastObservedUpdate: '2026-06-11_browser_checked',
    evidence: [{ url: 'https://commerce.miamiparking.com/facility/findparking', claim: 'Browser inspection showed service categories for garage, lot, monthly, meter-rental, valet, production, construction, and special-event parking.' }],
  }),
  sourceEntry({
    id: 'miami-dade-county-parking-facilities',
    cityId: 'miami',
    city: 'Miami',
    state: 'FL',
    sourceName: 'Miami-Dade County Parking Facilities',
    sourceType: 'official_county_page',
    portalType: 'html',
    sourceUrl: 'https://www.miamidade.gov/global/service.page?Mduid_service=ser1478201414291250',
    parkingLayers: ['county_garages', 'county_lots', 'rates', 'monthly'],
    recommendedConnector: 'static_html_parser',
    legalRisk: 'low_medium_terms_review',
    confidence: 0.9,
    ingestionStatus: 'seed_fixture',
    parserSpecRequired: false,
    lastObservedUpdate: '2026-06-11_manual_seed',
    evidence: [{ url: 'https://www.miamidade.gov/global/service.page?Mduid_service=ser1478201414291250', claim: 'Official Miami-Dade County page listing county parking facilities, rates, addresses, and monthly parking details.' }],
  }),
  sourceEntry({
    id: 'miami-dade-open-data-hub',
    cityId: 'miami',
    city: 'Miami',
    state: 'FL',
    sourceName: 'Miami-Dade Open Data Hub',
    sourceType: 'official_county_open_data',
    portalType: 'arcgis_hub',
    sourceUrl: 'https://gis-mdc.opendata.arcgis.com/',
    parkingLayers: ['gis_discovery', 'county_facilities', 'transit_parking_candidates'],
    recommendedConnector: 'arcgis_hub_search_then_arcgis_rest',
    legalRisk: 'low_verify_license',
    confidence: 0.78,
    ingestionStatus: 'research_only',
    parserSpecRequired: false,
    lastObservedUpdate: '2026-06-11_researched',
    evidence: [{ url: 'https://gis-mdc.opendata.arcgis.com/', claim: 'Official Miami-Dade GIS/open-data hub for discovering county facility and transportation layers.' }],
  }),
  sourceEntry({
    id: 'miami-dade-transit-parking',
    cityId: 'miami',
    city: 'Miami',
    state: 'FL',
    sourceName: 'Miami-Dade Transit Parking',
    sourceType: 'official_county_transit_page',
    portalType: 'html',
    sourceUrl: 'https://www.miamidade.gov/global/transportation/metrorail-parking.page',
    parkingLayers: ['transit_station_parking', 'rates', 'monthly_or_daily'],
    recommendedConnector: 'static_html_parser',
    legalRisk: 'low_medium_terms_review',
    confidence: 0.78,
    ingestionStatus: 'research_only',
    parserSpecRequired: false,
    lastObservedUpdate: '2026-06-11_researched',
    evidence: [{ url: 'https://www.miamidade.gov/global/transportation/metrorail-parking.page', claim: 'Official county transit parking page for park-and-ride style facilities and rates.' }],
  }),
  sourceEntry({
    id: 'miami-international-airport-parking',
    cityId: 'miami',
    city: 'Miami',
    state: 'FL',
    sourceName: 'Miami International Airport Parking',
    sourceType: 'official_airport_page',
    portalType: 'html',
    sourceUrl: 'https://www.miami-airport.com/parking.asp',
    parkingLayers: ['airport_garages', 'rates', 'cell_phone_lot'],
    recommendedConnector: 'static_html_parser_plus_browser_for_rate_widgets',
    legalRisk: 'low_medium_terms_review',
    confidence: 0.86,
    ingestionStatus: 'needs_parser',
    parserSpecRequired: true,
    lastObservedUpdate: '2026-06-11_researched',
    evidence: [{ url: 'https://www.miami-airport.com/parking.asp', claim: 'Official Miami International Airport parking page for airport garages and rate information.' }],
  }),
  sourceEntry({
    id: 'portmiami-parking',
    cityId: 'miami',
    city: 'Miami',
    state: 'FL',
    sourceName: 'PortMiami Parking',
    sourceType: 'official_port_page',
    portalType: 'html',
    sourceUrl: 'https://www.miamidade.gov/portmiami/parking-transportation.asp',
    parkingLayers: ['cruise_terminal_parking', 'rates', 'garages_lots', 'accessibility'],
    recommendedConnector: 'static_html_parser',
    legalRisk: 'low_medium_terms_review',
    confidence: 0.86,
    ingestionStatus: 'research_only',
    parserSpecRequired: false,
    lastObservedUpdate: '2026-06-11_researched',
    evidence: [{ url: 'https://www.miamidade.gov/portmiami/parking-transportation.asp', claim: 'Official PortMiami parking and transportation page for cruise terminal parking and rates.' }],
  }),
  sourceEntry({
    id: 'city-of-miami-data-explorer',
    cityId: 'miami',
    city: 'Miami',
    state: 'FL',
    sourceName: 'City of Miami Data Explorer',
    sourceType: 'official_city_open_data',
    portalType: 'arcgis_hub',
    sourceUrl: 'https://data.miamigov.com/',
    parkingLayers: ['city_dataset_discovery', 'possible_gis_layers', 'curb_or_facility_candidates'],
    recommendedConnector: 'arcgis_hub_search_then_arcgis_rest',
    legalRisk: 'low_verify_license',
    confidence: 0.7,
    ingestionStatus: 'research_only',
    parserSpecRequired: false,
    lastObservedUpdate: '2026-06-11_researched',
    evidence: [{ url: 'https://data.miamigov.com/', claim: 'Official City of Miami data portal; no confirmed parking meter point API was found in this pass.' }],
  }),
  sourceEntry({
    id: 'miami-beach-parking-facilities-wpgmza',
    cityId: 'miami',
    city: 'Miami Beach',
    state: 'FL',
    sourceName: 'City of Miami Beach Parking Facilities WPGMZA',
    sourceType: 'official_city_page_embedded_map',
    portalType: 'wordpress_wpgmza_json',
    sourceUrl: 'https://www.miamibeachfl.gov/city-hall/parking/parking-garages-lot-locations/',
    apiUrl: 'https://www.miamibeachfl.gov/wp-json/wpgmza/v1/markers?map_id=17',
    parkingLayers: ['municipal_garages', 'municipal_lots', 'rates', 'parkmobile_zones', 'ev_charging'],
    recommendedConnector: 'wordpress_wpgmza_json_import',
    legalRisk: 'low_medium_terms_review',
    confidence: 0.9,
    ingestionStatus: 'fetched_fixture',
    parserSpecRequired: false,
    lastObservedUpdate: '2026-06-12_fetched',
    evidence: [{ url: 'https://www.miamibeachfl.gov/wp-json/wpgmza/v1/markers?map_id=17', claim: 'Official Miami Beach WP Go Maps marker endpoint yielded 74 public parking garage/lot markers.' }],
  }),
  sourceEntry({
    id: 'miami-beach-parking-gis-featureserver',
    cityId: 'miami',
    city: 'Miami Beach',
    state: 'FL',
    sourceName: 'City of Miami Beach Parking GIS FeatureServer',
    sourceType: 'official_city_gis',
    portalType: 'arcgis_rest',
    sourceUrl: 'https://gis.miamibeachfl.gov/public/rest/services/mb/Parking/FeatureServer',
    metadataUrl: 'https://gis.miamibeachfl.gov/public/rest/services/mb/Parking/FeatureServer?f=pjson',
    apiUrl: 'https://gis.miamibeachfl.gov/public/rest/services/mb/Parking/FeatureServer',
    parkingLayers: ['parking_meters', 'parking_spaces', 'parking_lots', 'parking_zones', 'parking_signs', 'non_metered_spaces'],
    recommendedConnector: 'arcgis_rest_geojson_import',
    legalRisk: 'low_verify_license',
    confidence: 0.92,
    ingestionStatus: 'fetched_fixture',
    parserSpecRequired: false,
    lastObservedUpdate: '2026-06-12_fetched',
    evidence: [{ url: 'https://gis.miamibeachfl.gov/public/rest/services/mb/Parking/FeatureServer', claim: 'Official Miami Beach ArcGIS FeatureServer used for 535 facility points, actual layer 5 lot polygons, and layer 7 residential/regulatory parking-zone polygons in fallback.' }],
  }),
  sourceEntry({
    id: 'parking-com-sp-plus-miami',
    cityId: 'miami',
    city: 'Miami',
    state: 'FL',
    sourceName: 'Parking.com SP Plus Miami',
    sourceType: 'operator_public_site',
    portalType: 'browser_dynamic',
    sourceUrl: 'https://parking.com/miami',
    bookingUrl: 'https://parking.com/miami',
    parkingLayers: ['private_garages_lots', 'rates', 'booking_url', 'monthly', 'event'],
    recommendedConnector: 'browser_agent_network_inspection',
    legalRisk: 'medium_terms_review',
    confidence: 0.82,
    ingestionStatus: 'needs_browser_parser',
    parserSpecRequired: true,
    lastObservedUpdate: '2026-06-11_researched',
    evidence: [{ url: 'https://parking.com/miami', claim: 'Major private parking operator/marketplace source for bookable Miami garages and lots.' }],
  }),
  sourceEntry({
    id: 'abm-parking-miami',
    cityId: 'miami',
    city: 'Miami',
    state: 'FL',
    sourceName: 'ABM Parking Miami',
    sourceType: 'operator_public_site',
    portalType: 'browser_dynamic',
    sourceUrl: 'https://abmparking.com/',
    parkingLayers: ['private_garages_lots', 'monthly', 'rates', 'amenities', 'valet_candidates'],
    recommendedConnector: 'browser_agent_network_inspection',
    legalRisk: 'medium_terms_review',
    confidence: 0.74,
    ingestionStatus: 'needs_browser_parser',
    parserSpecRequired: true,
    lastObservedUpdate: '2026-06-11_researched',
    evidence: [{ url: 'https://abmparking.com/', claim: 'Major operator source; Miami-specific extraction should use site search and facility details.' }],
  }),
  sourceEntry({
    id: 'laz-parking-miami',
    cityId: 'miami',
    city: 'Miami',
    state: 'FL',
    sourceName: 'LAZ Parking Miami',
    sourceType: 'operator_public_site',
    portalType: 'browser_dynamic',
    sourceUrl: 'https://www.lazparking.com/',
    parkingLayers: ['private_garages_lots', 'event', 'monthly', 'rates', 'booking_url'],
    recommendedConnector: 'browser_agent_network_inspection',
    legalRisk: 'medium_terms_review',
    confidence: 0.7,
    ingestionStatus: 'needs_browser_parser',
    parserSpecRequired: true,
    lastObservedUpdate: '2026-06-11_researched',
    evidence: [{ url: 'https://www.lazparking.com/', claim: 'Large national operator; use browser/site search for Miami facilities and events.' }],
  }),
  sourceEntry({
    id: 'premium-parking-miami',
    cityId: 'miami',
    city: 'Miami',
    state: 'FL',
    sourceName: 'Premium Parking Miami',
    sourceType: 'operator_public_site',
    portalType: 'browser_dynamic',
    sourceUrl: 'https://www.premiumparking.com/city/miami',
    bookingUrl: 'https://www.premiumparking.com/city/miami',
    parkingLayers: ['private_garages_lots', 'rates', 'booking_url', 'monthly'],
    recommendedConnector: 'browser_agent_network_inspection',
    legalRisk: 'medium_terms_review',
    confidence: 0.76,
    ingestionStatus: 'needs_browser_parser',
    parserSpecRequired: true,
    lastObservedUpdate: '2026-06-11_researched',
    evidence: [{ url: 'https://www.premiumparking.com/city/miami', claim: 'Operator city page candidate for bookable Miami lots/garages and payment links.' }],
  }),
  sourceEntry({
    id: 'osm-miami-parking',
    cityId: 'miami',
    city: 'Miami',
    state: 'FL',
    sourceName: 'OpenStreetMap Miami Parking',
    sourceType: 'openstreetmap',
    portalType: 'overpass',
    sourceUrl: 'https://www.openstreetmap.org/',
    apiUrl: 'https://overpass-api.de/api/interpreter',
    parkingLayers: ['garages_lots', 'parking_entrances', 'access', 'capacity_if_tagged', 'fee_if_tagged'],
    recommendedConnector: 'overpass_osm_import_with_retry_or_geofabrik_pbf',
    legalRisk: 'low_odbl_attribution_required',
    confidence: 0.8,
    ingestionStatus: 'ready_for_fetch',
    parserSpecRequired: false,
    lastObservedUpdate: '2026-06-11_fetch_attempted',
    evidence: [{ url: 'apps/backend/scripts/fetch_osm_parking.py', claim: 'Repository fetcher includes a Miami bbox for OSM parking candidates.' }],
  }),
  sourceEntry({
    id: 'geofabrik-florida-osm-pbf',
    cityId: 'miami',
    city: 'Miami',
    state: 'FL',
    sourceName: 'Geofabrik Florida OSM PBF',
    sourceType: 'openstreetmap_extract',
    portalType: 'pbf',
    sourceUrl: 'https://download.geofabrik.de/north-america/us/florida.html',
    parkingLayers: ['statewide_osm_baseline', 'garages_lots', 'parking_entrances'],
    recommendedConnector: 'osm2pgsql_external_cli',
    legalRisk: 'low_odbl_attribution_required',
    confidence: 0.82,
    ingestionStatus: 'ready_for_import_design',
    parserSpecRequired: false,
    lastObservedUpdate: '2026-06-11_researched',
    evidence: [{ url: 'https://download.geofabrik.de/north-america/us/florida.html', claim: 'Production-scale OSM extract source for Florida; clip to Miami after import.' }],
  }),
  sourceEntry({
    id: 'overture-maps-places-transportation',
    cityId: 'miami',
    city: 'Miami',
    state: 'FL',
    sourceName: 'Overture Maps Places And Transportation',
    sourceType: 'open_geodata',
    portalType: 'parquet',
    sourceUrl: 'https://overturemaps.org/download/',
    parkingLayers: ['poi_baseline', 'parking_category_places', 'dedupe_enrichment'],
    recommendedConnector: 'overture_parquet_import',
    legalRisk: 'low_verify_overture_license',
    confidence: 0.74,
    ingestionStatus: 'research_only',
    parserSpecRequired: false,
    lastObservedUpdate: '2026-06-11_researched',
    evidence: [{ url: 'https://overturemaps.org/download/', claim: 'Open geodata candidate for nationwide POI/facility enrichment and dedupe against OSM/operator data.' }],
  }),
  sourceEntry({
    id: 'nyc-parking-meters-locations-status',
    cityId: 'nyc',
    city: 'New York City',
    state: 'NY',
    sourceName: 'NYC Parking Meters Locations and Status',
    sourceType: 'city_open_data',
    portalType: 'socrata',
    sourceUrl: 'https://data.cityofnewyork.us/Transportation/Parking-Meters-Locations-and-Status/693u-uax6',
    metadataUrl: 'https://data.cityofnewyork.us/api/views/693u-uax6',
    apiUrl: 'https://data.cityofnewyork.us/resource/693u-uax6.json',
    parkingLayers: ['street_meters', 'meter_status'],
    recommendedConnector: 'socrata',
    legalRisk: 'low_verify_license',
    confidence: 0.95,
    ingestionStatus: 'ready_for_inspection',
    parserSpecRequired: false,
    lastObservedUpdate: '2026-06-08',
    evidence: [
      { url: 'https://data.cityofnewyork.us/Transportation/Parking-Meters-Locations-and-Status/693u-uax6', claim: 'Source landing page discovered in Phase 6 research.' },
      { url: 'https://data.cityofnewyork.us/resource/693u-uax6.json', claim: 'Machine-readable API/query endpoint.' },
    ],
  }),
  sourceEntry({
    id: 'nyc-parking-regulation-locations-signs',
    cityId: 'nyc',
    city: 'New York City',
    state: 'NY',
    sourceName: 'NYC Parking Regulation Locations and Signs',
    sourceType: 'city_open_data',
    portalType: 'socrata',
    sourceUrl: 'https://data.cityofnewyork.us/Transportation/Parking-Regulation-Locations-and-Signs/nfid-uabd',
    metadataUrl: 'https://data.cityofnewyork.us/api/views/nfid-uabd',
    apiUrl: 'https://data.cityofnewyork.us/resource/nfid-uabd.json',
    parkingLayers: ['curb_rules', 'signs'],
    recommendedConnector: 'socrata_plus_rule_parser',
    legalRisk: 'low_verify_license',
    confidence: 0.95,
    ingestionStatus: 'ready_for_inspection',
    parserSpecRequired: true,
    lastObservedUpdate: '2026-06-08',
    evidence: [
      { url: 'https://data.cityofnewyork.us/Transportation/Parking-Regulation-Locations-and-Signs/nfid-uabd', claim: 'Source landing page discovered in Phase 6 research.' },
      { url: 'https://data.cityofnewyork.us/resource/nfid-uabd.json', claim: 'Machine-readable API/query endpoint.' },
    ],
  }),
  sourceEntry({
    id: 'sf-datasf-parking-meters',
    cityId: 'sf',
    city: 'San Francisco',
    state: 'CA',
    sourceName: 'DataSF Parking Meters',
    sourceType: 'city_open_data',
    portalType: 'socrata',
    sourceUrl: 'https://data.sfgov.org/Transportation/Parking-Meters/8vzz-qzz9',
    metadataUrl: 'https://data.sfgov.org/api/views/8vzz-qzz9',
    apiUrl: 'https://data.sfgov.org/resource/8vzz-qzz9.json',
    parkingLayers: ['street_meters'],
    recommendedConnector: 'socrata',
    legalRisk: 'low_verify_license',
    confidence: 0.95,
    ingestionStatus: 'ready_for_inspection',
    parserSpecRequired: false,
    lastObservedUpdate: '2026-06-06',
    evidence: [
      { url: 'https://data.sfgov.org/Transportation/Parking-Meters/8vzz-qzz9', claim: 'Source landing page discovered in Phase 6 research.' },
      { url: 'https://data.sfgov.org/resource/8vzz-qzz9.json', claim: 'Machine-readable API/query endpoint.' },
    ],
  }),
  sourceEntry({
    id: 'sf-datasf-meter-policies',
    cityId: 'sf',
    city: 'San Francisco',
    state: 'CA',
    sourceName: 'DataSF Meter Policies',
    sourceType: 'city_open_data',
    portalType: 'socrata',
    sourceUrl: 'https://data.sfgov.org/Transportation/Meter-Policies/qq7v-hds4',
    metadataUrl: 'https://data.sfgov.org/api/views/qq7v-hds4',
    apiUrl: 'https://data.sfgov.org/resource/qq7v-hds4.json',
    parkingLayers: ['street_meter_rules', 'rates'],
    recommendedConnector: 'socrata',
    legalRisk: 'low_verify_license',
    confidence: 0.95,
    ingestionStatus: 'ready_for_inspection',
    parserSpecRequired: false,
    lastObservedUpdate: '2026-06-10',
    evidence: [
      { url: 'https://data.sfgov.org/Transportation/Meter-Policies/qq7v-hds4', claim: 'Source landing page discovered in Phase 6 research.' },
      { url: 'https://data.sfgov.org/resource/qq7v-hds4.json', claim: 'Machine-readable API/query endpoint.' },
    ],
  }),
  sourceEntry({
    id: 'seattle-paid-parking-occupancy',
    cityId: 'seattle',
    city: 'Seattle',
    state: 'WA',
    sourceName: 'Seattle Paid Parking Occupancy Last 30 Days',
    sourceType: 'city_open_data',
    portalType: 'socrata',
    sourceUrl: 'https://data.seattle.gov/Transportation/Paid-Parking-Occupancy-Last-30-Days-/rke9-rsvs',
    metadataUrl: 'https://data.seattle.gov/api/views/rke9-rsvs',
    apiUrl: 'https://data.seattle.gov/resource/rke9-rsvs.json',
    parkingLayers: ['occupancy', 'blockface_reference', 'rates'],
    recommendedConnector: 'socrata',
    legalRisk: 'low_verify_license',
    confidence: 0.9,
    ingestionStatus: 'ready_for_inspection',
    parserSpecRequired: false,
    lastObservedUpdate: '2026-06-10',
    evidence: [
      { url: 'https://data.seattle.gov/Transportation/Paid-Parking-Occupancy-Last-30-Days-/rke9-rsvs', claim: 'Source landing page discovered in Phase 6 research.' },
      { url: 'https://data.seattle.gov/resource/rke9-rsvs.json', claim: 'Machine-readable API/query endpoint.' },
    ],
  }),
  sourceEntry({
    id: 'seattle-blockface-featureserver',
    cityId: 'seattle',
    city: 'Seattle',
    state: 'WA',
    sourceName: 'Seattle Blockface FeatureServer',
    sourceType: 'city_gis',
    portalType: 'arcgis_rest',
    sourceUrl: 'https://services.arcgis.com/ZOyb2t4B0UYuYNYH/ArcGIS/rest/services/Blockface/FeatureServer',
    metadataUrl: 'https://data-seattlecitygis.opendata.arcgis.com/datasets/b35fb25c8c93425980705474b5e82815_1/about',
    apiUrl: 'https://services.arcgis.com/ZOyb2t4B0UYuYNYH/ArcGIS/rest/services/Blockface/FeatureServer/1/query?where=1%3D1&outFields=*&f=json',
    parkingLayers: ['curb_geometry', 'blockface'],
    recommendedConnector: 'arcgis_rest',
    legalRisk: 'low_verify_license',
    confidence: 0.82,
    ingestionStatus: 'research_only',
    parserSpecRequired: false,
    lastObservedUpdate: 'verify_arcgis_metadata',
    evidence: [
      { url: 'https://services.arcgis.com/ZOyb2t4B0UYuYNYH/ArcGIS/rest/services/Blockface/FeatureServer', claim: 'Source landing page discovered in Phase 6 research.' },
      { url: 'https://services.arcgis.com/ZOyb2t4B0UYuYNYH/ArcGIS/rest/services/Blockface/FeatureServer/1/query?where=1%3D1&outFields=*&f=json', claim: 'Machine-readable API/query endpoint.' },
    ],
  }),
  sourceEntry({
    id: 'national-abm-parking',
    cityId: 'national-operators',
    city: 'National Operators',
    state: 'US',
    sourceName: 'ABM Parking',
    sourceType: 'operator_public_site',
    portalType: 'national_operator',
    sourceUrl: 'https://abmparking.com',
    parkingLayers: ['garages_lots', 'monthly', 'operator_inventory', 'rates', 'booking_urls', 'possible_valet'],
    recommendedConnector: 'public_web_parser_then_partner',
    legalRisk: 'medium_terms_review',
    confidence: 0.72,
    ingestionStatus: 'research_only',
    parserSpecRequired: true,
    evidence: [{ url: 'https://abmparking.com', claim: 'ABM describes more than 2,000 parking locations in more than 230 cities and direct booking/rates on its public site.' }],
  }),
  sourceEntry({
    id: 'national-metropolis',
    cityId: 'national-operators',
    city: 'National Operators',
    state: 'US',
    sourceName: 'Metropolis',
    sourceType: 'operator_public_site',
    portalType: 'national_operator',
    sourceUrl: 'https://www.metropolis.io/parking',
    parkingLayers: ['garages_lots', 'operator_inventory', 'availability_signals', 'hospitality', 'events_venues', 'healthcare', 'universities', 'aviation'],
    recommendedConnector: 'partner_or_public_page_research',
    legalRisk: 'medium_high_partner_preferred',
    confidence: 0.7,
    ingestionStatus: 'research_only',
    parserSpecRequired: true,
    evidence: [{ url: 'https://www.metropolis.io/parking', claim: 'Metropolis describes itself as a large US parking operator with thousands of North American locations.' }],
  }),
  sourceEntry({
    id: 'national-sp-plus-parking-com',
    cityId: 'national-operators',
    city: 'National Operators',
    state: 'US',
    sourceName: 'SP Plus / Parking.com',
    sourceType: 'operator_public_site',
    portalType: 'national_operator',
    sourceUrl: 'https://parking.com',
    bookingUrl: 'https://parking.com',
    parkingLayers: ['garages_lots', 'monthly', 'event', 'rates', 'booking_urls', 'operator_inventory'],
    recommendedConnector: 'public_web_parser_or_partner',
    legalRisk: 'medium_terms_review',
    confidence: 0.78,
    ingestionStatus: 'research_only',
    parserSpecRequired: true,
    evidence: [{ url: 'https://parking.com', claim: 'Parking.com exposes city and facility-style pages for daily and monthly parking.' }],
  }),
  sourceEntry({
    id: 'national-airportparking-com',
    cityId: 'national-operators',
    city: 'National Operators',
    state: 'US',
    sourceName: 'AirportParking.com',
    sourceType: 'operator_public_site',
    portalType: 'national_operator',
    sourceUrl: 'https://airportparking.com',
    bookingUrl: 'https://airportparking.com',
    parkingLayers: ['airport', 'off_airport_lots', 'rates', 'booking_urls', 'shuttle_frequency', 'reviews'],
    recommendedConnector: 'public_web_parser_or_partner',
    legalRisk: 'medium_terms_review',
    confidence: 0.72,
    ingestionStatus: 'research_only',
    parserSpecRequired: true,
    evidence: [{ url: 'https://airportparking.com', claim: 'AirportParking.com describes airport parking comparison and reservation coverage across many airports.' }],
  }),
  sourceEntry({
    id: 'national-platinum-parking',
    cityId: 'national-operators',
    city: 'National Operators',
    state: 'US',
    sourceName: 'Platinum Parking',
    sourceType: 'operator_public_site',
    portalType: 'national_operator',
    sourceUrl: 'https://platinumparking.com',
    parkingLayers: ['garages_lots', 'monthly', 'operator_inventory'],
    recommendedConnector: 'public_web_parser_or_partner',
    legalRisk: 'medium_terms_review',
    confidence: 0.68,
    ingestionStatus: 'research_only',
    parserSpecRequired: true,
    evidence: [{ url: 'https://platinumparking.com', claim: 'Platinum Parking describes managed parking across US cities and public monthly parking discovery.' }],
  }),
];

function compareByCityThenSource(a: ParkingSourceCatalogEntry, b: ParkingSourceCatalogEntry) {
  const cityCompare = a.city.localeCompare(b.city, 'en');
  if (cityCompare !== 0) return cityCompare;
  return a.sourceName.localeCompare(b.sourceName, 'en');
}

export function getSourcesSortedByCity() {
  return [...PARKING_SOURCE_CATALOG].sort(compareByCityThenSource);
}

export function getSourcesForCity(cityId: SourceCityId) {
  return getSourcesSortedByCity().filter((source) => source.cityId === cityId);
}

export function getSourceById(id: string) {
  return PARKING_SOURCE_CATALOG.find((source) => source.id === id);
}

export function getSourceByName(sourceName: string) {
  const normalized = sourceName.trim().toLowerCase();
  return PARKING_SOURCE_CATALOG.find((source) => source.sourceName.toLowerCase() === normalized);
}

export function getSourceCityGroups(): ParkingSourceCityGroup[] {
  const groups = new Map<SourceCityId, ParkingSourceCityGroup>();

  for (const source of getSourcesSortedByCity()) {
    const existing = groups.get(source.cityId);
    if (existing) {
      existing.sources.push(source);
      continue;
    }

    groups.set(source.cityId, {
      cityId: source.cityId,
      city: source.city,
      state: source.state,
      sources: [source],
    });
  }

  return [...groups.values()].sort((a, b) => a.city.localeCompare(b.city, 'en'));
}

export const PARKING_SOURCE_CITY_GROUPS = getSourceCityGroups();

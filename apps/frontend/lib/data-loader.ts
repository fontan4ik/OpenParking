/* ═══════════════════════════════════════════════════════════════
   ParkingUSA — GeoJSON Data Loader
   Reads existing GeoJSON files from /data directory.
   This is the file-based fallback before PostGIS is available.
   ═══════════════════════════════════════════════════════════════ */

import { promises as fs } from 'fs';
import path from 'path';
import {
  loadCurbSegmentsFromDb,
  loadFacilitiesFromDb,
  loadZonesFromDb,
} from '@/lib/db-loader';
import {
  deriveEnrichmentStatus,
  normalizeExistenceStatus,
  derivePriceStatus,
  deriveRuleStatus,
  needsEnrichment,
  safeUrl,
  isKnownPriceStatus,
  type EnrichmentStatus,
  type PriceStatus,
  type RuleStatus,
} from '@/lib/data-quality';
import {
  alignCurbLineToNearestRoad,
  areasFromCollection,
  roadLinesFromCollection,
  withCurbGeometryQuality,
  type CurbGeometryQualityRefs,
} from '@/lib/parking-geometry-quality';

export interface GeoJSONCollection {
  type: 'FeatureCollection';
  metadata?: Record<string, unknown>;
  features: GeoJSONFeature[];
}

export interface GeoJSONFeature {
  type: 'Feature';
  geometry: {
    type: string;
    coordinates: unknown;
  };
  properties: Record<string, unknown>;
}

const DATA_DIR_CANDIDATES = [
  path.join(process.cwd(), 'data'),
  path.resolve(process.cwd(), '..', '..', 'data'),
];

const cache = new Map<string, { data: GeoJSONCollection; loadedAt: number }>();
const CACHE_TTL = 60_000; // 1 minute
export const DEFAULT_CITY_ID = 'miami';

type CityDataStatus = 'ready' | 'research_fixture' | 'research_only' | 'unsupported';

type CityFallbackConfig = {
  dbCities: string[];
  facilities?: string | string[];
  segments?: string;
  streetSpaces?: string;
  zones?: string;
  coverage?: string | string[];
  geometryReference?: string;
  dataStatus: CityDataStatus;
  supportMessage: string;
};

const CITY_FALLBACKS: Record<string, CityFallbackConfig> = {
  miami: {
    dbCities: ['Miami', 'Miami-Dade'],
    facilities: [
      'miami_parking_facilities.geojson',
      'miami_beach_parking_wpgmza.geojson',
      'miami_beach_parking_arcgis_facilities.geojson',
    ],
    streetSpaces: 'miami_beach_parking_arcgis_spaces.geojson',
    zones: 'miami_beach_parking_arcgis_lots_zones.geojson',
    coverage: 'miami_parking_osm.geojson',
    geometryReference: 'research/fetches/miami-osm-roads-buildings-cache.geojson',
    dataStatus: 'ready',
    supportMessage: 'Miami has imported/local fallback coverage from official Miami/Miami Beach sources plus OSM baseline data.',
  },
  sf: {
    dbCities: ['San Francisco'],
    facilities: 'sf_parking_datasf.geojson',
    segments: 'sf_parking_curb_segments.geojson',
    zones: 'sf_parking_zones_osm.geojson',
    coverage: 'sf_parking_osm.geojson',
    dataStatus: 'ready',
    supportMessage: 'San Francisco has benchmark DataSF meter fixtures plus OSM fallback zones.',
  },
  nyc: {
    dbCities: ['New York City', 'New York'],
    facilities: 'nyc_garage_tariff_evidence.geojson',
    dataStatus: 'research_fixture',
    supportMessage:
      'NYC currently exposes a narrow garage/tariff evidence fixture for review; citywide NYC coverage is not imported yet.',
  },
  la: {
    dbCities: ['Los Angeles'],
    dataStatus: 'research_only',
    supportMessage: 'Los Angeles is research-only in this build: sources are cataloged, but no local parking layer is imported yet.',
  },
  seattle: {
    dbCities: ['Seattle'],
    dataStatus: 'research_only',
    supportMessage: 'Seattle is research-only in this build: sources are cataloged, but no local parking layer is imported yet.',
  },
  chicago: {
    dbCities: ['Chicago'],
    dataStatus: 'research_only',
    supportMessage: 'Chicago is research-only in this build: sources are cataloged, but no local parking layer is imported yet.',
  },
};

function normalizeCityId(cityId = DEFAULT_CITY_ID) {
  const normalized = String(cityId || DEFAULT_CITY_ID).trim().toLowerCase();
  const compact = normalized.replace(/[_\s]+/g, '-');
  const aliases: Record<string, string> = {
    'san-francisco': 'sf',
    sanfrancisco: 'sf',
    'new-york': 'nyc',
    'new-york-city': 'nyc',
    'los-angeles': 'la',
  };
  return aliases[compact] || aliases[normalized] || normalized || DEFAULT_CITY_ID;
}

function cityFallback(cityId = DEFAULT_CITY_ID): CityFallbackConfig & { cityId: string } {
  const normalized = normalizeCityId(cityId);
  const fallback = CITY_FALLBACKS[normalized];
  if (fallback) return { ...fallback, cityId: normalized };

  return {
    cityId: normalized,
    dbCities: [],
    dataStatus: 'unsupported',
    supportMessage: `City "${normalized}" is not configured in ParkingUSA yet; no Miami fallback data is reused for this request.`,
  };
}

export function cityDataMetadata(cityId = DEFAULT_CITY_ID): Record<string, unknown> {
  const fallback = cityFallback(cityId);
  return {
    cityId: fallback.cityId,
    db_city_scope: fallback.dbCities,
    data_status: fallback.dataStatus,
    supported: fallback.dataStatus !== 'unsupported',
    research_only: fallback.dataStatus === 'research_only' || fallback.dataStatus === 'research_fixture',
    support_message: fallback.supportMessage,
  };
}

export function cityDbScope(cityId = DEFAULT_CITY_ID) {
  return [...cityFallback(cityId).dbCities];
}

function loadFacilitiesFromConfiguredDb(fallback: CityFallbackConfig): Promise<GeoJSONCollection | null> {
  return fallback.dbCities.length > 0 ? loadFacilitiesFromDb(fallback.dbCities) : Promise.resolve(null);
}

function loadCurbSegmentsFromConfiguredDb(fallback: CityFallbackConfig): Promise<GeoJSONCollection | null> {
  return fallback.dbCities.length > 0 ? loadCurbSegmentsFromDb(fallback.dbCities) : Promise.resolve(null);
}

function loadZonesFromConfiguredDb(fallback: CityFallbackConfig): Promise<GeoJSONCollection | null> {
  return fallback.dbCities.length > 0 ? loadZonesFromDb(fallback.dbCities) : Promise.resolve(null);
}

function emptyCollection(metadata: Record<string, unknown> = {}): GeoJSONCollection {
  return { type: 'FeatureCollection', metadata, features: [] };
}

async function loadGeoJSON(filename: string): Promise<GeoJSONCollection> {
  const now = Date.now();
  const cached = cache.get(filename);
  if (cached && now - cached.loadedAt < CACHE_TTL) {
    return cached.data;
  }

  for (const dataDir of DATA_DIR_CANDIDATES) {
    const filePath = path.join(dataDir, filename);
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(raw) as GeoJSONCollection;
      cache.set(filename, { data, loadedAt: now });
      return data;
    } catch {
      // Try the next candidate. The frontend may run from repo root or apps/frontend.
    }
  }

  return emptyCollection({ missing_file: filename });
}

async function loadGeoJSONFiles(filenames: string | string[] | undefined): Promise<GeoJSONCollection> {
  if (!filenames) return emptyCollection();
  const files = Array.isArray(filenames) ? filenames : [filenames];
  const collections = await Promise.all(files.map((file) => loadGeoJSON(file)));
  return {
    type: 'FeatureCollection',
    metadata: {
      sources: files,
      count: collections.reduce((sum, collection) => sum + collection.features.length, 0),
    },
    features: collections.flatMap((collection) => collection.features),
  };
}

function withFallbackMetadata(
  collection: GeoJSONCollection,
  metadata: Record<string, unknown>
): GeoJSONCollection {
  return {
    type: 'FeatureCollection',
    metadata: {
      ...(collection.metadata ?? {}),
      ...metadata,
      count: collection.features.length,
    },
    features: collection.features,
  };
}

function featureKey(feature: GeoJSONFeature) {
  const sourceId = feature.properties?.source_id;
  if (typeof sourceId === 'string' && sourceId) {
    return `${geometryType(feature) ?? 'Geometry'}:${sourceId}`;
  }
  return `${geometryType(feature) ?? 'Geometry'}:${JSON.stringify(feature.geometry)}`;
}

function mergeCollections(collections: GeoJSONCollection[], metadata: Record<string, unknown> = {}): GeoJSONCollection {
  const seen = new Set<string>();
  const features = collections.flatMap((collection) => collection.features).filter((feature) => {
    const key = featureKey(feature);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    type: 'FeatureCollection',
    metadata: {
      ...metadata,
      sources: collections
        .map((collection) => collection.metadata?.sources ?? collection.metadata?.source ?? collection.metadata?.missing_file)
        .filter(Boolean),
      count: features.length,
    },
    features,
  };
}

function geometryType(feature: GeoJSONFeature) {
  return feature.geometry?.type;
}

const GRANULAR_PRICE_STATUSES = new Set<PriceStatus>([
  'known_priced',
  'known_free',
  'known_unpriced',
  'paid_unknown',
  'variable',
  'stale',
  'not_applicable',
  'unknown',
]);

const RULE_STATUSES = new Set<RuleStatus>([
  'known',
  'partial',
  'conflict',
  'stale',
  'not_applicable',
  'unknown',
]);

const ENRICHMENT_STATUSES = new Set<EnrichmentStatus>([
  'complete',
  'needs_price',
  'needs_rules',
  'needs_payment_link',
  'needs_source_url',
  'needs_review',
  'stale',
  'conflict',
]);

const MIAMI_BEACH_PAYMENT_PROVIDER = 'ParkMobile / PayByPhone';
const MIAMI_BEACH_PAYMENT_APP_URL = 'https://www2.paybyphone.com/park-in-miami-beach';
const MIAMI_BEACH_PAYMENT_NOTE =
  'Official Miami Beach source lists ParkMobile zones and PayByPhone/ParkMobile app support; ParkingUSA does not infer a per-record checkout URL.';
const MIAMI_BEACH_FIELD_EVIDENCE_SOURCE_ID = 'dev-47:field-feedback:south-beach:valet-dropoff-no-ordinary-parking';
const MIAMI_BEACH_FIELD_PAYMENT_ZONE_ID = '40208';
const MIAMI_BEACH_GENERATED_CURB_OFFER_CONFIDENCE = 0.55;
const MIAMI_BEACH_REGULATORY_ZONE_OFFER_CONFIDENCE = 0.35;
const MIAMI_BEACH_PAYMENT_EQUIPMENT_OFFER_CONFIDENCE = 0.5;
const MIAMI_BEACH_MAX_GENERATED_CURB_ROW_LENGTH_METERS = 150;

const MIAMI_BEACH_RESIDENTIAL_ZONE_NAMES: Record<number, string> = {
  0: 'Unknown',
  1: 'Zone 1 South Pointe',
  2: 'Zone-2',
  3: 'Zone-3',
  4: 'Zone-4',
  5: 'Zone-5',
  6: 'Zone-6',
  7: 'Zone-7',
  8: 'Zone-8',
  9: 'Zone-9',
  10: 'Zone-10',
  11: 'Zone-11',
  12: 'Zone-12',
  13: 'Zone-13',
  14: 'Zone-14',
  15: 'Zone-15',
  16: 'Zone-16',
  17: 'Zone-17',
  18: 'Zone-19',
  19: 'Zone-20',
  20: 'Zone-21',
  21: 'Zone-22',
  22: 'Zone-23',
  23: 'Zone 1A Ocean Drive',
  24: 'Zone 2 & 3',
  25: 'Other',
};

const MIAMI_BEACH_RESIDENTIAL_ZONE_TYPES: Record<number, string> = {
  0: 'Unknown',
  1: 'Restricted Residential Zone',
  2: 'Metered Residential Zone',
  3: 'No Street Parking Available',
  4: 'Off-Street Residential Parking',
  5: '2hr Parking / RPP Permit Exempt',
  6: '1hr Parking / RPP Permit Exempt',
  7: '3hr Parking 9am-10pm / RPP 10pm-9am',
  8: 'Other',
  9: '3hr Parking / RPP Permit Exempt',
};

const MIAMI_BEACH_RESTRICTED_TIMES: Record<number, string> = {
  1: '6pm-7am Mon-Fri & 24hrs Sat-Sun/Holidays',
  2: '24 hrs Mon-Sun',
  3: '6pm-6am Mon-Fri & 24hrs Sat-Sun/Holidays',
  4: '1st Come 1st Served',
  5: '10pm-9am Mon-Sun 24hrs',
  6: 'Other',
  7: '11pm-6am Mon-Sun',
};

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function numberValue(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstNumberValue(...values: unknown[]) {
  for (const value of values) {
    const parsed = numberValue(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function cappedConfidence(value: number | null, cap: number) {
  return Math.min(value ?? cap, cap);
}

function safeUrlFromProperties(properties: Record<string, unknown>, snakeKey: string, camelKey: string) {
  return safeUrl(stringValue(properties[snakeKey]) || stringValue(properties[camelKey]));
}

function rawPropertiesObject(properties: Record<string, unknown>) {
  const raw = properties.raw_properties;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

function withMiamiBeachResidentialZoneSemantics(properties: Record<string, unknown>) {
  const sourceId = stringValue(properties.source_id);
  const sourceName = stringValue(properties.source_name || properties.last_verified_source);
  const isMiamiBeachArcgisZone =
    sourceId.startsWith('miami-beach:arcgis:zones:') ||
    (sourceName.includes('Miami Beach Parking GIS') && properties.facility_type === 'parking_zone');

  if (!isMiamiBeachArcgisZone) return properties;

  const raw = rawPropertiesObject(properties);
  const zoneCode = numberValue(raw.ZONE_ ?? properties.zone_code);
  const zoneTypeCode = numberValue(raw.ZONE_TYPE ?? properties.zone_type_code);
  const restrictedTimeCode = numberValue(raw.RESTRICTED_RES_TIME ?? properties.restricted_res_time_code);
  const zoneName = zoneCode === null ? '' : MIAMI_BEACH_RESIDENTIAL_ZONE_NAMES[zoneCode] ?? `Zone ${zoneCode}`;
  const zoneType = zoneTypeCode === null ? '' : MIAMI_BEACH_RESIDENTIAL_ZONE_TYPES[zoneTypeCode] ?? `Zone type ${zoneTypeCode}`;
  const restrictedTime = restrictedTimeCode === null ? '' : MIAMI_BEACH_RESTRICTED_TIMES[restrictedTimeCode] ?? `Restricted time ${restrictedTimeCode}`;
  const restrictions = [zoneType, restrictedTime].filter(Boolean).join('; ');

  return {
    ...properties,
    name: zoneName ? `Miami Beach Residential ${zoneName}` : properties.name,
    facility_type: properties.display_geometry_role === 'curb_line' ? 'curb_segment' : 'residential_parking_zone',
    source_zone_type: 'residential_parking_zone',
    access: 'regulated_residential_zone',
    fee: 'not_applicable',
    charge: '',
    price_status: 'not_applicable',
    rule_status: 'partial',
    enrichment_status: 'needs_rules',
    zone_code: zoneCode,
    zone_name: zoneName,
    zone_type_code: zoneTypeCode,
    zone_type: zoneType,
    restricted_res_time_code: restrictedTimeCode,
    restricted_res_time: restrictedTime,
    restrictions,
  };
}

function withPaymentProviderEvidence(properties: Record<string, unknown>) {
  const parkmobileZone = stringValue(properties.parkmobile_zone || properties.ParkMobile).trim();
  const city = stringValue(properties.city).toLowerCase();
  const sourceName = stringValue(properties.source_name || properties.last_verified_source).toLowerCase();
  const isMiamiBeach = city === 'miami beach' || sourceName.includes('miami beach');

  if (!parkmobileZone || !isMiamiBeach) return properties;

  return {
    ...properties,
    parkmobile_zone: parkmobileZone,
    payment_provider: stringValue(properties.payment_provider) || MIAMI_BEACH_PAYMENT_PROVIDER,
    payment_app_url: safeUrl(stringValue(properties.payment_app_url)) || MIAMI_BEACH_PAYMENT_APP_URL,
    payment_note: stringValue(properties.payment_note) || MIAMI_BEACH_PAYMENT_NOTE,
  };
}

function withMiamiBeachOfferConfidenceSemantics(
  properties: Record<string, unknown>,
  layer: 'facility' | 'curb_segment' | 'parking_zone'
) {
  const sourceId = stringValue(properties.source_id).toLowerCase();
  const sourceName = stringValue(properties.source_name || properties.last_verified_source).toLowerCase();
  const raw = rawPropertiesObject(properties);
  const sourceConfidence = firstNumberValue(
    properties.source_confidence,
    properties.sourceConfidence,
    raw.source_confidence,
    raw.sourceConfidence,
    properties.confidence,
  );
  const currentOfferConfidence = firstNumberValue(
    properties.offer_confidence,
    properties.offerConfidence,
    properties.display_confidence,
    properties.displayConfidence,
    sourceConfidence,
  );
  const isMiamiBeachArcgis = sourceName.includes('miami beach parking gis') || sourceId.startsWith('miami-beach:arcgis:');
  if (!isMiamiBeachArcgis && !sourceId.startsWith('parking-space-row:')) {
    const displayConfidence = firstNumberValue(properties.display_confidence, properties.displayConfidence, currentOfferConfidence);
    return {
      ...properties,
      source_confidence: sourceConfidence,
      offer_confidence: currentOfferConfidence,
      display_confidence: displayConfidence,
      confidence: displayConfidence ?? properties.confidence,
    };
  }

  if (sourceId.startsWith('miami-beach:arcgis:zones:') || properties.source_zone_type === 'residential_parking_zone') {
    const displayConfidence = cappedConfidence(currentOfferConfidence, MIAMI_BEACH_REGULATORY_ZONE_OFFER_CONFIDENCE);
    return {
      ...properties,
      source_confidence: sourceConfidence,
      offer_confidence: displayConfidence,
      display_confidence: displayConfidence,
      confidence: displayConfidence,
      ordinary_parking_status: 'not_ordinary_parking_offer',
      availability_semantics: 'regulatory_or_residential_rule_evidence_only',
      confidence_reason:
        'Official Miami Beach layer 7 source confidence is preserved separately; driver-facing offer confidence is capped because this is a regulatory/residential rule zone, not a physical parking offer.',
    };
  }

  if (sourceId.startsWith('parking-space-row:') || sourceId.includes(':spaces:')) {
    const geometryQualityStatus = stringValue(properties.geometry_quality_status);
    if (geometryQualityStatus === 'accepted') {
      const displayConfidence = Math.max(
        0.65,
        cappedConfidence(currentOfferConfidence, 0.72)
      );
      return {
        ...properties,
        source_confidence: sourceConfidence,
        offer_confidence: displayConfidence,
        display_confidence: displayConfidence,
        confidence: displayConfidence,
        ordinary_parking_status: 'ordinary_parking_offer',
        field_conflict_status: 'geometry_qa_passed',
        availability_semantics: 'official_space_evidence_verified_roadside_curb_offer',
        confidence_reason:
          'Official parking-space evidence passed deterministic road-parallel geometry QA; source confidence is still preserved separately from driver-facing offer confidence.',
        enrichment_status: properties.enrichment_status === 'conflict' ? 'conflict' : properties.enrichment_status,
      };
    }

    const displayConfidence = cappedConfidence(currentOfferConfidence, MIAMI_BEACH_GENERATED_CURB_OFFER_CONFIDENCE);
    return {
      ...properties,
      source_confidence: sourceConfidence,
      offer_confidence: displayConfidence,
      display_confidence: displayConfidence,
      confidence: displayConfidence,
      ordinary_parking_status: 'unknown_pending_snap_conflict_check',
      field_conflict_status: stringValue(properties.field_conflict_status) || 'needs_field_review',
      field_evidence_source_id: MIAMI_BEACH_FIELD_EVIDENCE_SOURCE_ID,
      field_payment_zone_location_id: MIAMI_BEACH_FIELD_PAYMENT_ZONE_ID,
      availability_semantics: 'official_space_evidence_not_verified_continuous_curb_offer',
      confidence_reason:
        'Official parking-space point confidence is preserved separately; generated curb rows are capped until road-side snapping and valet/drop-off/no-parking conflict checks pass.',
      enrichment_status: properties.enrichment_status === 'conflict' ? 'conflict' : 'needs_review',
    };
  }

  if (sourceId.startsWith('miami-beach:arcgis:meter:')) {
    const displayConfidence = cappedConfidence(currentOfferConfidence, MIAMI_BEACH_PAYMENT_EQUIPMENT_OFFER_CONFIDENCE);
    return {
      ...properties,
      source_confidence: sourceConfidence,
      offer_confidence: displayConfidence,
      display_confidence: displayConfidence,
      confidence: displayConfidence,
      ordinary_parking_status: 'payment_equipment_evidence_only',
      availability_semantics: 'meter_or_payment_equipment_evidence_not_standalone_stall_offer',
      confidence_reason:
        'Official meter/payment equipment source confidence is preserved separately; offer confidence is capped unless joined to verified space/curb evidence.',
      enrichment_status: properties.enrichment_status === 'conflict' ? 'conflict' : 'needs_review',
    };
  }

  const displayConfidence = firstNumberValue(properties.display_confidence, properties.displayConfidence, currentOfferConfidence);
  return {
    ...properties,
    source_confidence: sourceConfidence,
    offer_confidence: currentOfferConfidence,
    display_confidence: displayConfidence,
    confidence: displayConfidence ?? properties.confidence,
  };
}

function preservedPriceStatus(properties: Record<string, unknown>) {
  const status = properties.price_status;
  return typeof status === 'string' && GRANULAR_PRICE_STATUSES.has(status as PriceStatus)
    ? status
    : derivePriceStatus(properties);
}

function preservedRuleStatus(properties: Record<string, unknown>) {
  const status = properties.rule_status;
  return typeof status === 'string' && RULE_STATUSES.has(status as RuleStatus)
    ? status
    : deriveRuleStatus(properties);
}

function preservedEnrichmentStatus(properties: Record<string, unknown>) {
  const status = properties.enrichment_status;
  return typeof status === 'string' && ENRICHMENT_STATUSES.has(status as EnrichmentStatus)
    ? status
    : deriveEnrichmentStatus(properties);
}

function isPointFeature(feature: GeoJSONFeature) {
  return geometryType(feature) === 'Point' || geometryType(feature) === 'MultiPoint';
}

function isLineFeature(feature: GeoJSONFeature) {
  return geometryType(feature) === 'LineString' || geometryType(feature) === 'MultiLineString';
}

function isPolygonFeature(feature: GeoJSONFeature) {
  return geometryType(feature) === 'Polygon' || geometryType(feature) === 'MultiPolygon';
}

function isParkingSpaceFeature(feature: GeoJSONFeature) {
  const sourceId = stringValue(feature.properties.source_id);
  const name = stringValue(feature.properties.name);
  return sourceId.includes(':spaces:') || name.startsWith('Parking Spaces');
}

function isParkingSpacePolygonFeature(feature: GeoJSONFeature) {
  return isPolygonFeature(feature) && isParkingSpaceFeature(feature);
}

function isMiamiBeachArcgisRoadsideZoneFeature(feature: GeoJSONFeature) {
  const sourceId = stringValue(feature.properties.source_id).toLowerCase();
  const sourceName = stringValue(feature.properties.source_name || feature.properties.last_verified_source).toLowerCase();
  const raw = rawPropertiesObject(feature.properties);
  const hasZoneFields =
    raw.ZONE_ !== undefined ||
    raw.ZONE_TYPE !== undefined ||
    raw.RESTRICTED_RES_TIME !== undefined ||
    feature.properties.zone_code !== undefined ||
    feature.properties.zone_type_code !== undefined;

  return (
    sourceId.startsWith('miami-beach:arcgis:zones:') ||
    (sourceName.includes('miami beach parking gis') && hasZoneFields)
  );
}

function isRegulatoryZoneFeature(feature: GeoJSONFeature) {
  return (
    isMiamiBeachArcgisRoadsideZoneFeature(feature) ||
    feature.properties.facility_type === 'residential_parking_zone' ||
    feature.properties.access === 'regulated_residential_zone' ||
    feature.properties.price_status === 'not_applicable'
  );
}

function isRoadsideRuleZoneFeature(feature: GeoJSONFeature) {
  return (
    isPolygonFeature(feature) &&
    !isParkingSpaceFeature(feature) &&
    (
      isMiamiBeachArcgisRoadsideZoneFeature(feature) ||
      feature.properties.facility_type === 'residential_parking_zone' ||
      feature.properties.access === 'regulated_residential_zone'
    )
  );
}

function isParkingAreaPolygonFeature(feature: GeoJSONFeature) {
  if (!isPolygonFeature(feature) || isParkingSpaceFeature(feature) || isRegulatoryZoneFeature(feature)) return false;

  const sourceId = stringValue(feature.properties.source_id).toLowerCase();
  const facilityType = stringValue(feature.properties.facility_type).toLowerCase();
  const amenity = stringValue(feature.properties.amenity).toLowerCase();
  const parking = stringValue(feature.properties.parking).toLowerCase();
  const name = stringValue(feature.properties.name).toLowerCase();

  return (
    sourceId.includes(':lots:') ||
    sourceId.includes(':lot:') ||
    amenity === 'parking' ||
    parking.length > 0 ||
    ['garage', 'parking_garage', 'surface_lot', 'surface', 'lot', 'parking_lot', 'parking_area'].includes(facilityType) ||
    name.includes('parking lot') ||
    name.includes('garage')
  );
}

function collectionWithoutParkingSpaces(collection: GeoJSONCollection): GeoJSONCollection {
  return {
    ...collection,
    features: collection.features.filter((feature) => !isParkingSpaceFeature(feature)),
  };
}

function collectionWithoutCurbDisplayPolygons(collection: GeoJSONCollection): GeoJSONCollection {
  return {
    ...collection,
    features: collection.features.filter((feature) => !isParkingSpaceFeature(feature) && !isRoadsideRuleZoneFeature(feature)),
  };
}

function parkingSpacesAsCurbs(
  collection: GeoJSONCollection | null,
  parkingAreaCollections: Array<GeoJSONCollection | null | undefined> = []
): GeoJSONCollection {
  if (!collection) return emptyCollection({ source: 'PostGIS/Prisma unavailable' });
  const parkingSpaces = excludeParkingSpacesInsideParkingAreas(
    collection.features.filter(isParkingSpaceFeature),
    [collection, ...parkingAreaCollections]
  );
  const features = deriveParkingSpacePointLines(parkingSpaces)
    .map(curbSegmentWithLineGeometry)
    .filter(isLineFeature)
    .filter((feature) => !isLongGeneratedParkingSpaceRow(feature));

  return withFallbackMetadata(
    {
      ...collection,
      features,
    },
    {
      coverage_role: 'parking_spaces_as_curb_lines',
      source: collection.metadata?.source ?? 'legacy parking-space polygons',
    }
  );
}

function roadsideRuleZonesAsCurbs(collection: GeoJSONCollection | null): GeoJSONCollection {
  if (!collection) return emptyCollection({ source: 'PostGIS/Prisma unavailable' });
  const features = collection.features
    .filter(isRoadsideRuleZoneFeature)
    .map((feature) =>
      curbSegmentWithLineGeometry({
        ...feature,
        properties: {
          ...feature.properties,
          display_geometry_role: 'curb_line',
          source_geometry_type: feature.properties.source_geometry_type ?? feature.geometry.type,
          geometry_provenance:
            feature.properties.geometry_provenance ??
            'Line derived from roadside parking-rule zone polygon for curb display.',
        },
      })
    )
    .filter(isLineFeature);

  return withFallbackMetadata(
    {
      ...collection,
      features,
    },
    {
      coverage_role: 'roadside_rule_zones_as_curb_lines',
      source: collection.metadata?.source ?? 'roadside parking-rule zones',
    }
  );
}

function position(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const [lng, lat] = value;
  return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
}

function ringPositions(value: unknown): [number, number][] {
  if (!Array.isArray(value)) return [];
  const positions = value.map(position).filter((item): item is [number, number] => item !== null);
  if (positions.length < 2) return [];
  const first = positions[0];
  const last = positions[positions.length - 1];
  return first[0] === last[0] && first[1] === last[1] ? positions.slice(0, -1) : positions;
}

type ParkingAreaPolygon = {
  bbox: [number, number, number, number];
  rings: [number, number][][];
};

function bboxForRing(ring: [number, number][]): [number, number, number, number] {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  for (const [lng, lat] of ring) {
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }

  return [minLng, minLat, maxLng, maxLat];
}

function polygonFeatureToParkingAreas(feature: GeoJSONFeature): ParkingAreaPolygon[] {
  if (!isParkingAreaPolygonFeature(feature) || !Array.isArray(feature.geometry?.coordinates)) return [];

  const polygons = feature.geometry.type === 'Polygon'
    ? [feature.geometry.coordinates]
    : feature.geometry.type === 'MultiPolygon'
      ? feature.geometry.coordinates
      : [];

  return polygons
    .map((polygon) => {
      if (!Array.isArray(polygon)) return null;
      const rings = polygon.map(ringPositions).filter((ring) => ring.length >= 3);
      if (rings.length === 0) return null;
      return { bbox: bboxForRing(rings[0]), rings };
    })
    .filter((area): area is ParkingAreaPolygon => area !== null);
}

function pointInRing(point: [number, number], ring: [number, number][]) {
  const [lng, lat] = point;
  let inside = false;

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [lngA, latA] = ring[index];
    const [lngB, latB] = ring[previous];
    const crosses = latA > lat !== latB > lat;
    if (crosses) {
      const intersectLng = ((lngB - lngA) * (lat - latA)) / (latB - latA) + lngA;
      if (lng < intersectLng) inside = !inside;
    }
  }

  return inside;
}

function pointInsideParkingArea(point: [number, number], area: ParkingAreaPolygon) {
  const [lng, lat] = point;
  const [minLng, minLat, maxLng, maxLat] = area.bbox;
  if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) return false;
  if (!pointInRing(point, area.rings[0])) return false;
  return !area.rings.slice(1).some((hole) => pointInRing(point, hole));
}

function parkingAreaPolygonsFromCollections(collections: Array<GeoJSONCollection | null | undefined>) {
  return collections.flatMap((collection) =>
    collection?.features.flatMap(polygonFeatureToParkingAreas) ?? []
  );
}

function excludeParkingSpacesInsideParkingAreas(
  features: GeoJSONFeature[],
  parkingAreaCollections: Array<GeoJSONCollection | null | undefined>
) {
  const parkingAreas = parkingAreaPolygonsFromCollections(parkingAreaCollections);
  if (parkingAreas.length === 0) return features;

  return features.filter((feature) => {
    const coordinates = pointCoordinatesFromFeature(feature);
    if (!coordinates) return true;
    return !parkingAreas.some((area) => pointInsideParkingArea(coordinates, area));
  });
}

function longestAxisLineFromRing(ring: [number, number][]): [number, number][] | null {
  if (ring.length < 2) return null;

  let longestStart: [number, number] | null = null;
  let longestEnd: [number, number] | null = null;
  let longestDistanceSquared = 0;

  for (let index = 0; index < ring.length; index += 1) {
    const start = ring[index];
    const end = ring[(index + 1) % ring.length];
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared > longestDistanceSquared) {
      longestDistanceSquared = distanceSquared;
      longestStart = start;
      longestEnd = end;
    }
  }

  if (!longestStart || !longestEnd || longestDistanceSquared === 0) return null;

  const distance = Math.sqrt(longestDistanceSquared);
  const ux = (longestEnd[0] - longestStart[0]) / distance;
  const uy = (longestEnd[1] - longestStart[1]) / distance;
  const px = -uy;
  const py = ux;
  let minAlong = Infinity;
  let maxAlong = -Infinity;
  let minAcross = Infinity;
  let maxAcross = -Infinity;

  for (const coordinate of ring) {
    const along = coordinate[0] * ux + coordinate[1] * uy;
    const across = coordinate[0] * px + coordinate[1] * py;
    minAlong = Math.min(minAlong, along);
    maxAlong = Math.max(maxAlong, along);
    minAcross = Math.min(minAcross, across);
    maxAcross = Math.max(maxAcross, across);
  }

  if (!Number.isFinite(minAlong) || !Number.isFinite(maxAlong) || minAlong === maxAlong) return null;

  const centerAcross = (minAcross + maxAcross) / 2;
  return [
    [minAlong * ux + centerAcross * px, minAlong * uy + centerAcross * py],
    [maxAlong * ux + centerAcross * px, maxAlong * uy + centerAcross * py],
  ];
}

function polygonCoordinatesToLine(coordinates: unknown): [number, number][] | null {
  if (!Array.isArray(coordinates) || coordinates.length === 0) return null;
  return longestAxisLineFromRing(ringPositions(coordinates[0]));
}

function pointCoordinatesFromFeature(feature: GeoJSONFeature): [number, number] | null {
  if (feature.geometry?.type !== 'Point') return null;
  return position(feature.geometry.coordinates);
}

function metersPerLngDegree(lat: number) {
  return Math.max(1, 111_320 * Math.cos((lat * Math.PI) / 180));
}

function haversineMeters(a: [number, number], b: [number, number]) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const radiusMeters = 6_371_000;
  const [lngA, latA] = a;
  const [lngB, latB] = b;
  const deltaLat = toRadians(latB - latA);
  const deltaLng = toRadians(lngB - lngA);
  const sinLat = Math.sin(deltaLat / 2);
  const sinLng = Math.sin(deltaLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRadians(latA)) * Math.cos(toRadians(latB)) * sinLng * sinLng;
  return 2 * radiusMeters * Math.asin(Math.min(1, Math.sqrt(h)));
}

function lineLengthMeters(coordinates: unknown): number {
  if (!Array.isArray(coordinates)) return 0;
  if (coordinates.length > 0 && Array.isArray(coordinates[0]) && typeof coordinates[0][0] === 'number') {
    const positions = coordinates as [number, number][];
    return positions.slice(1).reduce((sum, point, index) => sum + haversineMeters(positions[index], point), 0);
  }
  if (coordinates.length > 0 && Array.isArray(coordinates[0])) {
    return Math.max(...coordinates.map(lineLengthMeters));
  }
  return 0;
}

function isLongGeneratedParkingSpaceRow(feature: GeoJSONFeature) {
  const sourceId = stringValue(feature.properties.source_id);
  return (
    sourceId.startsWith('parking-space-row:') &&
    lineLengthMeters(feature.geometry?.coordinates) > MIAMI_BEACH_MAX_GENERATED_CURB_ROW_LENGTH_METERS
  );
}

function shouldRunGeneratedCurbGeometryQuality(feature: GeoJSONFeature) {
  const sourceId = stringValue(feature.properties.source_id);
  const provenance = stringValue(feature.properties.geometry_provenance).toLowerCase();
  const sourceGeometryType = stringValue(feature.properties.source_geometry_type).toLowerCase();
  return (
    sourceId.startsWith('parking-space-row:') ||
    sourceId.includes(':spaces:') ||
    sourceGeometryType === 'pointcluster' ||
    provenance.includes('derived from grouped official parking-space points') ||
    provenance.includes('derived from an official parking-space point')
  );
}

function applyGeneratedCurbGeometryQuality(features: GeoJSONFeature[], refs: CurbGeometryQualityRefs) {
  return features
    .map((feature) => {
      if (!shouldRunGeneratedCurbGeometryQuality(feature)) return feature;
      return withCurbGeometryQuality(alignCurbLineToNearestRoad(feature, refs), refs);
    })
    .filter((feature): feature is GeoJSONFeature => feature !== null);
}

function pointLineFeature(
  feature: GeoJSONFeature,
  direction: { x: number; y: number },
  totalLengthMeters: number
): GeoJSONFeature {
  const coordinates = pointCoordinatesFromFeature(feature);
  if (!coordinates) return feature;
  const [lng, lat] = coordinates;
  const length = Math.hypot(direction.x, direction.y) || 1;
  const ux = direction.x / length;
  const uy = direction.y / length;
  const halfLength = totalLengthMeters / 2;
  const lngDelta = (ux * halfLength) / metersPerLngDegree(lat);
  const latDelta = (uy * halfLength) / 110_540;

  return {
    ...feature,
    geometry: {
      type: 'LineString',
      coordinates: [
        [lng - lngDelta, lat - latDelta],
        [lng + lngDelta, lat + latDelta],
      ],
    },
    properties: {
      ...feature.properties,
      facility_type: 'curb_segment',
      meter_count: feature.properties.meter_count ?? 1,
      source_confidence: firstNumberValue(feature.properties.source_confidence, feature.properties.sourceConfidence, feature.properties.confidence) ?? 0.9,
      offer_confidence: MIAMI_BEACH_GENERATED_CURB_OFFER_CONFIDENCE,
      display_confidence: MIAMI_BEACH_GENERATED_CURB_OFFER_CONFIDENCE,
      confidence: MIAMI_BEACH_GENERATED_CURB_OFFER_CONFIDENCE,
      ordinary_parking_status: 'unknown_pending_snap_conflict_check',
      field_conflict_status: 'needs_field_review',
      field_evidence_source_id: MIAMI_BEACH_FIELD_EVIDENCE_SOURCE_ID,
      field_payment_zone_location_id: MIAMI_BEACH_FIELD_PAYMENT_ZONE_ID,
      enrichment_status: 'needs_review',
      source_geometry_type: feature.properties.source_geometry_type ?? 'Point',
      geometry_provenance:
        feature.properties.geometry_provenance ??
        'Single-space curb line derived from an official parking-space point where no row grouping was available.',
    },
  };
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

type ProjectedParkingPoint = {
  feature: GeoJSONFeature;
  index: number;
  coordinates: [number, number];
  x: number;
  y: number;
  cellX: number;
  cellY: number;
  angle?: number;
  along?: number;
  across?: number;
};

function rowLineFeature(
  points: ProjectedParkingPoint[],
  angle: number,
  lngScale: number
): GeoJSONFeature {
  const sorted = [...points].sort((a, b) => (a.along ?? 0) - (b.along ?? 0));
  const direction = directionFromAngle(angle);
  const minAlong = sorted[0].along ?? 0;
  const maxAlong = sorted[sorted.length - 1].along ?? minAlong;
  const gaps = sorted.slice(1).map((point, index) => Math.max(0, (point.along ?? 0) - (sorted[index].along ?? 0)));
  const padding = Math.max(2, Math.min(6, gaps.length > 0 ? median(gaps) / 2 : 4));
  const across = median(sorted.map((point) => point.across ?? 0));
  const startAlong = minAlong - padding;
  const endAlong = maxAlong + padding;

  const toLngLat = (along: number): [number, number] => {
    const x = along * direction.x - across * direction.y;
    const y = along * direction.y + across * direction.x;
    return [x / lngScale, y / 110_540];
  };

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const firstSourceId = stringValue(first.feature.properties.source_id);
  const lastSourceId = stringValue(last.feature.properties.source_id);

  return {
    ...first.feature,
    geometry: {
      type: 'LineString',
      coordinates: [toLngLat(startAlong), toLngLat(endAlong)],
    },
    properties: {
      ...first.feature.properties,
      source_id: `parking-space-row:${first.index}-${last.index}`,
      source_space_start_id: firstSourceId,
      source_space_end_id: lastSourceId,
      facility_type: 'curb_segment',
      meter_count: sorted.length,
      source_confidence: firstNumberValue(first.feature.properties.source_confidence, first.feature.properties.sourceConfidence, first.feature.properties.confidence) ?? 0.9,
      offer_confidence: MIAMI_BEACH_GENERATED_CURB_OFFER_CONFIDENCE,
      display_confidence: MIAMI_BEACH_GENERATED_CURB_OFFER_CONFIDENCE,
      confidence: MIAMI_BEACH_GENERATED_CURB_OFFER_CONFIDENCE,
      ordinary_parking_status: 'unknown_pending_snap_conflict_check',
      field_conflict_status: 'needs_field_review',
      field_evidence_source_id: MIAMI_BEACH_FIELD_EVIDENCE_SOURCE_ID,
      field_payment_zone_location_id: MIAMI_BEACH_FIELD_PAYMENT_ZONE_ID,
      enrichment_status: 'needs_review',
      source_geometry_type: 'PointCluster',
      geometry_provenance:
        'Curb line derived from grouped official parking-space points; parking-area interior points are excluded before line generation.',
    },
  };
}

function normalizeOrientationAngle(angle: number) {
  let normalized = angle % Math.PI;
  if (normalized < 0) normalized += Math.PI;
  return normalized;
}

function orientationDistance(a: number, b: number) {
  const diff = Math.abs(normalizeOrientationAngle(a) - normalizeOrientationAngle(b));
  return Math.min(diff, Math.PI - diff);
}

function nearestOrientation(angle: number, orientations: number[]) {
  return orientations.reduce((best, candidate) => {
    return orientationDistance(angle, candidate) < orientationDistance(angle, best) ? candidate : best;
  }, orientations[0] ?? 0);
}

function directionFromAngle(angle: number) {
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

export function deriveParkingSpacePointLines(features: GeoJSONFeature[]): GeoJSONFeature[] {
  const points = features
    .map((feature, index) => {
      const coordinates = pointCoordinatesFromFeature(feature);
      if (!coordinates) return null;
      return { feature, index, coordinates };
    })
    .filter((item): item is { feature: GeoJSONFeature; index: number; coordinates: [number, number] } => item !== null);
  const nonPointFeatures = features.filter((feature) => !pointCoordinatesFromFeature(feature));

  if (points.length === 0) return features;

  const referenceLat = points.reduce((sum, point) => sum + point.coordinates[1], 0) / points.length;
  const lngScale = metersPerLngDegree(referenceLat);
  const cellSizeMeters = 45;
  const maxNeighborDistanceMeters = 38;
  const localOrientationRadiusMeters = 42;
  const localSnapToleranceRadians = (18 * Math.PI) / 180;
  const globalSnapToleranceRadians = (24 * Math.PI) / 180;
  const grid = new Map<string, number[]>();
  const projected: ProjectedParkingPoint[] = points.map((point, pointIndex) => {
    const x = point.coordinates[0] * lngScale;
    const y = point.coordinates[1] * 110_540;
    const cellX = Math.floor(x / cellSizeMeters);
    const cellY = Math.floor(y / cellSizeMeters);
    const key = `${cellX}:${cellY}`;
    const bucket = grid.get(key) ?? [];
    bucket.push(pointIndex);
    grid.set(key, bucket);
    return { ...point, x, y, cellX, cellY };
  });

  function nearbyPoints(point: typeof projected[number], radiusMeters: number) {
    const cellRadius = Math.ceil(radiusMeters / cellSizeMeters);
    const radiusSquared = radiusMeters * radiusMeters;
    const nearby: { point: typeof projected[number]; distanceSquared: number }[] = [];

    for (let dx = -cellRadius; dx <= cellRadius; dx += 1) {
      for (let dy = -cellRadius; dy <= cellRadius; dy += 1) {
        const bucket = grid.get(`${point.cellX + dx}:${point.cellY + dy}`) ?? [];
        for (const candidateIndex of bucket) {
          const candidate = projected[candidateIndex];
          if (candidate.index === point.index) continue;
          const distanceSquared = (candidate.x - point.x) ** 2 + (candidate.y - point.y) ** 2;
          if (distanceSquared > 0 && distanceSquared <= radiusSquared) {
            nearby.push({ point: candidate, distanceSquared });
          }
        }
      }
    }

    return nearby;
  }

  function localOrientation(point: typeof projected[number]) {
    const neighbors = nearbyPoints(point, localOrientationRadiusMeters);
    let sin2 = 0;
    let cos2 = 0;
    let weightTotal = 0;
    let nearestDistanceSquared = maxNeighborDistanceMeters * maxNeighborDistanceMeters;

    for (const neighbor of neighbors) {
      const dx = neighbor.point.x - point.x;
      const dy = neighbor.point.y - point.y;
      const angle = Math.atan2(dy, dx);
      const weight = 1 / Math.max(1, neighbor.distanceSquared);
      sin2 += Math.sin(2 * angle) * weight;
      cos2 += Math.cos(2 * angle) * weight;
      weightTotal += weight;
      nearestDistanceSquared = Math.min(nearestDistanceSquared, neighbor.distanceSquared);
    }

    const strength = weightTotal > 0 ? Math.hypot(sin2, cos2) / weightTotal : 0;
    const angle = weightTotal > 0 ? normalizeOrientationAngle(0.5 * Math.atan2(sin2, cos2)) : null;
    return { angle, strength, nearestDistance: Math.sqrt(nearestDistanceSquared) };
  }

  function dominantGridOrientations() {
    const bins = new Array(36).fill(0);
    for (const point of projected) {
      for (const neighbor of nearbyPoints(point, maxNeighborDistanceMeters)) {
        if (neighbor.point.index <= point.index) continue;
        const angle = normalizeOrientationAngle(Math.atan2(neighbor.point.y - point.y, neighbor.point.x - point.x));
        const bin = Math.round((angle / Math.PI) * bins.length) % bins.length;
        bins[bin] += 1 / Math.max(1, neighbor.distanceSquared);
      }
    }

    const chosen: number[] = [];
    const candidates = bins
      .map((weight, bin) => ({ weight, angle: (bin / bins.length) * Math.PI }))
      .filter((item) => item.weight > 0)
      .sort((a, b) => b.weight - a.weight);

    for (const candidate of candidates) {
      if (chosen.length >= 6) break;
      if (chosen.every((angle) => orientationDistance(angle, candidate.angle) > localSnapToleranceRadians)) {
        chosen.push(candidate.angle);
      }
    }

    return chosen.length > 0 ? chosen : [0, Math.PI / 2];
  }

  const globalOrientations = dominantGridOrientations();
  const rowBandMeters = 8;
  const maxRowGapMeters = 18;
  const groups = new Map<string, ProjectedParkingPoint[]>();
  const singletons: ProjectedParkingPoint[] = [];

  for (const point of projected) {
    const local = localOrientation(point);
    let angle = local.angle ?? globalOrientations[0] ?? 0;
    const snapped = nearestOrientation(angle, globalOrientations);

    if (local.strength < 0.32 || orientationDistance(angle, snapped) <= globalSnapToleranceRadians) {
      angle = snapped;
    }

    const direction = directionFromAngle(angle);
    point.angle = angle;
    point.along = point.x * direction.x + point.y * direction.y;
    point.across = point.x * -direction.y + point.y * direction.x;

    const angleKey = Math.round((normalizeOrientationAngle(angle) * 180) / Math.PI / 5);
    const acrossKey = Math.round(point.across / rowBandMeters);
    const key = `${angleKey}:${acrossKey}`;
    groups.set(key, [...(groups.get(key) ?? []), point]);
  }

  const rowFeatures: GeoJSONFeature[] = [];

  for (const group of groups.values()) {
    const ordered = [...group].sort((a, b) => (a.along ?? 0) - (b.along ?? 0));
    let chunk: ProjectedParkingPoint[] = [];

    for (const point of ordered) {
      const previous = chunk[chunk.length - 1];
      if (previous && (point.along ?? 0) - (previous.along ?? 0) > maxRowGapMeters) {
        if (chunk.length >= 2) {
          rowFeatures.push(rowLineFeature(chunk, chunk[0].angle ?? 0, lngScale));
        } else {
          singletons.push(...chunk);
        }
        chunk = [];
      }
      chunk.push(point);
    }

    if (chunk.length >= 2) {
      rowFeatures.push(rowLineFeature(chunk, chunk[0].angle ?? 0, lngScale));
    } else {
      singletons.push(...chunk);
    }
  }

  const singletonFeatures = singletons.map((point) => {
    const direction = directionFromAngle(point.angle ?? 0);
    return pointLineFeature(point.feature, direction, 10);
  });

  return [...rowFeatures, ...singletonFeatures, ...nonPointFeatures];
}

export function curbSegmentWithLineGeometry(feature: GeoJSONFeature): GeoJSONFeature {
  if (feature.geometry?.type === 'Polygon') {
    const line = polygonCoordinatesToLine(feature.geometry.coordinates);
    if (!line) return feature;
    return {
      ...feature,
      geometry: {
        type: 'LineString',
        coordinates: line,
      },
      properties: {
        ...feature.properties,
        source_geometry_type: feature.properties.source_geometry_type ?? 'Polygon',
        geometry_provenance: feature.properties.geometry_provenance ?? 'Line derived from polygon parking-space geometry for curb display.',
      },
    };
  }

  if (feature.geometry?.type === 'MultiPolygon' && Array.isArray(feature.geometry.coordinates)) {
    const lines = feature.geometry.coordinates
      .map(polygonCoordinatesToLine)
      .filter((line): line is [number, number][] => line !== null);
    if (lines.length === 0) return feature;
    return {
      ...feature,
      geometry: {
        type: 'MultiLineString',
        coordinates: lines,
      },
      properties: {
        ...feature.properties,
        source_geometry_type: feature.properties.source_geometry_type ?? 'MultiPolygon',
        geometry_provenance: feature.properties.geometry_provenance ?? 'Lines derived from multipolygon parking-space geometry for curb display.',
      },
    };
  }

  return feature;
}

export function canonicalFeature(feature: GeoJSONFeature, layer: 'facility' | 'curb_segment' | 'parking_zone'): GeoJSONFeature {
  const sourceName = typeof feature.properties.source_name === 'string'
    ? feature.properties.source_name
    : typeof feature.properties.last_verified_source === 'string'
      ? feature.properties.last_verified_source
      : 'unknown';
  const sourceId = typeof feature.properties.source_id === 'string'
    ? feature.properties.source_id
    : featureKey(feature);
  const normalizedProperties: Record<string, unknown> = withMiamiBeachOfferConfidenceSemantics(withMiamiBeachResidentialZoneSemantics(withPaymentProviderEvidence({
    ...feature.properties,
    source_url: safeUrlFromProperties(feature.properties, 'source_url', 'sourceUrl'),
    api_url: safeUrlFromProperties(feature.properties, 'api_url', 'apiUrl'),
    payment_url: safeUrlFromProperties(feature.properties, 'payment_url', 'paymentUrl'),
    booking_url: safeUrlFromProperties(feature.properties, 'booking_url', 'bookingUrl'),
    evidence_url: safeUrlFromProperties(feature.properties, 'evidence_url', 'evidenceUrl'),
    last_verified_at: feature.properties.last_verified_at ?? feature.properties.lastVerifiedAt,
    existence_status: normalizeExistenceStatus(feature.properties.existence_status),
  })), layer);
  const priceStatus = preservedPriceStatus(normalizedProperties);
  const ruleStatus = preservedRuleStatus(normalizedProperties);
  const enrichmentStatus = preservedEnrichmentStatus({
    ...normalizedProperties,
    price_status: priceStatus,
    rule_status: ruleStatus,
  });

  return {
    ...feature,
    properties: {
      ...normalizedProperties,
      parkingusa_id: `parkingusa:${layer}:${sourceName}:${sourceId}`,
      parkingusa_layer: layer,
      existence_status: normalizedProperties.existence_status,
      price_status: priceStatus,
      rule_status: ruleStatus,
      enrichment_status: enrichmentStatus,
      needs_enrichment: needsEnrichment({
        ...normalizedProperties,
        price_status: priceStatus,
        rule_status: ruleStatus,
        enrichment_status: enrichmentStatus,
      }),
      canonical_source: 'ParkingUSA Parking Index',
    },
  };
}

async function loadCoverageSubset(
  filenames: string | string[] | undefined,
  predicate: (feature: GeoJSONFeature) => boolean,
  role: string
): Promise<GeoJSONCollection> {
  const coverage = await loadGeoJSONFiles(filenames);
  return withFallbackMetadata(
    {
      ...coverage,
      features: coverage.features.filter(predicate),
    },
    {
      coverage_role: role,
      source: 'OSM/coverage baseline fallback',
    }
  );
}

export async function loadFacilities(cityId = DEFAULT_CITY_ID): Promise<GeoJSONCollection> {
  const fallback = cityFallback(cityId);
  const cityMetadata = cityDataMetadata(cityId);
  const [dbFacilities, officialFacilities, coveragePoints] = await Promise.all([
    loadFacilitiesFromConfiguredDb(fallback),
    fallback.facilities ? loadGeoJSONFiles(fallback.facilities) : emptyCollection(cityMetadata),
    loadCoverageSubset(fallback.coverage, isPointFeature, 'candidate_facility_points'),
  ]);

  const merged = mergeCollections([dbFacilities ?? emptyCollection({ source: 'PostGIS/Prisma unavailable' }), officialFacilities, coveragePoints], {
    ...cityMetadata,
    primary_baseline_source: 'OpenStreetMap via Geofabrik/osm2pgsql',
    layer_role: 'facilities_with_coverage_points',
  });

  return {
    ...merged,
    features: merged.features.map((f) => canonicalFeature(f, 'facility')),
  };
}

export async function loadCurbSegments(cityId = DEFAULT_CITY_ID): Promise<GeoJSONCollection> {
  const fallback = cityFallback(cityId);
  const cityMetadata = cityDataMetadata(cityId);
  const [dbSegments, dbZones, officialSegments, officialStreetSpaces, officialZones, coverageLines, coveragePolygons, geometryReference] = await Promise.all([
    loadCurbSegmentsFromConfiguredDb(fallback),
    loadZonesFromConfiguredDb(fallback),
    fallback.segments ? loadGeoJSON(fallback.segments) : emptyCollection(cityMetadata),
    fallback.streetSpaces ? loadGeoJSON(fallback.streetSpaces) : emptyCollection(cityMetadata),
    fallback.zones ? loadGeoJSON(fallback.zones) : emptyCollection(cityMetadata),
    loadCoverageSubset(fallback.coverage, isLineFeature, 'candidate_street_parking_lines'),
    loadCoverageSubset(fallback.coverage, isPolygonFeature, 'candidate_parking_polygons_for_curb_filter'),
    fallback.geometryReference ? loadGeoJSON(fallback.geometryReference) : emptyCollection(cityMetadata),
  ]);
  const parkingAreaCollections = [dbZones, officialZones, coveragePolygons];
  const geometryQualityRefs: CurbGeometryQualityRefs = {
    roads: [
      ...roadLinesFromCollection(coverageLines),
      ...roadLinesFromCollection(geometryReference),
    ],
    parkingAreas: parkingAreaCollections.flatMap((collection) => areasFromCollection(collection)),
    buildings: areasFromCollection(geometryReference),
  };

  const merged = mergeCollections([dbSegments ?? emptyCollection({ source: 'PostGIS/Prisma unavailable' }), parkingSpacesAsCurbs(dbZones, parkingAreaCollections), officialSegments, parkingSpacesAsCurbs(officialStreetSpaces, parkingAreaCollections), coverageLines], {
    ...cityMetadata,
    primary_baseline_source: 'OpenStreetMap via Geofabrik/osm2pgsql',
    layer_role: 'curb_segments_with_coverage_lines',
  });

  return {
    ...merged,
    features: applyGeneratedCurbGeometryQuality(
      merged.features.map((f) => curbSegmentWithLineGeometry(f)),
      geometryQualityRefs
    ).map((f) => canonicalFeature(f, 'curb_segment')),
  };
}

export async function loadZones(cityId = DEFAULT_CITY_ID): Promise<GeoJSONCollection> {
  const fallback = cityFallback(cityId);
  const cityMetadata = cityDataMetadata(cityId);
  const [dbZones, officialZones, coveragePolygons] = await Promise.all([
    loadZonesFromConfiguredDb(fallback),
    fallback.zones ? loadGeoJSON(fallback.zones) : emptyCollection(cityMetadata),
    loadCoverageSubset(fallback.coverage, isPolygonFeature, 'candidate_parking_polygons'),
  ]);

  const merged = mergeCollections([collectionWithoutCurbDisplayPolygons(dbZones ?? emptyCollection({ source: 'PostGIS/Prisma unavailable' })), collectionWithoutCurbDisplayPolygons(officialZones), collectionWithoutParkingSpaces(coveragePolygons)], {
    ...cityMetadata,
    primary_baseline_source: 'OpenStreetMap via Geofabrik/osm2pgsql',
    layer_role: 'zones_with_coverage_polygons',
  });

  return {
    ...merged,
    features: merged.features.map((f) => canonicalFeature(f, 'parking_zone')),
  };
}

export async function loadAllLayers(cityId = DEFAULT_CITY_ID) {
  const [facilities, segments, zones] = await Promise.all([
    loadFacilities(cityId),
    loadCurbSegments(cityId),
    loadZones(cityId),
  ]);

  return { facilities, segments, zones };
}

export async function loadParkingIndex(cityId = DEFAULT_CITY_ID): Promise<GeoJSONCollection> {
  const { facilities, segments, zones } = await loadAllLayers(cityId);
  return buildParkingIndex(cityId, { facilities, segments, zones });
}

export function buildParkingIndex(
  cityId: string,
  layers: {
    facilities: GeoJSONCollection;
    segments: GeoJSONCollection;
    zones: GeoJSONCollection;
  }
): GeoJSONCollection {
  const { facilities, segments, zones } = layers;
  const features = [
    ...facilities.features.map((feature) => canonicalFeature(feature, 'facility')),
    ...segments.features.map((feature) => canonicalFeature(feature, 'curb_segment')),
    ...zones.features.map((feature) => canonicalFeature(feature, 'parking_zone')),
  ];
  const priceKnownCount = features.filter((feature) => isKnownPriceStatus(feature.properties.price_status)).length;
  const needsEnrichmentCount = features.filter((feature) => feature.properties.needs_enrichment).length;

  return {
    type: 'FeatureCollection',
    metadata: {
      ...cityDataMetadata(cityId),
      source: 'ParkingUSA Parking Index',
      role: 'single canonical parking coverage feed',
      primary_baseline_source: 'OpenStreetMap via Geofabrik/osm2pgsql',
      baseline_scope: cityFallback(cityId).dbCities,
      count: features.length,
      layers: {
        facilities: facilities.features.length,
        curb_segments: segments.features.length,
        parking_zones: zones.features.length,
      },
      price_known_count: priceKnownCount,
      price_unknown_count: features.length - priceKnownCount,
      needs_enrichment_count: needsEnrichmentCount,
      notes:
        'One internal ParkingUSA source for app/API use. External sources provide evidence and enrichment; unknown prices remain visible.',
    },
    features,
  };
}

export function computeStats(
  facilities: GeoJSONCollection,
  segments: GeoJSONCollection,
  zones: GeoJSONCollection,
  cityId = DEFAULT_CITY_ID
) {
  const totalFacilities = facilities.features.length;
  const pricedFacilities = facilities.features.filter((f) => {
    return isKnownPriceStatus(f.properties.price_status);
  }).length;

  const coveragePercent =
    totalFacilities > 0 ? Math.round((pricedFacilities / totalFacilities) * 100) : 0;

  return {
    ...cityDataMetadata(cityId),
    totalFacilities,
    pricedFacilities,
    curbSegments: segments.features.length,
    zones: zones.features.length,
    coveragePercent,
    lastUpdated: (facilities.metadata?.generated_at_unix
      ? new Date((facilities.metadata.generated_at_unix as number) * 1000).toISOString()
      : new Date().toISOString()),
  };
}

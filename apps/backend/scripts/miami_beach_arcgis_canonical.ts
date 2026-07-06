import type { Prisma, PrismaClient } from '@prisma/client';
import type { ConnectorSourceConfig } from './connector_foundation';
import { connectorNotes, safePublicUrl } from './connector_foundation';

export const MIAMI_BEACH_ARCGIS_SOURCE_NAME = 'City of Miami Beach Parking GIS';
export const MIAMI_BEACH_ARCGIS_SOURCE_URL = 'https://gis.miamibeachfl.gov/public/rest/services/mb/Parking/FeatureServer';
export const MIAMI_BEACH_ARCGIS_SOURCE_PAGE = 'https://www.miamibeachfl.gov/city-hall/parking/';

const MIAMI_BEACH_PAYMENT_PROVIDER = 'ParkMobile / PayByPhone';
const MIAMI_BEACH_PAYMENT_APP_URL = 'https://www2.paybyphone.com/park-in-miami-beach';
const MIAMI_BEACH_PAYMENT_NOTE =
  'Official Miami Beach source lists ParkMobile zones and PayByPhone/ParkMobile app support; ParkingUSA does not infer a per-record checkout URL.';
const MIAMI_BEACH_FIELD_EVIDENCE_SOURCE_ID = 'dev-47:field-feedback:south-beach:valet-dropoff-no-ordinary-parking';
const MIAMI_BEACH_FIELD_PAYMENT_ZONE_ID = '40208';
const LOT_SOURCE_CONFIDENCE = 0.92;
const LOT_OFFER_CONFIDENCE = 0.86;
const METER_SOURCE_CONFIDENCE = 0.9;
const METER_OFFER_CONFIDENCE = 0.5;
const REGULATORY_ZONE_SOURCE_CONFIDENCE = 0.9;
const REGULATORY_ZONE_OFFER_CONFIDENCE = 0.35;

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

export type MiamiBeachArcgisLayerKey = 'meters' | 'spaces' | 'lots' | 'zones';

export interface GeoJsonGeometry {
  type: string;
  coordinates?: unknown;
}

export interface ArcgisGeoJsonFeature {
  type: 'Feature';
  geometry: GeoJsonGeometry | null;
  properties?: Record<string, unknown> | null;
  id?: string | number | null;
}

export interface MiamiBeachArcgisLayerInput {
  key: MiamiBeachArcgisLayerKey;
  name: string;
  apiUrl: string;
  features: ArcgisGeoJsonFeature[];
}

export interface MiamiBeachArcgisCanonicalSet {
  facilities: Prisma.ParkingFacilityUncheckedCreateInput[];
  zones: Prisma.ParkingZoneUncheckedCreateInput[];
  observations: Prisma.SourceObservationUncheckedCreateInput[];
  inputFeaturesSeen: number;
  canonicalRowsPlanned: number;
  skipped: {
    nullGeometryZones: number;
    nonCanonicalSpaces: number;
    invalidFacilities: number;
  };
}

export interface CanonicalImportResult {
  mode: 'miami_beach_arcgis_canonical';
  sourceName: string;
  sourceKey: string;
  recordsSeen: number;
  recordsInserted: number;
  recordsUpdated: number;
  recordsSkipped: number;
  recordsErrorCount: number;
  imported: {
    parkingFacilities: number;
    parkingZones: number;
    sourceObservations: number;
  };
  skipped: MiamiBeachArcgisCanonicalSet['skipped'];
}

function text(value: unknown, fallback = '') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function textOrNull(value: unknown) {
  const normalized = text(value);
  return normalized || null;
}

function numberOrNull(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function residentialZoneSemantics(properties: Record<string, unknown>) {
  const zoneCode = numberOrNull(properties.ZONE_);
  const zoneTypeCode = numberOrNull(properties.ZONE_TYPE);
  const restrictedTimeCode = numberOrNull(properties.RESTRICTED_RES_TIME);
  const zoneName = zoneCode === null ? '' : MIAMI_BEACH_RESIDENTIAL_ZONE_NAMES[zoneCode] ?? `Zone ${zoneCode}`;
  const zoneType = zoneTypeCode === null ? '' : MIAMI_BEACH_RESIDENTIAL_ZONE_TYPES[zoneTypeCode] ?? `Zone type ${zoneTypeCode}`;
  const restrictedTime = restrictedTimeCode === null ? '' : MIAMI_BEACH_RESTRICTED_TIMES[restrictedTimeCode] ?? `Restricted time ${restrictedTimeCode}`;
  return {
    zone_code: zoneCode,
    zone_name: zoneName,
    zone_type_code: zoneTypeCode,
    zone_type: zoneType,
    restricted_res_time_code: restrictedTimeCode,
    restricted_res_time: restrictedTime,
    restrictions: [zoneType, restrictedTime].filter(Boolean).join('; '),
  };
}

function dateOrNull(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.valueOf()) ? null : date;
}

function hasUsefulValue(value: unknown) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return Boolean(normalized) && !['n/a', 'na', 'none', 'unknown', 'null', '-'].includes(normalized);
}

function objectId(properties: Record<string, unknown>, feature: ArcgisGeoJsonFeature) {
  return text(properties.OBJECTID ?? feature.id ?? properties.ObjectId ?? properties.objectid, 'unknown');
}

function sourceId(layer: 'meter' | 'lot' | 'lots' | 'zones', id: string) {
  return `miami-beach:arcgis:${layer}:${id}`;
}

function zoneSourceId(layer: 'lots' | 'zones', id: string) {
  return sourceId(layer, id);
}

function firstRingCoordinates(geometry: GeoJsonGeometry | null) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') {
    const coordinates = geometry.coordinates;
    return Array.isArray(coordinates) && Array.isArray(coordinates[0]) ? coordinates[0] : [];
  }
  if (geometry.type === 'MultiPolygon') {
    const coordinates = geometry.coordinates;
    return Array.isArray(coordinates) && Array.isArray(coordinates[0]) && Array.isArray(coordinates[0][0])
      ? coordinates[0][0]
      : [];
  }
  return [];
}

function centroid(geometry: GeoJsonGeometry | null) {
  const ring = firstRingCoordinates(geometry).filter((coordinate): coordinate is [number, number] => {
    return Array.isArray(coordinate) && Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1]);
  });

  if (ring.length === 0) return null;

  const last = ring[ring.length - 1];
  const uniqueRing = ring.length > 1 && ring[0][0] === last[0] && ring[0][1] === last[1]
    ? ring.slice(0, -1)
    : ring;

  if (uniqueRing.length === 0) return null;

  const totals = uniqueRing.reduce(
    (acc, coordinate) => ({ lng: acc.lng + coordinate[0], lat: acc.lat + coordinate[1] }),
    { lng: 0, lat: 0 },
  );

  return [totals.lng / uniqueRing.length, totals.lat / uniqueRing.length] as [number, number];
}

function pointCoordinates(geometry: GeoJsonGeometry | null) {
  if (geometry?.type !== 'Point' || !Array.isArray(geometry.coordinates)) return null;
  const [lng, lat] = geometry.coordinates;
  return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] as [number, number] : null;
}

function facilityType(properties: Record<string, unknown>) {
  const subtype = text(properties.SUBTYPE ?? properties.SubType).toLowerCase();
  if (subtype.includes('garage')) return 'garage';
  return 'surface_lot';
}

function lotPriceStatus(charge: string) {
  return hasUsefulValue(charge) ? 'known_priced' : 'known_unpriced';
}

function enrichmentStatusForPrice(priceStatus: string) {
  return priceStatus === 'known_priced' ? 'needs_payment_link' : 'needs_price';
}

function paymentEvidence(zone: string) {
  return hasUsefulValue(zone)
    ? {
        payment_provider: MIAMI_BEACH_PAYMENT_PROVIDER,
        payment_app_url: MIAMI_BEACH_PAYMENT_APP_URL,
        payment_note: MIAMI_BEACH_PAYMENT_NOTE,
      }
    : {
        payment_provider: '',
        payment_app_url: '',
        payment_note: '',
      };
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function normalizedProperties(properties: Record<string, unknown>, extra: Record<string, unknown>): Record<string, unknown> {
  return {
    ...properties,
    ...extra,
    raw_arcgis_properties: properties,
  };
}

function mapLotFacility(
  source: ConnectorSourceConfig,
  feature: ArcgisGeoJsonFeature,
  apiUrl: string,
  verifiedAt: Date,
): Prisma.ParkingFacilityUncheckedCreateInput | null {
  const properties = feature.properties ?? {};
  const id = objectId(properties, feature);
  const coordinates = centroid(feature.geometry);
  if (!coordinates) return null;

  const charge = text(properties.HOURLY_RATE, 'unknown');
  const priceStatus = lotPriceStatus(charge);
  const parkmobileZone = hasUsefulValue(properties.ParkMobile) ? text(properties.ParkMobile) : '';
  const publicProperties = normalizedProperties(properties, {
    source_id: sourceId('lot', id),
    source_name: source.sourceName,
    name: text(properties.NAME, `Miami Beach parking lot ${id}`),
    facility_type: facilityType(properties),
    street: text(properties.Address),
    city: 'Miami Beach',
    state: 'FL',
    operator: 'City of Miami Beach Parking Department',
    access: 'public',
    fee: charge === 'unknown' ? 'unknown' : 'yes',
    charge,
    event_rate: text(properties.EVENT_RATE),
    maximum_time: text(properties.MAX_TYME),
    capacity: numberOrNull(properties.SPACES),
    parkmobile_zone: parkmobileZone,
    ...paymentEvidence(parkmobileZone),
    ev_charging: text(properties.EV_CS),
    amenities: text(properties.AMENITIES),
    source_confidence: LOT_SOURCE_CONFIDENCE,
    offer_confidence: LOT_OFFER_CONFIDENCE,
    display_confidence: LOT_OFFER_CONFIDENCE,
    confidence: LOT_OFFER_CONFIDENCE,
    source_url: source.sourceUrl ?? MIAMI_BEACH_ARCGIS_SOURCE_PAGE,
    api_url: apiUrl,
    evidence_url: apiUrl,
    data_as_of: null,
    existence_status: 'confirmed',
    price_status: priceStatus,
    rule_status: 'partial',
    enrichment_status: enrichmentStatusForPrice(priceStatus),
    payment_url: '',
    booking_url: '',
    geometry_provenance: 'Centroid derived from official Miami Beach ArcGIS Parking Lots polygon layer; original polygon preserved in ParkingZone canonical rows.',
  });

  return {
    sourceName: source.sourceName,
    sourceId: sourceId('lot', id),
    name: textOrNull(publicProperties.name),
    facilityType: String(publicProperties.facility_type),
    geometryType: 'Point',
    geojson: json({ type: 'Point', coordinates }),
    lat: coordinates[1],
    lng: coordinates[0],
    city: 'Miami Beach',
    state: 'FL',
    operator: textOrNull(publicProperties.operator),
    access: textOrNull(publicProperties.access),
    capacity: publicProperties.capacity ? String(publicProperties.capacity) : null,
    fee: textOrNull(publicProperties.fee),
    charge: textOrNull(publicProperties.charge),
    baseHourlyRate: null,
    openingHours: null,
    street: textOrNull(publicProperties.street),
    blockfaceId: null,
    neighborhood: null,
    meterType: null,
    capColor: null,
    rawProperties: json(publicProperties),
    confidence: LOT_OFFER_CONFIDENCE,
    sourceConfidence: LOT_SOURCE_CONFIDENCE,
    offerConfidence: LOT_OFFER_CONFIDENCE,
    displayConfidence: LOT_OFFER_CONFIDENCE,
    lastVerifiedAt: verifiedAt,
    dataAsOf: null,
    geometryQuality: 'derived_centroid_from_official_polygon',
    sourceUrl: safePublicUrl(String(publicProperties.source_url)),
    apiUrl: safePublicUrl(apiUrl),
    paymentUrl: null,
    bookingUrl: null,
    evidenceUrl: safePublicUrl(apiUrl),
    priceStatus,
    ruleStatus: 'partial',
    enrichmentStatus: enrichmentStatusForPrice(priceStatus),
  };
}

function mapMeterFacility(
  source: ConnectorSourceConfig,
  feature: ArcgisGeoJsonFeature,
  apiUrl: string,
  verifiedAt: Date,
): Prisma.ParkingFacilityUncheckedCreateInput | null {
  const properties = feature.properties ?? {};
  const id = objectId(properties, feature);
  const coordinates = pointCoordinates(feature.geometry);
  if (!coordinates) return null;

  const numberLabel = text(properties.NUMBER ?? properties.METER_ID ?? properties.SPACE_NUMBER, id);
  const zone = text(properties.ZONE ?? properties.ParkMobile ?? properties.PARKMOBILE);
  const parkmobileZone = hasUsefulValue(zone) ? zone : '';
  const status = text(properties.STATUS ?? properties.CONDITION);
  const publicProperties = normalizedProperties(properties, {
    source_id: sourceId('meter', id),
    source_name: source.sourceName,
    name: `Miami Beach meter ${numberLabel}`,
    facility_type: 'street_meter',
    street: text(properties.ADDRESS ?? properties.Address),
    city: 'Miami Beach',
    state: 'FL',
    operator: 'City of Miami Beach Parking Department',
    access: 'public',
    fee: 'yes',
    charge: text(properties.METER_RATES ?? properties.RATE ?? properties.RATES, 'meter rates in source layer'),
    parking_zone: zone,
    parkmobile_zone: parkmobileZone,
    ...paymentEvidence(parkmobileZone),
    meter_number: numberLabel,
    meter_status: status,
    source_confidence: METER_SOURCE_CONFIDENCE,
    offer_confidence: METER_OFFER_CONFIDENCE,
    display_confidence: METER_OFFER_CONFIDENCE,
    confidence: METER_OFFER_CONFIDENCE,
    ordinary_parking_status: 'payment_equipment_evidence_only',
    availability_semantics: 'meter_or_payment_equipment_evidence_not_standalone_stall_offer',
    source_url: source.sourceUrl ?? MIAMI_BEACH_ARCGIS_SOURCE_PAGE,
    api_url: apiUrl,
    evidence_url: apiUrl,
    data_as_of: null,
    existence_status: 'confirmed',
    price_status: 'paid_unknown',
    rule_status: 'partial',
    enrichment_status: 'needs_price',
    payment_url: '',
    booking_url: '',
  });

  return {
    sourceName: source.sourceName,
    sourceId: sourceId('meter', id),
    name: textOrNull(publicProperties.name),
    facilityType: 'street_meter',
    geometryType: 'Point',
    geojson: json({ type: 'Point', coordinates }),
    lat: coordinates[1],
    lng: coordinates[0],
    city: 'Miami Beach',
    state: 'FL',
    operator: textOrNull(publicProperties.operator),
    access: textOrNull(publicProperties.access),
    capacity: null,
    fee: 'yes',
    charge: textOrNull(publicProperties.charge),
    baseHourlyRate: null,
    openingHours: null,
    street: textOrNull(publicProperties.street),
    blockfaceId: null,
    neighborhood: null,
    meterType: null,
    capColor: null,
    rawProperties: json(publicProperties),
    confidence: METER_OFFER_CONFIDENCE,
    sourceConfidence: METER_SOURCE_CONFIDENCE,
    offerConfidence: METER_OFFER_CONFIDENCE,
    displayConfidence: METER_OFFER_CONFIDENCE,
    lastVerifiedAt: verifiedAt,
    dataAsOf: null,
    geometryQuality: 'official_point',
    sourceUrl: safePublicUrl(String(publicProperties.source_url)),
    apiUrl: safePublicUrl(apiUrl),
    paymentUrl: null,
    bookingUrl: null,
    evidenceUrl: safePublicUrl(apiUrl),
    priceStatus: 'paid_unknown',
    ruleStatus: 'partial',
    enrichmentStatus: 'needs_price',
  };
}

type CanonicalZoneLayerInput = MiamiBeachArcgisLayerInput & { key: 'lots' | 'zones' };

function mapZone(
  source: ConnectorSourceConfig,
  layer: CanonicalZoneLayerInput,
  feature: ArcgisGeoJsonFeature,
  verifiedAt: Date,
): Prisma.ParkingZoneUncheckedCreateInput | null {
  if (!feature.geometry) return null;
  const properties = feature.properties ?? {};
  const id = objectId(properties, feature);
  const isLot = layer.key === 'lots';
  const charge = text(properties.HOURLY_RATE, 'unknown');
  const priceStatus = isLot ? lotPriceStatus(charge) : 'not_applicable';
  const rawParkmobileZone = properties.ParkMobile ?? properties.PARKMOBILE ?? properties.ZONE;
  const parkmobileZone = hasUsefulValue(rawParkmobileZone) ? text(rawParkmobileZone) : '';
  const zoneSemantics = isLot ? {} : residentialZoneSemantics(properties);
  const zoneName = 'zone_name' in zoneSemantics ? text(zoneSemantics.zone_name) : '';
  const zoneType = isLot ? facilityType(properties) : 'residential_parking_zone';
  const sourceConfidence = isLot ? LOT_SOURCE_CONFIDENCE : REGULATORY_ZONE_SOURCE_CONFIDENCE;
  const offerConfidence = isLot ? LOT_OFFER_CONFIDENCE : REGULATORY_ZONE_OFFER_CONFIDENCE;
  const publicProperties = normalizedProperties(properties, {
    source_id: zoneSourceId(layer.key, id),
    source_name: source.sourceName,
    name: isLot
      ? text(properties.NAME ?? properties.PARKING_ZONE ?? properties.Zone, `${layer.name} ${id}`)
      : text(zoneName, `${layer.name} ${id}`).replace(/^/, 'Miami Beach Residential '),
    facility_type: zoneType,
    city: 'Miami Beach',
    state: 'FL',
    operator: 'City of Miami Beach Parking Department',
    access: isLot ? 'public' : 'regulated_residential_zone',
    fee: isLot ? (charge === 'unknown' ? text(properties.FEE, 'unknown') : 'yes') : 'not_applicable',
    charge: isLot ? charge : '',
    capacity: numberOrNull(properties.SPACES),
    parkmobile_zone: parkmobileZone,
    ...paymentEvidence(parkmobileZone),
    ...zoneSemantics,
    source_confidence: sourceConfidence,
    offer_confidence: offerConfidence,
    display_confidence: offerConfidence,
    confidence: offerConfidence,
    ordinary_parking_status: isLot ? 'ordinary_public_parking_offer' : 'not_ordinary_parking_offer',
    availability_semantics: isLot ? 'physical_lot_or_garage_offer' : 'regulatory_or_residential_rule_evidence_only',
    field_conflict_status: isLot ? '' : 'not_applicable_regulatory_overlay',
    source_url: source.sourceUrl ?? MIAMI_BEACH_ARCGIS_SOURCE_PAGE,
    api_url: layer.apiUrl,
    evidence_url: layer.apiUrl,
    data_as_of: null,
    existence_status: 'confirmed',
    price_status: priceStatus,
    rule_status: 'partial',
    enrichment_status: isLot ? enrichmentStatusForPrice(priceStatus) : 'needs_rules',
    payment_url: '',
    booking_url: '',
  });

  return {
    sourceName: source.sourceName,
    sourceId: zoneSourceId(layer.key, id),
    name: textOrNull(publicProperties.name),
    city: 'Miami Beach',
    state: 'FL',
    facilityType: textOrNull(publicProperties.facility_type),
    operator: textOrNull(publicProperties.operator),
    access: textOrNull(publicProperties.access),
    fee: textOrNull(publicProperties.fee),
    charge: textOrNull(publicProperties.charge),
    capacity: publicProperties.capacity ? String(publicProperties.capacity) : null,
    openingHours: null,
    website: null,
    geojson: json(feature.geometry),
    rawProperties: json(publicProperties),
    confidence: offerConfidence,
    sourceConfidence,
    offerConfidence,
    displayConfidence: offerConfidence,
    lastVerifiedAt: verifiedAt,
    dataAsOf: null,
    geometryQuality: 'official_polygon',
    sourceUrl: safePublicUrl(String(publicProperties.source_url)),
    apiUrl: safePublicUrl(layer.apiUrl),
    paymentUrl: null,
    bookingUrl: null,
    evidenceUrl: safePublicUrl(layer.apiUrl),
    priceStatus,
    ruleStatus: 'partial',
    enrichmentStatus: isLot ? enrichmentStatusForPrice(priceStatus) : 'needs_rules',
  };
}

function isCanonicalZoneLayer(layer: MiamiBeachArcgisLayerInput): layer is CanonicalZoneLayerInput {
  return layer.key === 'lots' || layer.key === 'zones';
}

export function miamiBeachSouthBeachFieldObservations(
  sourceName = MIAMI_BEACH_ARCGIS_SOURCE_NAME,
  observedAt = new Date(),
): Prisma.SourceObservationUncheckedCreateInput[] {
  const sourceUrl = 'data/research/field-audits/dev-49-south-beach-false-positive-audit.json';
  return [
    {
      sourceName,
      sourceId: MIAMI_BEACH_FIELD_EVIDENCE_SOURCE_ID,
      entityType: 'field_conflict_observation',
      entitySourceId: null,
      observedAt,
      rawProperties: json({
        source_url: sourceUrl,
        data_as_of: '2026-07-03',
        area: 'South Beach / Ocean Drive / Collins / Lincoln / 13th / 16th',
        bboxes_wgs84: {
          south_beach_core: [-80.1375, 25.78, -80.126, 25.7935],
          ocean_drive_13_16: [-80.1325, 25.782, -80.128, 25.7905],
          lincoln_collins: [-80.1355, 25.787, -80.128, 25.7935],
        },
        observed_problem: 'valet-only, drop-off, no ordinary parking, or no clear spaces where generated curb/payment/regulatory layers showed candidates',
        affected_semantics: ['generated_curb_rows', 'regulatory_zone_overlays', 'meter_payment_equipment_points'],
        recommended_status: 'needs_field_review_or_conflict_before_default_public_offer',
      }),
      status: 'conflict_evidence',
      confidence: 0.75,
      notes: 'DEV-49/DEV-47 user field evidence: cap generated curb and regulatory/payment offer confidence until road-side snapping and conflict checks pass.',
    },
    {
      sourceName,
      sourceId: 'dev-47:field-feedback:south-beach:zone-location-id:40208',
      entityType: 'payment_zone_observation',
      entitySourceId: null,
      observedAt,
      rawProperties: json({
        source_url: sourceUrl,
        data_as_of: '2026-07-03',
        payment_provider: MIAMI_BEACH_PAYMENT_PROVIDER,
        zone_location_id: MIAMI_BEACH_FIELD_PAYMENT_ZONE_ID,
        evidence_claim: 'Field photo confirms PayByPhone/ParkMobile ZONE / LOCATION #40208 in the South Beach corridor.',
        availability_semantics: 'payment evidence only; not proof of ordinary public parking availability',
      }),
      status: 'payment_evidence_needs_join',
      confidence: 0.75,
      notes: 'Preserve requested zone/location 40208 as SourceObservation evidence; do not promote to canonical payment_url or ordinary parking offer without provider/location join.',
    },
  ];
}

export function normalizeMiamiBeachArcgisCanonical(
  source: ConnectorSourceConfig,
  layers: MiamiBeachArcgisLayerInput[],
  verifiedAt = new Date(),
): MiamiBeachArcgisCanonicalSet {
  const facilities: Prisma.ParkingFacilityUncheckedCreateInput[] = [];
  const zones: Prisma.ParkingZoneUncheckedCreateInput[] = [];
  let inputFeaturesSeen = 0;
  const skipped = {
    nullGeometryZones: 0,
    nonCanonicalSpaces: 0,
    invalidFacilities: 0,
  };

  for (const layer of layers) {
    inputFeaturesSeen += layer.features.length;

    if (layer.key === 'spaces') {
      skipped.nonCanonicalSpaces += layer.features.length;
      continue;
    }

    for (const feature of layer.features) {
      if (layer.key === 'meters') {
        const mapped = mapMeterFacility(source, feature, layer.apiUrl, verifiedAt);
        if (mapped) facilities.push(mapped);
        else skipped.invalidFacilities += 1;
      }

      if (layer.key === 'lots' && isCanonicalZoneLayer(layer)) {
        const facility = mapLotFacility(source, feature, layer.apiUrl, verifiedAt);
        if (facility) facilities.push(facility);
        else skipped.invalidFacilities += 1;

        const zone = mapZone(source, layer, feature, verifiedAt);
        if (zone) zones.push(zone);
        else skipped.nullGeometryZones += 1;
      }

      if (layer.key === 'zones' && isCanonicalZoneLayer(layer)) {
        const zone = mapZone(source, layer, feature, verifiedAt);
        if (zone) zones.push(zone);
        else skipped.nullGeometryZones += 1;
      }
    }
  }

  return {
    facilities,
    zones,
    observations: miamiBeachSouthBeachFieldObservations(source.sourceName, verifiedAt),
    inputFeaturesSeen,
    canonicalRowsPlanned: facilities.length + zones.length,
    skipped,
  };
}

async function upsertDataSource(prisma: PrismaClient, source: ConnectorSourceConfig) {
  await prisma.dataSource.upsert({
    where: { name: source.sourceName },
    update: {
      sourceKey: source.sourceKey,
      type: source.sourceType,
      homepageUrl: source.sourceUrl,
      sourceUrl: source.sourceUrl,
      metadataUrl: source.metadataUrl,
      apiUrl: source.apiUrl,
      portalType: source.portalType,
      recommendedConnector: `${source.portalType}_canonical_upsert`,
      legalRisk: source.legalRisk,
      paymentUrl: source.paymentUrl ?? null,
      bookingUrl: source.bookingUrl ?? null,
      evidenceUrl: source.metadataUrl,
      notes: connectorNotes({
        ...source,
        idempotentUpsertKey: 'ParkingFacility/ParkingZone(sourceName, sourceId)',
      }),
    },
    create: {
      name: source.sourceName,
      sourceKey: source.sourceKey,
      type: source.sourceType,
      homepageUrl: source.sourceUrl,
      sourceUrl: source.sourceUrl,
      metadataUrl: source.metadataUrl,
      apiUrl: source.apiUrl,
      portalType: source.portalType,
      recommendedConnector: `${source.portalType}_canonical_upsert`,
      legalRisk: source.legalRisk,
      paymentUrl: source.paymentUrl ?? null,
      bookingUrl: source.bookingUrl ?? null,
      evidenceUrl: source.metadataUrl,
      notes: connectorNotes({
        ...source,
        idempotentUpsertKey: 'ParkingFacility/ParkingZone(sourceName, sourceId)',
      }),
    },
  });
}

async function upsertFacilities(prisma: PrismaClient, rows: Prisma.ParkingFacilityUncheckedCreateInput[]) {
  const chunkSize = 500;
  let inserted = 0;
  let updated = 0;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const existing = await Promise.all(
      chunk.map((row) => prisma.parkingFacility.findUnique({
        where: { sourceName_sourceId: { sourceName: row.sourceName, sourceId: row.sourceId } },
        select: { id: true },
      })),
    );

    await prisma.$transaction(
      chunk.map((row) => prisma.parkingFacility.upsert({
        where: { sourceName_sourceId: { sourceName: row.sourceName, sourceId: row.sourceId } },
        update: row,
        create: row,
      })),
    );

    updated += existing.filter(Boolean).length;
    inserted += existing.filter((row) => !row).length;
  }

  return { inserted, updated };
}

async function upsertZones(prisma: PrismaClient, rows: Prisma.ParkingZoneUncheckedCreateInput[]) {
  const chunkSize = 500;
  let inserted = 0;
  let updated = 0;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const existing = await Promise.all(
      chunk.map((row) => prisma.parkingZone.findUnique({
        where: { sourceName_sourceId: { sourceName: row.sourceName, sourceId: row.sourceId } },
        select: { id: true },
      })),
    );

    await prisma.$transaction(
      chunk.map((row) => prisma.parkingZone.upsert({
        where: { sourceName_sourceId: { sourceName: row.sourceName, sourceId: row.sourceId } },
        update: row,
        create: row,
      })),
    );

    updated += existing.filter(Boolean).length;
    inserted += existing.filter((row) => !row).length;
  }

  return { inserted, updated };
}

async function upsertSourceObservations(prisma: PrismaClient, rows: Prisma.SourceObservationUncheckedCreateInput[]) {
  let inserted = 0;
  let updated = 0;
  const existing = await Promise.all(
    rows.map((row) => prisma.sourceObservation.findUnique({
      where: {
        sourceName_sourceId_entityType: {
          sourceName: row.sourceName,
          sourceId: row.sourceId,
          entityType: row.entityType,
        },
      },
      select: { id: true },
    })),
  );

  await prisma.$transaction(
    rows.map((row) => prisma.sourceObservation.upsert({
      where: {
        sourceName_sourceId_entityType: {
          sourceName: row.sourceName,
          sourceId: row.sourceId,
          entityType: row.entityType,
        },
      },
      update: row,
      create: row,
    })),
  );

  updated += existing.filter(Boolean).length;
  inserted += existing.filter((row) => !row).length;
  return { inserted, updated };
}

export async function persistMiamiBeachArcgisCanonical(
  prisma: PrismaClient,
  source: ConnectorSourceConfig,
  canonical: MiamiBeachArcgisCanonicalSet,
): Promise<CanonicalImportResult> {
  const recordsSeen = canonical.inputFeaturesSeen;
  const run = await prisma.importRun.create({
    data: {
      sourceName: source.sourceName,
      sourceKey: source.sourceKey,
      connectorKey: 'arcgis_rest_canonical',
      dryRun: false,
      status: 'running',
      recordsSeen,
      summary: json({
        mode: 'miami_beach_arcgis_canonical',
        source,
        planned: {
          parkingFacilities: canonical.facilities.length,
          parkingZones: canonical.zones.length,
          sourceObservations: canonical.observations.length,
          canonicalRows: canonical.canonicalRowsPlanned,
        },
        skipped: canonical.skipped,
      }),
    },
  });

  let recordsErrorCount = 0;
  try {
    await upsertDataSource(prisma, source);
    const facilityCounts = await upsertFacilities(prisma, canonical.facilities);
    const zoneCounts = await upsertZones(prisma, canonical.zones);
    const observationCounts = await upsertSourceObservations(prisma, canonical.observations);
    const result: CanonicalImportResult = {
      mode: 'miami_beach_arcgis_canonical',
      sourceName: source.sourceName,
      sourceKey: source.sourceKey,
      recordsSeen,
      recordsInserted: facilityCounts.inserted + zoneCounts.inserted + observationCounts.inserted,
      recordsUpdated: facilityCounts.updated + zoneCounts.updated + observationCounts.updated,
      recordsSkipped: canonical.skipped.nonCanonicalSpaces + canonical.skipped.invalidFacilities + canonical.skipped.nullGeometryZones,
      recordsErrorCount,
      imported: {
        parkingFacilities: canonical.facilities.length,
        parkingZones: canonical.zones.length,
        sourceObservations: canonical.observations.length,
      },
      skipped: canonical.skipped,
    };

    await prisma.importRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        status: 'completed',
        recordsInserted: result.recordsInserted,
        recordsUpdated: result.recordsUpdated,
        recordsSkipped: result.recordsSkipped,
        recordsErrorCount,
        summary: json(result),
      },
    });

    return result;
  } catch (error) {
    recordsErrorCount += 1;
    await prisma.importRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        status: 'failed',
        recordsErrorCount,
        error: error instanceof Error ? error.message : String(error),
        summary: json({
          mode: 'miami_beach_arcgis_canonical',
          source,
          planned: {
            parkingFacilities: canonical.facilities.length,
            parkingZones: canonical.zones.length,
            sourceObservations: canonical.observations.length,
            canonicalRows: canonical.canonicalRowsPlanned,
          },
          skipped: canonical.skipped,
        }),
      },
    });
    throw error;
  }
}

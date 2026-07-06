import { prisma, tryDatabase } from '@/lib/db';
import type { GeoJSONCollection, GeoJSONFeature } from '@/lib/data-loader';
import {
  deriveEnrichmentStatus,
  derivePriceStatus,
  deriveRuleStatus,
  needsEnrichment,
  normalizeExistenceStatus,
  safeUrl,
  type EnrichmentStatus,
  type PriceStatus,
  type RuleStatus,
} from '@/lib/data-quality';

type DateLike = Date | string | null | undefined;

interface BaseDbRow {
  sourceId: string;
  sourceName: string;
  geojson: unknown;
  rawProperties: unknown;
  confidence: number | null;
  sourceConfidence?: number | null;
  offerConfidence?: number | null;
  displayConfidence?: number | null;
  lastVerifiedAt?: DateLike;
  dataAsOf?: DateLike;
  sourceUrl?: string | null;
  apiUrl?: string | null;
  paymentUrl?: string | null;
  bookingUrl?: string | null;
  evidenceUrl?: string | null;
  priceStatus?: string | null;
  ruleStatus?: string | null;
  enrichmentStatus?: string | null;
  city?: string | null;
  state?: string | null;
}

export interface FacilityDbRow extends BaseDbRow {
  name: string | null;
  facilityType: string | null;
  fee: string | null;
  charge: string | null;
  baseHourlyRate: number | null;
  operator: string | null;
  access: string | null;
  capacity: string | null;
  openingHours: string | null;
  street: string | null;
  blockfaceId: string | null;
  neighborhood: string | null;
  meterType: string | null;
  capColor: string | null;
}

export interface CurbSegmentDbRow extends BaseDbRow {
  blockfaceId: string | null;
  meterCount: number | null;
  streetSample: string | null;
  neighborhood: string | null;
  baseHourlyRateMin: number | null;
  baseHourlyRateMax: number | null;
  charge: string | null;
}

export interface ParkingZoneDbRow extends BaseDbRow {
  name: string | null;
  facilityType: string | null;
  operator: string | null;
  access: string | null;
  fee: string | null;
  charge: string | null;
  capacity: string | null;
  openingHours: string | null;
  website: string | null;
}

function feature(geometry: unknown, properties: Record<string, unknown>): GeoJSONFeature {
  return {
    type: 'Feature',
    geometry: geometry as GeoJSONFeature['geometry'],
    properties,
  };
}

function collection(features: GeoJSONFeature[]): GeoJSONCollection {
  return {
    type: 'FeatureCollection',
    metadata: {
      source: 'PostGIS/Prisma',
      count: features.length,
    },
    features,
  };
}

function rawObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function isoDate(value: DateLike) {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

function rawString(rawProperties: unknown, key: string) {
  const value = rawObject(rawProperties)[key];
  return typeof value === 'string' ? value : undefined;
}

function firstString(...values: unknown[]) {
  return values.find((value): value is string => typeof value === 'string' && value.trim().length > 0);
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function safeRowUrl(rowValue: string | null | undefined, rawProperties: unknown, snakeKey: string, camelKey: string) {
  return safeUrl(firstString(rowValue, rawString(rawProperties, snakeKey), rawString(rawProperties, camelKey)) ?? '');
}

function statusValue<T extends string>(status: string | null | undefined, allowed: ReadonlySet<T>) {
  return typeof status === 'string' && allowed.has(status as T) ? status as T : undefined;
}

const PRICE_STATUSES = new Set<PriceStatus>([
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

function provenanceProperties(row: BaseDbRow, baseProperties: Record<string, unknown>) {
  const rawProperties = rawObject(row.rawProperties);
  const sourceConfidence = firstNumber(row.sourceConfidence, rawProperties.source_confidence, rawProperties.sourceConfidence, row.confidence);
  const offerConfidence = firstNumber(row.offerConfidence, rawProperties.offer_confidence, rawProperties.offerConfidence, row.displayConfidence, rawProperties.display_confidence, rawProperties.displayConfidence, row.confidence);
  const displayConfidence = firstNumber(row.displayConfidence, rawProperties.display_confidence, rawProperties.displayConfidence, offerConfidence, row.confidence);
  const properties = {
    ...baseProperties,
    source_id: row.sourceId,
    source_name: row.sourceName,
    existence_status: normalizeExistenceStatus(rawProperties.existence_status),
    confidence: displayConfidence ?? row.confidence,
    source_confidence: sourceConfidence,
    offer_confidence: offerConfidence,
    display_confidence: displayConfidence,
    last_verified_source: row.sourceName,
    last_verified_at: isoDate(row.lastVerifiedAt),
    data_as_of: isoDate(row.dataAsOf),
    raw_properties: row.rawProperties,
    city: row.city ?? rawProperties.city,
    state: row.state ?? rawProperties.state,
    source_url: safeRowUrl(row.sourceUrl, row.rawProperties, 'source_url', 'sourceUrl'),
    api_url: safeRowUrl(row.apiUrl, row.rawProperties, 'api_url', 'apiUrl'),
    payment_url: safeRowUrl(row.paymentUrl, row.rawProperties, 'payment_url', 'paymentUrl'),
    booking_url: safeRowUrl(row.bookingUrl, row.rawProperties, 'booking_url', 'bookingUrl'),
    evidence_url: safeRowUrl(row.evidenceUrl, row.rawProperties, 'evidence_url', 'evidenceUrl'),
  };
  const priceStatus = statusValue(row.priceStatus, PRICE_STATUSES) ?? derivePriceStatus(properties);
  const ruleStatus = statusValue(row.ruleStatus, RULE_STATUSES) ?? deriveRuleStatus(properties);
  const enrichmentStatus = statusValue(row.enrichmentStatus, ENRICHMENT_STATUSES) ?? deriveEnrichmentStatus({
    ...properties,
    price_status: priceStatus,
    rule_status: ruleStatus,
  });

  return {
    ...properties,
    price_status: priceStatus,
    rule_status: ruleStatus,
    enrichment_status: enrichmentStatus,
    needs_enrichment: needsEnrichment({
      ...properties,
      price_status: priceStatus,
      rule_status: ruleStatus,
      enrichment_status: enrichmentStatus,
    }),
  };
}

function cityList(city?: string | string[]) {
  if (!city) return [];
  return Array.isArray(city) ? city : [city];
}

function matchesCity(rawProperties: unknown, city?: string | string[]) {
  const cities = cityList(city);
  if (cities.length === 0) return true;
  return cities.includes(String(rawObject(rawProperties).city ?? ''));
}

function rowMatchesCity(row: BaseDbRow, city?: string | string[]) {
  const cities = cityList(city);
  if (cities.length === 0) return true;
  if (typeof row.city === 'string' && cities.includes(row.city)) return true;
  return matchesCity(row.rawProperties, city);
}

export function facilityFeatureFromDbRow(row: FacilityDbRow): GeoJSONFeature {
  return feature(row.geojson, provenanceProperties(row, {
    name: row.name,
    facility_type: row.facilityType,
    fee: row.fee,
    charge: row.charge,
    base_hourly_rate: row.baseHourlyRate,
    operator: row.operator,
    access: row.access,
    capacity: row.capacity,
    opening_hours: row.openingHours,
    street: row.street,
    blockface_id: row.blockfaceId,
    neighborhood: row.neighborhood,
    meter_type: row.meterType,
    cap_color: row.capColor,
  }));
}

export function curbSegmentFeatureFromDbRow(row: CurbSegmentDbRow): GeoJSONFeature {
  return feature(row.geojson, provenanceProperties(row, {
    blockface_id: row.blockfaceId,
    meter_count: row.meterCount,
    street_sample: row.streetSample,
    neighborhood: row.neighborhood,
    base_hourly_rate_min: row.baseHourlyRateMin,
    base_hourly_rate_max: row.baseHourlyRateMax,
    charge: row.charge,
  }));
}

export function parkingZoneFeatureFromDbRow(row: ParkingZoneDbRow): GeoJSONFeature {
  return feature(row.geojson, provenanceProperties(row, {
    name: row.name,
    facility_type: row.facilityType,
    operator: row.operator,
    access: row.access,
    fee: row.fee,
    charge: row.charge,
    capacity: row.capacity,
    opening_hours: row.openingHours,
    website: row.website,
  }));
}

export async function loadFacilitiesFromDb(city?: string | string[]): Promise<GeoJSONCollection | null> {
  return tryDatabase(async () => {
    const cities = cityList(city);
    const rows = await prisma.parkingFacility.findMany({
      where: cities.length ? { city: { in: cities } } : undefined,
      take: 50_000,
      orderBy: [{ sourceId: 'asc' }],
    });

    return collection(
      rows.map((row) => facilityFeatureFromDbRow(row))
    );
  });
}

export async function loadCurbSegmentsFromDb(city?: string | string[]): Promise<GeoJSONCollection | null> {
  return tryDatabase(async () => {
    const rows = await prisma.curbSegment.findMany({
      where: cityList(city).length
        ? { OR: [{ city: { in: cityList(city) } }, { city: null }] }
        : undefined,
      take: 50_000,
      orderBy: [{ sourceId: 'asc' }],
    });
    const cityRows = rows.filter((row) => rowMatchesCity(row, city));

    return collection(
      cityRows.map((row) => curbSegmentFeatureFromDbRow(row))
    );
  });
}

export async function loadZonesFromDb(city?: string | string[]): Promise<GeoJSONCollection | null> {
  return tryDatabase(async () => {
    const rows = await prisma.parkingZone.findMany({
      where: cityList(city).length
        ? { OR: [{ city: { in: cityList(city) } }, { city: null }] }
        : undefined,
      take: 50_000,
      orderBy: [{ sourceId: 'asc' }],
    });
    const cityRows = rows.filter((row) => rowMatchesCity(row, city));

    return collection(
      cityRows.map((row) => parkingZoneFeatureFromDbRow(row))
    );
  });
}

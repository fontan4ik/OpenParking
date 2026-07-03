import { PrismaClient } from '@prisma/client';
import nextEnv from '@next/env';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..', '..');
const { loadEnvConfig } = nextEnv;
loadEnvConfig(root);

const prisma = new PrismaClient();

const SOURCES = {
  datasf: {
    name: 'DataSF Parking Meters + Meter Rate Schedules',
    sourceKey: 'datasf-parking-meters-sf',
    type: 'city_open_data',
    homepageUrl: 'https://data.sfgov.org/',
    sourceUrl: 'https://data.sfgov.org/Transportation/Parking-Meters/8vzz-qzz9',
    apiUrl: 'https://data.sfgov.org/resource/8vzz-qzz9.json',
    evidenceUrl: 'https://data.sfgov.org/Transportation/Parking-Meters/8vzz-qzz9',
    license: 'City and County of San Francisco open data terms',
  },
  curb: {
    name: 'DataSF Derived Curb Segments',
    sourceKey: 'datasf-derived-curb-segments-sf',
    type: 'derived_city_open_data',
    homepageUrl: 'https://data.sfgov.org/',
    sourceUrl: 'https://data.sfgov.org/Transportation/Parking-Meters/8vzz-qzz9',
    apiUrl: 'https://data.sfgov.org/resource/8vzz-qzz9.json',
    evidenceUrl: 'https://data.sfgov.org/Transportation/Parking-Meters/8vzz-qzz9',
    license: 'Derived from City and County of San Francisco open data',
    notes: 'Derived from DataSF meter points grouped by blockface_id; not an independent official curb-line source.',
  },
  osm: {
    name: 'OpenStreetMap via Overpass',
    sourceKey: 'osm-overpass-sf-parking-zones',
    type: 'openstreetmap',
    homepageUrl: 'https://www.openstreetmap.org/',
    sourceUrl: 'https://www.openstreetmap.org/',
    apiUrl: 'https://overpass-api.de/api/interpreter',
    evidenceUrl: 'https://www.openstreetmap.org/',
    license: 'ODbL',
    notes: 'OSM-derived candidate/probable parking zones; lower confidence than official city data.',
  },
};

function parseDate(value) {
  if (!value || typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function numberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringOrNull(value) {
  return typeof value === 'string' && value.trim() ? value : null;
}

async function readGeoJSON(filename) {
  const raw = await readFile(path.join(root, 'data', filename), 'utf8');
  return JSON.parse(raw);
}

async function ensureSources() {
  for (const source of Object.values(SOURCES)) {
    await prisma.dataSource.upsert({
      where: { name: source.name },
      update: source,
      create: source,
    });
  }
}

async function upsertInChunks(items, mapItem, model, label) {
  const chunkSize = 500;
  let count = 0;

  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    await prisma.$transaction(
      chunk.map((item) => {
        const data = mapItem(item);
        return model.upsert({
          where: {
            sourceName_sourceId: {
              sourceName: data.sourceName,
              sourceId: data.sourceId,
            },
          },
          update: data,
          create: data,
        });
      })
    );
    count += chunk.length;
    console.log(`${label}: ${count}/${items.length}`);
  }
}

function mapFacility(feature) {
  const p = feature.properties ?? {};
  const coordinates = feature.geometry?.coordinates;
  const [lng, lat] = Array.isArray(coordinates) ? coordinates : [null, null];

  return {
    sourceName: SOURCES.datasf.name,
    sourceId: String(p.source_id ?? ''),
    name: p.name ?? null,
    facilityType: p.facility_type ?? 'street_meter',
    geometryType: feature.geometry?.type ?? 'Point',
    geojson: feature.geometry,
    lat: numberOrNull(lat),
    lng: numberOrNull(lng),
    city: stringOrNull(p.city) ?? 'San Francisco',
    state: stringOrNull(p.state) ?? 'CA',
    operator: p.operator ?? null,
    access: p.access ?? null,
    capacity: p.capacity ? String(p.capacity) : null,
    fee: p.fee ?? null,
    charge: p.charge ?? null,
    baseHourlyRate: numberOrNull(p.base_hourly_rate),
    openingHours: p.opening_hours ?? null,
    street: p.street ?? null,
    blockfaceId: p.blockface_id ?? null,
    neighborhood: p.neighborhood ?? null,
    meterType: p.meter_type ?? null,
    capColor: p.cap_color ?? null,
    rawProperties: p,
    confidence: numberOrNull(p.confidence) ?? 0.85,
    lastVerifiedAt: parseDate(p.last_verified_at),
    dataAsOf: parseDate(p.data_as_of),
    geometryQuality: stringOrNull(p.geometry_quality) ?? 'official_point',
    sourceUrl: stringOrNull(p.source_url),
    apiUrl: stringOrNull(p.api_url),
    paymentUrl: stringOrNull(p.payment_url),
    bookingUrl: stringOrNull(p.booking_url),
    evidenceUrl: stringOrNull(p.evidence_url),
    priceStatus: stringOrNull(p.price_status),
    ruleStatus: stringOrNull(p.rule_status),
    enrichmentStatus: stringOrNull(p.enrichment_status),
  };
}

function mapCurbSegment(feature) {
  const p = feature.properties ?? {};

  return {
    sourceName: SOURCES.curb.name,
    sourceId: String(p.source_id ?? ''),
    blockfaceId: p.blockface_id ?? null,
    city: stringOrNull(p.city) ?? 'San Francisco',
    state: stringOrNull(p.state) ?? 'CA',
    meterCount: Number.isInteger(p.meter_count) ? p.meter_count : null,
    streetSample: p.street_sample ?? null,
    neighborhood: p.neighborhood ?? null,
    baseHourlyRateMin: numberOrNull(p.base_hourly_rate_min),
    baseHourlyRateMax: numberOrNull(p.base_hourly_rate_max),
    charge: p.charge ?? null,
    geojson: feature.geometry,
    rawProperties: p,
    confidence: numberOrNull(p.confidence) ?? 0.7,
    lastVerifiedAt: parseDate(p.last_verified_at),
    dataAsOf: parseDate(p.data_as_of),
    geometryQuality: stringOrNull(p.geometry_quality) ?? 'derived_line_from_meter_points',
    sourceUrl: stringOrNull(p.source_url),
    apiUrl: stringOrNull(p.api_url),
    paymentUrl: stringOrNull(p.payment_url),
    bookingUrl: stringOrNull(p.booking_url),
    evidenceUrl: stringOrNull(p.evidence_url),
    priceStatus: stringOrNull(p.price_status),
    ruleStatus: stringOrNull(p.rule_status),
    enrichmentStatus: stringOrNull(p.enrichment_status),
  };
}

function mapZone(feature) {
  const p = feature.properties ?? {};

  return {
    sourceName: SOURCES.osm.name,
    sourceId: String(p.source_id ?? ''),
    name: p.name ?? null,
    city: stringOrNull(p.city) ?? 'San Francisco',
    state: stringOrNull(p.state) ?? 'CA',
    facilityType: p.facility_type ?? null,
    operator: p.operator ?? null,
    access: p.access ?? null,
    fee: p.fee ?? null,
    charge: p.charge ?? null,
    capacity: p.capacity ? String(p.capacity) : null,
    openingHours: p.opening_hours ?? null,
    website: p.website ?? null,
    geojson: feature.geometry,
    rawProperties: p,
    confidence: numberOrNull(p.confidence) ?? 0.6,
    lastVerifiedAt: parseDate(p.last_verified_at),
    dataAsOf: parseDate(p.data_as_of),
    geometryQuality: stringOrNull(p.geometry_quality) ?? (p.geometry_note ? 'osm_display_fallback' : 'osm_geometry'),
    sourceUrl: stringOrNull(p.source_url),
    apiUrl: stringOrNull(p.api_url),
    paymentUrl: stringOrNull(p.payment_url),
    bookingUrl: stringOrNull(p.booking_url),
    evidenceUrl: stringOrNull(p.evidence_url),
    priceStatus: stringOrNull(p.price_status),
    ruleStatus: stringOrNull(p.rule_status),
    enrichmentStatus: stringOrNull(p.enrichment_status),
  };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for import:sf');
  }

  await ensureSources();

  const [facilities, curbs, zones] = await Promise.all([
    readGeoJSON('sf_parking_datasf.geojson'),
    readGeoJSON('sf_parking_curb_segments.geojson'),
    readGeoJSON('sf_parking_zones_osm.geojson'),
  ]);

  await upsertInChunks(facilities.features ?? [], mapFacility, prisma.parkingFacility, 'facilities');
  await upsertInChunks(curbs.features ?? [], mapCurbSegment, prisma.curbSegment, 'curb segments');
  await upsertInChunks(zones.features ?? [], mapZone, prisma.parkingZone, 'parking zones');

  const counts = {
    facilities: await prisma.parkingFacility.count(),
    curbSegments: await prisma.curbSegment.count(),
    parkingZones: await prisma.parkingZone.count(),
  };
  console.log(JSON.stringify(counts, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

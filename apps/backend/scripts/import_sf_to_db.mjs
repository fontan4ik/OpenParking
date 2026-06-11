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
    type: 'city_open_data',
    homepageUrl: 'https://data.sfgov.org/',
    license: 'City and County of San Francisco open data terms',
  },
  curb: {
    name: 'DataSF Derived Curb Segments',
    type: 'derived_city_open_data',
    homepageUrl: 'https://data.sfgov.org/',
    license: 'Derived from City and County of San Francisco open data',
  },
  osm: {
    name: 'OpenStreetMap via Overpass',
    type: 'openstreetmap',
    homepageUrl: 'https://www.openstreetmap.org/',
    license: 'ODbL',
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
    city: 'San Francisco',
    state: 'CA',
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
    lastVerifiedAt: parseDate(p.data_as_of),
    dataAsOf: parseDate(p.data_as_of),
    geometryQuality: 'official_point',
  };
}

function mapCurbSegment(feature) {
  const p = feature.properties ?? {};

  return {
    sourceName: SOURCES.curb.name,
    sourceId: String(p.source_id ?? ''),
    blockfaceId: p.blockface_id ?? null,
    meterCount: Number.isInteger(p.meter_count) ? p.meter_count : null,
    streetSample: p.street_sample ?? null,
    neighborhood: p.neighborhood ?? null,
    baseHourlyRateMin: numberOrNull(p.base_hourly_rate_min),
    baseHourlyRateMax: numberOrNull(p.base_hourly_rate_max),
    charge: p.charge ?? null,
    geojson: feature.geometry,
    rawProperties: p,
    confidence: numberOrNull(p.confidence) ?? 0.7,
    lastVerifiedAt: null,
    dataAsOf: null,
    geometryQuality: 'derived_line_from_meter_points',
  };
}

function mapZone(feature) {
  const p = feature.properties ?? {};

  return {
    sourceName: SOURCES.osm.name,
    sourceId: String(p.source_id ?? ''),
    name: p.name ?? null,
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
    lastVerifiedAt: null,
    dataAsOf: null,
    geometryQuality: p.geometry_note ? 'osm_display_fallback' : 'osm_geometry',
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

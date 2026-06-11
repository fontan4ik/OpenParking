import osmtogeojson from 'osmtogeojson';
import { PrismaClient } from '@prisma/client';
import nextEnv from '@next/env';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..', '..');
const { loadEnvConfig } = nextEnv;
loadEnvConfig(root);

const positional = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const inputPath = positional[0] ?? path.join(root, 'data', 'sf_osm_overpass.json');
const outputPath = positional[1] ?? path.join(root, 'data', 'sf_parking_zones_osm_v2.geojson');
const importToDb = process.argv.includes('--db');
const prisma = new PrismaClient();

const SOURCE = {
  name: 'OpenStreetMap via osmtogeojson',
  type: 'openstreetmap',
  homepageUrl: 'https://www.openstreetmap.org/',
  license: 'ODbL',
  notes: 'Converted from OSM/Overpass JSON with osmtogeojson; preserves raw tags and tainted geometry flags.',
};

function numberOrNull(value) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeProperties(feature) {
  const tags = feature.properties?.tags ?? feature.properties ?? {};
  const type = feature.properties?.type;
  const id = feature.properties?.id;
  return {
    ...feature,
    properties: {
      source_id: type && id ? `osm:${type}:${id}` : feature.id ?? 'osm:unknown',
      name: tags.name || tags.operator || 'Parking area',
      facility_type: tags.parking || tags.amenity || 'parking_area',
      operator: tags.operator || '',
      access: tags.access || '',
      fee: tags.fee || 'unknown',
      charge: tags.charge || '',
      capacity: tags.capacity || '',
      opening_hours: tags.opening_hours || '',
      website: tags.website || '',
      confidence: feature.properties?.tainted ? 0.35 : 0.65,
      last_verified_source: 'OpenStreetMap via osmtogeojson',
      osm_type: type,
      osm_id: id,
      relations: feature.properties?.relations ?? [],
      tainted: Boolean(feature.properties?.tainted),
      raw_tags: tags,
      raw_properties: feature.properties ?? {},
    },
  };
}

function geometryQuality(feature) {
  if (feature.properties?.tainted) return 'osm_tainted_geometry';
  if (feature.geometry?.type === 'Point') return 'osm_point';
  return 'osm_geometry';
}

function mapZone(feature) {
  const p = feature.properties ?? {};

  return {
    sourceName: SOURCE.name,
    sourceId: String(p.source_id ?? feature.id ?? 'osm:unknown'),
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
    geometryQuality: geometryQuality(feature),
  };
}

async function ensureSource() {
  await prisma.dataSource.upsert({
    where: { name: SOURCE.name },
    update: SOURCE,
    create: SOURCE,
  });
}

async function upsertZones(features) {
  await ensureSource();
  const chunkSize = 250;
  let count = 0;

  for (let i = 0; i < features.length; i += chunkSize) {
    const chunk = features.slice(i, i + chunkSize);
    await prisma.$transaction(
      chunk.map((feature) => {
        const data = mapZone(feature);
        return prisma.parkingZone.upsert({
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
    console.log(`osm zones: ${count}/${features.length}`);
  }
}

async function main() {
  const raw = await readFile(inputPath, 'utf8');
  const osm = JSON.parse(raw);
  const converted = osmtogeojson(osm, { flatProperties: false });
  const parkingFeatures = converted.features
    .filter((feature) => {
      const tags = feature.properties?.tags ?? {};
      return tags.amenity === 'parking' || Boolean(tags.parking);
    })
    .map(normalizeProperties);

  const geojson = {
    type: 'FeatureCollection',
    metadata: {
      source: 'OpenStreetMap via osmtogeojson',
      input: path.relative(root, inputPath),
      count: parkingFeatures.length,
      tainted_count: parkingFeatures.filter((f) => f.properties.tainted).length,
    },
    features: parkingFeatures,
  };

  await writeFile(outputPath, JSON.stringify(geojson, null, 2), 'utf8');

  if (importToDb) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for import:osm:sf --db');
    }
    await upsertZones(parkingFeatures);
  }

  console.log(JSON.stringify(geojson.metadata, null, 2));
  console.log(outputPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});

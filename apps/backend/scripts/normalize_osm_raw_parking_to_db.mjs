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

const SOURCE = {
  name: 'OpenStreetMap via Geofabrik/osm2pgsql',
  type: 'openstreetmap_pbf',
  homepageUrl: 'https://download.geofabrik.de/',
  license: 'ODbL',
  notes:
    'Parking-focused raw OSM tables imported with external osm2pgsql flex config apps/backend/scripts/osm2pgsql_parking.lua.',
};

function argValue(name, fallback) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

const schema = argValue('--schema', 'osm_raw');
const city = argValue('--city', 'Miami');
const state = argValue('--state', 'FL');
const limit = Number(argValue('--limit', '0'));
const bboxArg = argValue('--bbox', '');
const boundaryGeojsonArg = argValue('--boundary-geojson', '');
const dryRun = process.argv.includes('--dry-run');
const replaceSource = process.argv.includes('--replace-source');
let boundaryGeometry = null;
let boundaryGeojsonPath = '';

function sqlIdentifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe SQL identifier: ${value}`);
  }
  return `"${value}"`;
}

function numberOrNull(value) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function stringOrNull(value) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function parseBbox(value) {
  if (!value) return null;
  const parts = value.split(',').map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    throw new Error('--bbox must be south,west,north,east');
  }
  const [south, west, north, east] = parts;
  if (south >= north || west >= east) {
    throw new Error('--bbox must satisfy south<north and west<east');
  }
  return { south, west, north, east };
}

const bbox = parseBbox(bboxArg);

function extractGeojsonGeometry(geojson) {
  if (!geojson || typeof geojson !== 'object') {
    throw new Error('--boundary-geojson must contain a GeoJSON object');
  }

  if (geojson.type === 'FeatureCollection') {
    const geometries = (geojson.features ?? []).map((feature) => feature.geometry).filter(Boolean);
    if (geometries.length === 0) {
      throw new Error('--boundary-geojson FeatureCollection has no geometries');
    }
    return geometries.length === 1 ? geometries[0] : { type: 'GeometryCollection', geometries };
  }

  if (geojson.type === 'Feature') {
    if (!geojson.geometry) throw new Error('--boundary-geojson Feature has no geometry');
    return geojson.geometry;
  }

  if (typeof geojson.type === 'string' && Array.isArray(geojson.coordinates)) {
    return geojson;
  }

  if (geojson.type === 'GeometryCollection' && Array.isArray(geojson.geometries)) {
    return geojson;
  }

  throw new Error('--boundary-geojson must be a FeatureCollection, Feature, or Geometry');
}

async function loadBoundaryGeometry() {
  if (!boundaryGeojsonArg) return;
  boundaryGeojsonPath = path.resolve(root, boundaryGeojsonArg);
  const geojson = JSON.parse(await readFile(boundaryGeojsonPath, 'utf8'));
  boundaryGeometry = extractGeojsonGeometry(geojson);
}

function spatialWhereClause() {
  const clauses = [];
  const params = [];

  if (bbox) {
    clauses.push(
      `ST_Intersects(geom, ST_MakeEnvelope(${bbox.west}, ${bbox.south}, ${bbox.east}, ${bbox.north}, 4326))`
    );
  }

  if (boundaryGeometry) {
    params.push(JSON.stringify(boundaryGeometry));
    clauses.push(`ST_Intersects(geom, ST_SetSRID(ST_GeomFromGeoJSON($${params.length}), 4326))`);
  }

  return {
    clause: clauses.length ? ` where ${clauses.join(' and ')}` : '',
    params,
  };
}

function confidenceFor(row, geometryQuality) {
  if (row.fee && row.fee !== 'unknown') return 0.68;
  if (geometryQuality === 'osm_raw_point') return 0.55;
  return 0.62;
}

function priceStatus(row) {
  return row.charge || (row.fee && row.fee !== 'unknown') ? 'known' : 'unknown';
}

function rawProperties(row, geometryQuality) {
  return {
    source_id: row.source_id,
    source_name: SOURCE.name,
    city,
    state,
    osm_type: row.osm_type,
    osm_id: row.osm_id?.toString?.() ?? row.osm_id,
    facility_type: row.facility_type,
    name: row.name,
    operator: row.operator,
    access: row.access,
    fee: row.fee ?? 'unknown',
    charge: row.charge,
    capacity: row.capacity,
    opening_hours: row.opening_hours,
    website: row.website,
    phone: row.phone,
    geometry_quality: geometryQuality,
    price_status: priceStatus(row),
    needs_enrichment: priceStatus(row) !== 'known',
    raw_tags: row.tags ?? {},
  };
}

function pointCoordinates(geojson) {
  if (geojson?.type !== 'Point' || !Array.isArray(geojson.coordinates)) return [null, null];
  const [lng, lat] = geojson.coordinates;
  return [numberOrNull(lng), numberOrNull(lat)];
}

function mapPoint(row) {
  const geometryQuality = 'osm_raw_point';
  const [lng, lat] = pointCoordinates(row.geojson);
  return {
    sourceName: SOURCE.name,
    sourceId: String(row.source_id),
    name: stringOrNull(row.name),
    facilityType: stringOrNull(row.facility_type) ?? 'parking',
    geometryType: row.geojson?.type ?? 'Point',
    geojson: row.geojson,
    lat,
    lng,
    city,
    state,
    operator: stringOrNull(row.operator),
    access: stringOrNull(row.access),
    capacity: row.capacity ? String(row.capacity) : null,
    fee: stringOrNull(row.fee) ?? 'unknown',
    charge: stringOrNull(row.charge),
    baseHourlyRate: null,
    openingHours: stringOrNull(row.opening_hours),
    street: null,
    blockfaceId: null,
    neighborhood: null,
    meterType: null,
    capColor: null,
    rawProperties: rawProperties(row, geometryQuality),
    confidence: confidenceFor(row, geometryQuality),
    lastVerifiedAt: null,
    dataAsOf: null,
    geometryQuality,
  };
}

function mapLine(row) {
  const geometryQuality = 'osm_raw_line';
  return {
    sourceName: SOURCE.name,
    sourceId: String(row.source_id),
    blockfaceId: null,
    meterCount: null,
    streetSample: stringOrNull(row.name),
    neighborhood: null,
    baseHourlyRateMin: null,
    baseHourlyRateMax: null,
    charge: stringOrNull(row.charge),
    geojson: row.geojson,
    rawProperties: rawProperties(row, geometryQuality),
    confidence: confidenceFor(row, geometryQuality),
    lastVerifiedAt: null,
    dataAsOf: null,
    geometryQuality,
  };
}

function mapPolygon(row) {
  const geometryQuality = 'osm_raw_polygon';
  return {
    sourceName: SOURCE.name,
    sourceId: String(row.source_id),
    name: stringOrNull(row.name),
    facilityType: stringOrNull(row.facility_type) ?? 'parking_area',
    operator: stringOrNull(row.operator),
    access: stringOrNull(row.access),
    fee: stringOrNull(row.fee) ?? 'unknown',
    charge: stringOrNull(row.charge),
    capacity: row.capacity ? String(row.capacity) : null,
    openingHours: stringOrNull(row.opening_hours),
    website: stringOrNull(row.website),
    geojson: row.geojson,
    rawProperties: rawProperties(row, geometryQuality),
    confidence: confidenceFor(row, geometryQuality),
    lastVerifiedAt: null,
    dataAsOf: null,
    geometryQuality,
  };
}

async function ensureSource() {
  await prisma.dataSource.upsert({
    where: { name: SOURCE.name },
    update: SOURCE,
    create: SOURCE,
  });
}

async function tableExists(table) {
  const result = await prisma.$queryRawUnsafe(
    `select to_regclass('${schema}.${table}')::text as name`
  );
  return Boolean(result[0]?.name);
}

async function countRows(table) {
  if (!(await tableExists(table))) return 0;
  const spatialFilter = spatialWhereClause();
  const result = await prisma.$queryRawUnsafe(
    `select count(*)::int as count from ${sqlIdentifier(schema)}.${sqlIdentifier(table)}${spatialFilter.clause}`,
    ...spatialFilter.params
  );
  return Number(result[0]?.count ?? 0);
}

async function readRows(table) {
  if (!(await tableExists(table))) return [];
  const spatialFilter = spatialWhereClause();
  const limitClause = limit > 0 ? ` limit ${limit}` : '';
  return prisma.$queryRawUnsafe(
    `select osm_type, osm_id, source_id, facility_type, name, operator, access, fee, charge, capacity, opening_hours, website, phone, tags, ST_AsGeoJSON(geom)::jsonb as geojson from ${sqlIdentifier(schema)}.${sqlIdentifier(table)}${spatialFilter.clause} order by source_id${limitClause}`,
    ...spatialFilter.params
  );
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

async function replaceExistingSourceRows() {
  const scopedRawProperties = {
    AND: [
      { rawProperties: { path: ['city'], equals: city } },
      { rawProperties: { path: ['state'], equals: state } },
    ],
  };
  const [parkingZones, curbSegments, parkingFacilities] = await prisma.$transaction([
    prisma.parkingZone.deleteMany({ where: { sourceName: SOURCE.name, ...scopedRawProperties } }),
    prisma.curbSegment.deleteMany({ where: { sourceName: SOURCE.name, ...scopedRawProperties } }),
    prisma.parkingFacility.deleteMany({ where: { sourceName: SOURCE.name, city, state } }),
  ]);

  return {
    parkingFacilities: parkingFacilities.count,
    curbSegments: curbSegments.count,
    parkingZones: parkingZones.count,
  };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for normalize:osm:pbf');
  }

  await loadBoundaryGeometry();

  const rawCounts = {
    parking_points: await countRows('parking_points'),
    parking_lines: await countRows('parking_lines'),
    parking_polygons: await countRows('parking_polygons'),
  };

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          schema,
          city,
          state,
          bbox,
          boundaryGeojson: boundaryGeojsonPath ? path.relative(root, boundaryGeojsonPath) : null,
          boundaryGeometryType: boundaryGeometry?.type ?? null,
          replaceSource,
          limit,
          source: SOURCE.name,
          rawCounts,
          wouldUpsert: {
            parkingFacilities: rawCounts.parking_points,
            curbSegments: rawCounts.parking_lines,
            parkingZones: rawCounts.parking_polygons,
          },
        },
        null,
        2
      )
    );
    return;
  }

  await ensureSource();
  const replaced = replaceSource ? await replaceExistingSourceRows() : null;
  const [points, lines, polygons] = await Promise.all([
    readRows('parking_points'),
    readRows('parking_lines'),
    readRows('parking_polygons'),
  ]);

  await upsertInChunks(points, mapPoint, prisma.parkingFacility, 'osm facilities');
  await upsertInChunks(lines, mapLine, prisma.curbSegment, 'osm parking lines');
  await upsertInChunks(polygons, mapPolygon, prisma.parkingZone, 'osm parking polygons');

  console.log(
    JSON.stringify(
      {
        source: SOURCE.name,
        city,
        state,
        bbox,
        boundaryGeojson: boundaryGeojsonPath ? path.relative(root, boundaryGeojsonPath) : null,
        boundaryGeometryType: boundaryGeometry?.type ?? null,
        replaceSource,
        replaced,
        rawCounts,
        imported: {
          parkingFacilities: points.length,
          curbSegments: lines.length,
          parkingZones: polygons.length,
        },
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    if (error?.name === 'PrismaClientInitializationError') {
      console.error(
        [
          'PostGIS is not reachable for OSM raw normalization.',
          'Start the database and import the Geofabrik PBF first, for example:',
          '  docker compose up -d db',
          '  npm run fetch:pbf:florida',
          '  npm run import:osm:pbf -- --input=data/osm/florida-latest.osm.pbf --schema=osm_raw --flex=apps/backend/scripts/osm2pgsql_parking.lua',
          '  npm run normalize:osm:pbf:miami:dry-run',
        ].join('\n')
      );
    }
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..', '..');

const BOUNDARIES = {
  'miami-place': {
    label: 'City of Miami incorporated place boundary',
    serviceUrl:
      'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer/4/query',
    where: "STATE='12' AND BASENAME='Miami'",
    output: path.join('data', 'boundaries', 'miami_place_boundary.geojson'),
    notes: 'Census TIGERweb Incorporated Places layer, January 1 2025 vintage. Used for City of Miami boundary filtering.',
  },
  'miami-dade-county': {
    label: 'Miami-Dade County boundary',
    serviceUrl: 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1/query',
    where: "GEOID='12086'",
    output: path.join('data', 'boundaries', 'miami_dade_county_boundary.geojson'),
    notes: 'Census TIGERweb Counties layer, January 1 2025 vintage. Used for Miami-Dade county-wide coverage filtering.',
  },
};

function argValue(name, fallback) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function boundaryConfig(name) {
  const config = BOUNDARIES[name];
  if (!config) {
    throw new Error(`Unknown boundary "${name}". Known boundaries: ${Object.keys(BOUNDARIES).join(', ')}`);
  }
  return config;
}

function queryUrl(config) {
  const url = new URL(config.serviceUrl);
  url.searchParams.set('where', config.where);
  url.searchParams.set('outFields', '*');
  url.searchParams.set('returnGeometry', 'true');
  url.searchParams.set('outSR', '4326');
  url.searchParams.set('f', 'geojson');
  return url.toString();
}

function withMetadata(geojson, config, url) {
  return {
    ...geojson,
    metadata: {
      boundary: config.label,
      source_name: 'U.S. Census Bureau TIGERweb',
      source_url: 'https://tigerweb.geo.census.gov/',
      api_url: url,
      license: 'Public domain; cite U.S. Census Bureau',
      generated_at: new Date().toISOString(),
      feature_count: geojson.features?.length ?? 0,
      notes: config.notes,
    },
  };
}

async function fetchGeojson(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'ParkingUSA Census boundary fetcher (local development)',
      Accept: 'application/geo+json, application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`Census boundary request failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function main() {
  const name = argValue('--boundary', 'miami-place');
  const config = boundaryConfig(name);
  const outputPath = path.resolve(root, argValue('--output', config.output));
  const dryRun = process.argv.includes('--dry-run');
  const url = queryUrl(config);

  const summary = {
    boundary: name,
    label: config.label,
    url,
    output: path.relative(root, outputPath),
    dryRun,
  };

  if (dryRun) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const geojson = await fetchGeojson(url);
  const featureCount = geojson.features?.length ?? 0;
  if (geojson.type !== 'FeatureCollection' || featureCount === 0) {
    throw new Error(`Census boundary query returned no features for ${name}`);
  }

  const output = withMetadata(geojson, config, url);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(output, null, 2), 'utf8');
  console.log(JSON.stringify({ ...summary, featureCount }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

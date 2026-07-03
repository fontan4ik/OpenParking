import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  arcgisCountUrl,
  arcgisMetadataUrl,
  arcgisQueryUrl,
  buildArcgisSourceConfig,
  buildConnectorReport,
  normalizeArcgisFeature,
  numberOrNull,
  persistConnectorReport,
} from './connector_foundation';
import {
  MIAMI_BEACH_ARCGIS_SOURCE_NAME,
  MIAMI_BEACH_ARCGIS_SOURCE_PAGE,
  MIAMI_BEACH_ARCGIS_SOURCE_URL,
  normalizeMiamiBeachArcgisCanonical,
  persistMiamiBeachArcgisCanonical,
  type ArcgisGeoJsonFeature,
  type MiamiBeachArcgisLayerInput,
} from './miami_beach_arcgis_canonical';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..', '..');
const require = createRequire(import.meta.url);
const { loadEnvConfig } = require('@next/env') as { loadEnvConfig: (dir: string) => void };
loadEnvConfig(root);

const MIAMI_BEACH_CANONICAL_LAYERS = [
  { id: 1, key: 'meters', name: 'Parking Meters' },
  { id: 3, key: 'spaces', name: 'Parking Spaces' },
  { id: 5, key: 'lots', name: 'Parking Lots' },
  { id: 7, key: 'zones', name: 'Parking Zones' },
] as const;

const PAGE_SIZE = 1000;

function argValue(name: string, fallback?: string) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'ParkingUSA ArcGIS connector foundation (bounded dry-run)',
      Accept: 'application/json',
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json() as Promise<Record<string, unknown>>;
}

function canonicalLayerUrl(layerId: number, offset = 0) {
  const url = new URL(`${MIAMI_BEACH_ARCGIS_SOURCE_URL}/${layerId}/query`);
  url.searchParams.set('where', '1=1');
  url.searchParams.set('outFields', '*');
  url.searchParams.set('returnGeometry', 'true');
  url.searchParams.set('f', 'geojson');
  url.searchParams.set('outSR', '4326');
  url.searchParams.set('resultRecordCount', String(PAGE_SIZE));
  url.searchParams.set('resultOffset', String(offset));
  return url.toString();
}

async function fetchCanonicalLayer(layer: typeof MIAMI_BEACH_CANONICAL_LAYERS[number]): Promise<MiamiBeachArcgisLayerInput> {
  const features: ArcgisGeoJsonFeature[] = [];
  let offset = 0;

  for (let page = 0; page < 100; page += 1) {
    const url = canonicalLayerUrl(layer.id, offset);
    const body = await fetchJson(url);
    if (body.type !== 'FeatureCollection' || !Array.isArray(body.features)) {
      throw new Error(`Miami Beach ArcGIS layer ${layer.id} did not return a GeoJSON FeatureCollection`);
    }

    const pageFeatures = body.features as ArcgisGeoJsonFeature[];
    features.push(...pageFeatures);
    if (pageFeatures.length < PAGE_SIZE) break;
    offset += pageFeatures.length;
  }

  return {
    key: layer.key,
    name: layer.name,
    apiUrl: canonicalLayerUrl(layer.id),
    features,
  };
}

async function fetchMiamiBeachCanonicalLayers() {
  const layers: MiamiBeachArcgisLayerInput[] = [];
  for (const layer of MIAMI_BEACH_CANONICAL_LAYERS) {
    layers.push(await fetchCanonicalLayer(layer));
  }
  return layers;
}

function shouldImportMiamiBeachCanonical(sourceName: string, sourceKey: string) {
  const marker = `${sourceName} ${sourceKey}`.toLowerCase();
  return marker.includes('miami beach') || marker.includes('miami-beach');
}

async function main() {
  const dryRun = process.argv.includes('--dry-run') || !process.argv.includes('--import');
  const importRequested = process.argv.includes('--import') && !process.argv.includes('--dry-run');
  const limit = Math.max(1, Math.min(100, Number(argValue('--limit', argValue('--max-records', '5')))));
  const offset = Math.max(0, Number(argValue('--offset', '0')));
  const apiUrl = argValue('--api-url', `${MIAMI_BEACH_ARCGIS_SOURCE_URL}/1/query`)!;
  const metadataUrl = argValue('--metadata-url', arcgisMetadataUrl(apiUrl))!;
  const metadata = await fetchJson(metadataUrl);
  const objectIdField = argValue('--object-id-field', String(metadata.objectIdField ?? 'OBJECTID'))!;
  const queryUrl = arcgisQueryUrl(apiUrl, limit, offset, objectIdField);
  const source = buildArcgisSourceConfig({
    sourceName: argValue('--source', MIAMI_BEACH_ARCGIS_SOURCE_NAME),
    sourceKey: argValue('--source-key', 'miami-beach-parking-arcgis'),
    sourceUrl: argValue('--source-url', MIAMI_BEACH_ARCGIS_SOURCE_PAGE)!,
    apiUrl,
    metadataUrl,
    legalRisk: argValue('--legal-risk', 'low_verify_license'),
    confidence: numberOrNull(argValue('--confidence', '0.9')),
    city: argValue('--city', 'Miami Beach'),
    state: argValue('--state', 'FL'),
  });

  const countBody = await fetchJson(arcgisCountUrl(apiUrl));
  const pageBody = await fetchJson(queryUrl);
  const features = Array.isArray(pageBody.features) ? pageBody.features as Record<string, unknown>[] : [];
  const records = features.map((feature) => normalizeArcgisFeature(source, feature, queryUrl, objectIdField));
  const report = buildConnectorReport({
    connectorKey: 'arcgis_rest',
    dryRun,
    importRequested,
    source,
    records,
    recordsSeen: features.length,
    totalAvailable: numberOrNull(countBody.count),
    limit,
    pagesFetched: 1,
    nextOffset: features.length === limit ? offset + limit : null,
    warnings: dryRun ? ['Dry-run mode: no DB mutation; records_inserted and records_updated remain 0.'] : [],
  });

  if (dryRun) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const persisted = await persistConnectorReport(prisma, report);
    if (!shouldImportMiamiBeachCanonical(source.sourceName, source.sourceKey)) {
      console.log(JSON.stringify(persisted, null, 2));
      return;
    }

    const layers = await fetchMiamiBeachCanonicalLayers();
    const canonical = normalizeMiamiBeachArcgisCanonical(source, layers);
    const canonicalImport = await persistMiamiBeachArcgisCanonical(prisma, source, canonical);
    console.log(JSON.stringify({ ...persisted, canonical_import: canonicalImport }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

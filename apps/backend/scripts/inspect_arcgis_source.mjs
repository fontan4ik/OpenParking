import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..', '..');
const require = createRequire(import.meta.url);
const { loadEnvConfig } = require('@next/env');
loadEnvConfig(root);

const prisma = new PrismaClient();

function argValue(name, fallback) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

const manifestPath = argValue('--manifest');
const apiUrlArg = argValue('--api-url');
const sourceNameFilter = argValue('--source');
const outputDir = argValue('--out', path.join(root, 'data', 'research', 'inspections'));
const importToDb = process.argv.includes('--db');

function asString(value) {
  return typeof value === 'string' ? value : '';
}

function layerUrlFromQueryUrl(apiUrl) {
  const queryIndex = apiUrl.indexOf('/query');
  if (queryIndex >= 0) return apiUrl.slice(0, queryIndex);
  return apiUrl.replace(/[?].*$/, '').replace(/\/$/, '');
}

function metadataUrlForLayer(apiUrl) {
  const url = new URL(layerUrlFromQueryUrl(apiUrl));
  url.search = '';
  url.searchParams.set('f', 'json');
  return url.toString();
}

function sampleUrl(apiUrl) {
  const url = new URL(apiUrl);
  url.searchParams.set('where', url.searchParams.get('where') || '1=1');
  url.searchParams.set('outFields', url.searchParams.get('outFields') || '*');
  url.searchParams.set('resultRecordCount', '1');
  url.searchParams.set('f', 'json');
  return url.toString();
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'ParkingUSA ArcGIS research inspector (local development)',
      Accept: 'application/json',
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

async function loadSources() {
  if (manifestPath) {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    return (manifest.sources ?? [])
      .filter((source) => source.portal_type === 'arcgis_rest')
      .filter((source) => !sourceNameFilter || source.source_name === sourceNameFilter);
  }

  if (!apiUrlArg) throw new Error('Use --manifest=... or --api-url=...');
  return [
    {
      source_name: sourceNameFilter ?? 'ArcGIS REST source',
      source_type: 'city_gis',
      portal_type: 'arcgis_rest',
      source_url: layerUrlFromQueryUrl(apiUrlArg),
      metadata_url: metadataUrlForLayer(apiUrlArg),
      api_url: apiUrlArg,
      parking_layers: [],
      recommended_connector: 'arcgis_rest',
      legal_risk: 'unknown_verify_license',
      confidence: 0.75,
    },
  ];
}

function scoreSource(source, metadata, sample) {
  let score = Number(source.confidence ?? 0.75);
  if (metadata.id !== undefined || metadata.name || metadata.type) score += 0.04;
  if (Array.isArray(metadata.fields) && metadata.fields.length > 0) score += 0.04;
  if (Array.isArray(sample.features) && sample.features.length > 0) score += 0.04;
  if (source.legal_risk?.startsWith('low')) score += 0.03;
  return Math.min(0.99, Number(score.toFixed(2)));
}

async function inspectSource(source) {
  const metadataUrl = source.metadata_url?.includes('/about')
    ? metadataUrlForLayer(source.api_url)
    : source.metadata_url || metadataUrlForLayer(source.api_url);
  const metadata = await fetchJson(metadataUrl);
  const sample = await fetchJson(sampleUrl(source.api_url));

  return {
    inspected_at: new Date().toISOString(),
    source_name: source.source_name,
    city: source.city ?? null,
    state: source.state ?? null,
    portal_type: 'arcgis_rest',
    source_url: source.source_url,
    metadata_url: metadataUrl,
    api_url: source.api_url,
    sample_url: sampleUrl(source.api_url),
    title: metadata.name ?? metadata.serviceItemId ?? source.source_name,
    layer_type: metadata.type ?? null,
    geometry_type: metadata.geometryType ?? null,
    object_id_field: metadata.objectIdField ?? null,
    max_record_count: metadata.maxRecordCount ?? null,
    fields: Array.isArray(metadata.fields)
      ? metadata.fields.map((field) => ({
          name: field.name,
          type: field.type,
          alias: field.alias,
        }))
      : [],
    sample_feature: Array.isArray(sample.features) ? sample.features[0] ?? null : null,
    parking_layers: source.parking_layers ?? [],
    recommended_connector: source.recommended_connector ?? 'arcgis_rest',
    legal_risk: source.legal_risk ?? 'unknown_verify_license',
    confidence: scoreSource(source, metadata, sample),
  };
}

function outputFileName(report) {
  const city = asString(report.city).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown-city';
  const source = asString(report.source_name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${city}-${source}.arcgis-inspection.json`;
}

async function persistReport(report) {
  const sourceName = asString(report.source_name);
  await prisma.dataSource.upsert({
    where: { name: sourceName },
    update: {
      type: 'city_gis:arcgis_rest',
      homepageUrl: asString(report.source_url),
      license: 'verify ArcGIS item/license metadata',
      notes: `ArcGIS REST source; connector=${report.recommended_connector}; legal_risk=${report.legal_risk}`,
    },
    create: {
      name: sourceName,
      type: 'city_gis:arcgis_rest',
      homepageUrl: asString(report.source_url),
      license: 'verify ArcGIS item/license metadata',
      notes: `ArcGIS REST source; connector=${report.recommended_connector}; legal_risk=${report.legal_risk}`,
    },
  });

  await prisma.sourceObservation.upsert({
    where: {
      sourceName_sourceId_entityType: {
        sourceName,
        sourceId: `${Buffer.from(asString(report.api_url)).toString('base64url')}:metadata`,
        entityType: 'source_metadata',
      },
    },
    update: {
      entitySourceId: asString(report.api_url),
      rawProperties: report,
      confidence: Number(report.confidence ?? 0.8),
      notes: 'Observed by deterministic ArcGIS REST inspector.',
    },
    create: {
      sourceName,
      sourceId: `${Buffer.from(asString(report.api_url)).toString('base64url')}:metadata`,
      entityType: 'source_metadata',
      entitySourceId: asString(report.api_url),
      rawProperties: report,
      confidence: Number(report.confidence ?? 0.8),
      notes: 'Observed by deterministic ArcGIS REST inspector.',
    },
  });
}

async function main() {
  const sources = await loadSources();
  await mkdir(outputDir, { recursive: true });
  const reports = [];
  for (const source of sources) {
    const report = await inspectSource(source);
    const outputPath = path.join(outputDir, outputFileName(report));
    await writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');
    if (importToDb) await persistReport(report);
    reports.push({ source_name: report.source_name, output: path.relative(root, outputPath), confidence: report.confidence });
  }
  console.log(JSON.stringify({ inspected: reports.length, reports }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

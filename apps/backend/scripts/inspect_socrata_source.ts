import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient, type Prisma } from '@prisma/client';

type JsonRecord = Record<string, unknown>;

interface ManifestSource extends JsonRecord {
  source_name: string;
  source_type: string;
  portal_type: string;
  source_url: string;
  metadata_url: string;
  api_url: string;
  parking_layers?: string[];
  recommended_connector?: string;
  legal_risk?: string;
  confidence?: number;
  city?: string;
  state?: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..', '..');
const require = createRequire(import.meta.url);
const { loadEnvConfig } = require('@next/env') as {
  loadEnvConfig: (dir: string) => void;
};
loadEnvConfig(root);

const prisma = new PrismaClient();

function argValue(name: string, fallback?: string) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

const manifestPath = argValue('--manifest');
const sourceNameFilter = argValue('--source');
const metadataUrlArg = argValue('--metadata-url');
const apiUrlArg = argValue('--api-url');
const outputDir = argValue('--out') ?? path.join(root, 'data', 'research', 'inspections');
const importToDb = process.argv.includes('--db');

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function licenseToString(value: unknown) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return 'unknown';
  const record = value as JsonRecord;
  const name = asString(record.name);
  const termsLink = asString(record.termsLink);
  if (name && termsLink) return `${name} (${termsLink})`;
  if (name) return name;
  return JSON.stringify(record);
}

function datasetIdFromMetadataUrl(url: string) {
  const match = url.match(/\/api\/views\/([^/?#]+)/);
  return match?.[1] ?? 'unknown';
}

function sampleUrl(apiUrl: string) {
  const url = new URL(apiUrl);
  if (!url.searchParams.has('$limit')) url.searchParams.set('$limit', '1');
  return url.toString();
}

function columnsFromMetadata(metadata: JsonRecord) {
  const columns = Array.isArray(metadata.columns) ? metadata.columns : [];
  return columns.map((column) => {
    const c = column as JsonRecord;
    return {
      name: c.name,
      fieldName: c.fieldName,
      dataTypeName: c.dataTypeName,
      position: c.position,
    };
  });
}

function scoreSource(source: ManifestSource, metadata: JsonRecord, sample: unknown[]) {
  let score = Number(source.confidence ?? 0.75);
  if (metadata.id) score += 0.04;
  if (columnsFromMetadata(metadata).length > 0) score += 0.04;
  if (sample.length > 0) score += 0.04;
  if (source.legal_risk?.startsWith('low')) score += 0.03;
  return Math.min(0.99, Number(score.toFixed(2)));
}

async function fetchJson(url: string) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'ParkingUSA research inspector (local development)',
          Accept: 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}: ${url}`);
      }
      return (await response.json()) as unknown;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
      }
    }
  }
  throw lastError;
}

async function loadManifestSources(): Promise<ManifestSource[]> {
  if (manifestPath) {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as JsonRecord;
    const sources = Array.isArray(manifest.sources) ? manifest.sources : [];
    return sources
      .map((source) => source as ManifestSource)
      .filter((source) => source.portal_type === 'socrata')
      .filter((source) => !sourceNameFilter || source.source_name === sourceNameFilter);
  }

  if (!metadataUrlArg || !apiUrlArg) {
    throw new Error('Use --manifest=... or both --metadata-url=... and --api-url=...');
  }

  return [
    {
      source_name: sourceNameFilter ?? `Socrata ${datasetIdFromMetadataUrl(metadataUrlArg)}`,
      source_type: 'city_open_data',
      portal_type: 'socrata',
      source_url: metadataUrlArg.replace('/api/views/', '/'),
      metadata_url: metadataUrlArg,
      api_url: apiUrlArg,
      parking_layers: [],
      recommended_connector: 'socrata',
      legal_risk: 'unknown_verify_license',
      confidence: 0.75,
    },
  ];
}

async function inspectSource(source: ManifestSource) {
  const metadata = (await fetchJson(source.metadata_url)) as JsonRecord;
  const sample = (await fetchJson(sampleUrl(source.api_url))) as unknown[];
  const columns = columnsFromMetadata(metadata);
  const rowCount = metadata.rowsUpdatedAt || metadata.rowsUpdatedAt === 0 ? metadata.rowsUpdatedAt : null;
  const datasetId = asString(metadata.id) || datasetIdFromMetadataUrl(source.metadata_url);

  return {
    inspected_at: new Date().toISOString(),
    source_name: source.source_name,
    city: source.city ?? null,
    state: source.state ?? null,
    dataset_id: datasetId,
    portal_type: 'socrata',
    source_url: source.source_url,
    metadata_url: source.metadata_url,
    api_url: source.api_url,
    sample_url: sampleUrl(source.api_url),
    title: metadata.name ?? source.source_name,
    description: metadata.description ?? null,
    attribution: metadata.attribution ?? null,
    license: licenseToString(metadata.license ?? metadata.licenseId ?? 'unknown'),
    rows_updated_at_unix: metadata.rowsUpdatedAt ?? null,
    metadata_updated_at_unix: metadata.metadataUpdatedAt ?? null,
    created_at_unix: metadata.createdAt ?? null,
    columns,
    sample_row: sample[0] ?? null,
    parking_layers: source.parking_layers ?? [],
    recommended_connector: source.recommended_connector ?? 'socrata',
    legal_risk: source.legal_risk ?? 'unknown_verify_license',
    confidence: scoreSource(source, metadata, sample),
  };
}

function outputFileName(report: JsonRecord) {
  const city = asString(report.city).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown-city';
  const dataset = asString(report.dataset_id).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `${city}-${dataset}.socrata-inspection.json`;
}

async function persistReport(report: JsonRecord) {
  const sourceName = asString(report.source_name);
  const datasetId = asString(report.dataset_id);
  const sourceType = `city_open_data:socrata`;

  await prisma.dataSource.upsert({
    where: { name: sourceName },
    update: {
      type: sourceType,
      homepageUrl: asString(report.source_url),
      license: asString(report.license),
      notes: `Socrata dataset ${datasetId}; connector=${report.recommended_connector}; legal_risk=${report.legal_risk}`,
    },
    create: {
      name: sourceName,
      type: sourceType,
      homepageUrl: asString(report.source_url),
      license: asString(report.license),
      notes: `Socrata dataset ${datasetId}; connector=${report.recommended_connector}; legal_risk=${report.legal_risk}`,
    },
  });

  await prisma.sourceObservation.upsert({
    where: {
      sourceName_sourceId_entityType: {
        sourceName,
        sourceId: `${datasetId}:metadata`,
        entityType: 'source_metadata',
      },
    },
    update: {
      entitySourceId: datasetId,
      rawProperties: json(report),
      confidence: Number(report.confidence ?? 0.8),
      notes: 'Observed by deterministic Socrata inspector.',
    },
    create: {
      sourceName,
      sourceId: `${datasetId}:metadata`,
      entityType: 'source_metadata',
      entitySourceId: datasetId,
      rawProperties: json(report),
      confidence: Number(report.confidence ?? 0.8),
      notes: 'Observed by deterministic Socrata inspector.',
    },
  });
}

async function main() {
  const sources = await loadManifestSources();
  await mkdir(outputDir, { recursive: true });

  const reports = [];
  for (const source of sources) {
    const report = await inspectSource(source);
    const outputPath = path.join(outputDir, outputFileName(report));
    await writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');
    if (importToDb) {
      await persistReport(report);
    }
    reports.push({ source_name: report.source_name, output: path.relative(root, outputPath), confidence: report.confidence });
  }

  console.log(JSON.stringify({ inspected: reports.length, reports }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});

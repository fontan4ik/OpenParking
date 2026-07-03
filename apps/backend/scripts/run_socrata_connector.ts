import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildConnectorReport,
  buildSocrataSourceConfig,
  normalizeConnectorRecord,
  numberOrNull,
  normalizeSocrataRecord,
  persistConnectorReport,
  socrataCountUrl,
  socrataPageUrl,
  stableHash,
} from './connector_foundation';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..', '..');
const require = createRequire(import.meta.url);
const { loadEnvConfig } = require('@next/env') as { loadEnvConfig: (dir: string) => void };
loadEnvConfig(root);

function argValue(name: string, fallback?: string) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'ParkingUSA Socrata connector foundation (bounded dry-run)',
      Accept: 'application/json',
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

async function main() {
  const dryRun = process.argv.includes('--dry-run') || !process.argv.includes('--import');
  const importRequested = process.argv.includes('--import') && !process.argv.includes('--dry-run');
  const limit = Math.max(1, Math.min(100, Number(argValue('--limit', argValue('--max-records', '5')))));
  const offset = Math.max(0, Number(argValue('--offset', '0')));
  const apiUrl = argValue('--api-url', 'https://data.sfgov.org/resource/8vzz-qzz9.json')!;
  const sourceUrl = argValue('--source-url', 'https://data.sfgov.org/Transportation/Parking-Meters/8vzz-qzz9')!;
  const metadataUrl = argValue('--metadata-url', 'https://data.sfgov.org/api/views/8vzz-qzz9');
  const source = buildSocrataSourceConfig({
    sourceName: argValue('--source', 'DataSF Parking Meters connector dry-run'),
    sourceKey: argValue('--source-key', 'datasf-parking-meters-socrata-connector'),
    sourceUrl,
    apiUrl,
    metadataUrl,
    legalRisk: argValue('--legal-risk', 'low_verify_license'),
    confidence: numberOrNull(argValue('--confidence', '0.85')),
    city: argValue('--city', 'San Francisco'),
    state: argValue('--state', 'CA'),
  });

  const countUrl = socrataCountUrl(apiUrl);
  const pageUrl = socrataPageUrl(apiUrl, limit, offset);
  let countBody: unknown = [];
  let rowsBody: unknown = [];
  let fetchWarning: string | null = null;

  try {
    countBody = await fetchJson(countUrl);
    rowsBody = await fetchJson(pageUrl);
  } catch (error) {
    if (!dryRun) throw error;
    fetchWarning = `Socrata source unavailable during dry-run: ${error instanceof Error ? error.message : String(error)}`;
  }

  const totalAvailable = Array.isArray(countBody) ? numberOrNull((countBody[0] as Record<string, unknown>)?.count) : null;
  const rows = Array.isArray(rowsBody) ? rowsBody as Record<string, unknown>[] : [];
  let records = rows.map((row) => normalizeSocrataRecord(source, row, pageUrl));

  if (dryRun && fetchWarning && records.length === 0) {
    records = [normalizeConnectorRecord({
      source,
      sourceId: `socrata:connector-probe:${stableHash({ apiUrl, sourceUrl, offset, limit })}`,
      apiUrl: pageUrl,
      evidenceUrl: sourceUrl,
      priceStatus: 'unknown',
      ruleStatus: 'unknown',
      lastVerifiedAt: new Date().toISOString(),
      dataAsOf: null,
      rawProperties: {
        connector_probe: true,
        attempted_count_url: countUrl,
        attempted_page_url: pageUrl,
        warning: fetchWarning,
      },
    })];
  }

  const report = buildConnectorReport({
    connectorKey: 'socrata',
    dryRun,
    importRequested,
    source,
    records,
    recordsSeen: fetchWarning ? records.length : rows.length,
    totalAvailable,
    limit,
    pagesFetched: 1,
    nextOffset: rows.length === limit ? offset + limit : null,
    warnings: [
      ...(dryRun ? ['Dry-run mode: no DB mutation; records_inserted and records_updated remain 0.'] : []),
      ...(fetchWarning ? [fetchWarning] : []),
    ],
  });

  if (dryRun) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const persisted = await persistConnectorReport(prisma, report);
    console.log(JSON.stringify(persisted, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

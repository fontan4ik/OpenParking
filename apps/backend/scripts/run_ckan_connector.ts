import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildCkanSourceConfig,
  buildConnectorReport,
  ckanDatastoreSearchUrl,
  ckanPackageSearchUrl,
  normalizeCkanPackageRecord,
  numberOrNull,
  persistConnectorReport,
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

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    'User-Agent': 'ParkingUSA CKAN connector foundation (bounded dry-run)',
    Accept: 'application/json',
  };
  if (process.env.DATA_GOV_API_KEY) headers['x-api-key'] = process.env.DATA_GOV_API_KEY;
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json() as Promise<Record<string, unknown>>;
}

function fallbackCkanApiUrl(url: string): string | null {
  return url.includes('/api/3/action/') ? url.replace('/api/3/action/', '/api/action/') : null;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run') || !process.argv.includes('--import');
  const importRequested = process.argv.includes('--import') && !process.argv.includes('--dry-run');
  const limit = Math.max(1, Math.min(100, Number(argValue('--limit', argValue('--rows', '5')))));
  const offset = Math.max(0, Number(argValue('--offset', argValue('--start', '0'))));
  const portal = argValue('--portal', 'https://catalog.data.gov')!;
  const query = argValue('--query', 'parking')!;
  const resourceId = argValue('--resource-id');
  const apiUrl = resourceId
    ? ckanDatastoreSearchUrl(portal, resourceId, limit, offset)
    : ckanPackageSearchUrl(portal, query, limit, offset);
  let resolvedApiUrl = apiUrl;
  let body: Record<string, unknown>;
  let fetchError: string | null = null;
  try {
    body = await fetchJson(resolvedApiUrl);
  } catch (error) {
    const fallbackUrl = fallbackCkanApiUrl(resolvedApiUrl);
    if (!fallbackUrl) {
      if (dryRun) {
        fetchError = error instanceof Error ? error.message : String(error);
        body = {};
      } else {
        throw error;
      }
    } else {
      resolvedApiUrl = fallbackUrl;
      try {
        body = await fetchJson(resolvedApiUrl);
      } catch (error2) {
        if (dryRun) {
          fetchError = error2 instanceof Error ? error2.message : String(error2);
          body = {};
        } else {
          throw error2;
        }
      }
    }
  }

  const source = buildCkanSourceConfig({
    sourceName: argValue('--source', 'Data.gov parking CKAN connector dry-run'),
    sourceKey: argValue('--source-key', 'datagov-parking-ckan-connector'),
    sourceUrl: portal,
    apiUrl: resolvedApiUrl,
    metadataUrl: resolvedApiUrl,
    legalRisk: argValue('--legal-risk', 'low_verify_dataset_license'),
    confidence: numberOrNull(argValue('--confidence', '0.7')),
    city: argValue('--city', 'Miami'),
    state: argValue('--state', 'FL'),
  });

  const result = typeof body.result === 'object' && body.result ? body.result as Record<string, unknown> : {};
  const packages = Array.isArray(result.results) ? result.results as Record<string, unknown>[] : [];
  const records = packages.flatMap((pkg) => {
    const resources = Array.isArray(pkg.resources) ? pkg.resources as Record<string, unknown>[] : [];
    if (resources.length === 0) return [normalizeCkanPackageRecord(source, portal, pkg, null, resolvedApiUrl)];
    return resources.slice(0, 2).map((resource) => normalizeCkanPackageRecord(source, portal, pkg, resource, resolvedApiUrl));
  }).slice(0, limit);

  const report = buildConnectorReport({
    connectorKey: 'ckan',
    dryRun,
    importRequested,
    source,
    records,
    recordsSeen: packages.length,
    totalAvailable: numberOrNull(result.count) ?? numberOrNull(result.total),
    limit,
    pagesFetched: 1,
    nextOffset: packages.length === limit ? offset + limit : null,
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
    console.log(JSON.stringify(persisted, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

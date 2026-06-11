import { mkdir, writeFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..', '..');

function argValue(name, fallback) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

const query = argValue('--query', 'parking meter OR parking garage OR curb');
const portal = argValue('--portal', 'https://catalog.data.gov');
const rows = Number(argValue('--rows', '10'));
const outputDir = argValue('--out', path.join(root, 'data', 'research', 'inspections'));

async function fetchJson(url) {
  const headers = {
    'User-Agent': 'ParkingUSA CKAN research inspector (local development)',
    Accept: 'application/json',
  };
  if (process.env.DATA_GOV_API_KEY) {
    headers['x-api-key'] = process.env.DATA_GOV_API_KEY;
  }
  const response = await fetch(url, {
    headers,
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

function searchUrl() {
  const url = new URL('/api/3/action/package_search', portal);
  url.searchParams.set('q', query);
  url.searchParams.set('rows', String(rows));
  return url.toString();
}

function fallbackSearchUrl() {
  const url = new URL('/api/action/package_search', portal);
  url.searchParams.set('q', query);
  url.searchParams.set('rows', String(rows));
  return url.toString();
}

function scoreResult(pkg) {
  const text = `${pkg.title ?? ''} ${pkg.notes ?? ''} ${(pkg.tags ?? []).map((tag) => tag.name).join(' ')}`.toLowerCase();
  let score = 0.45;
  for (const token of ['parking', 'meter', 'curb', 'garage', 'lot', 'occupancy', 'rate', 'regulation']) {
    if (text.includes(token)) score += 0.05;
  }
  if ((pkg.resources ?? []).some((resource) => /json|csv|geojson|api|arcgis|socrata/i.test(`${resource.format ?? ''} ${resource.url ?? ''}`))) {
    score += 0.1;
  }
  return Math.min(0.95, Number(score.toFixed(2)));
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  let url = searchUrl();
  let body;
  try {
    body = await fetchJson(url);
  } catch (error) {
    url = fallbackSearchUrl();
    body = await fetchJson(url);
  }
  const packages = body.result?.results ?? [];
  const report = {
    inspected_at: new Date().toISOString(),
    portal_type: 'ckan',
    portal,
    query,
    search_url: url,
    result_count: body.result?.count ?? packages.length,
    sources: packages.map((pkg) => ({
      source_name: pkg.title ?? pkg.name,
      source_type: 'open_data_catalog_record',
      portal_type: 'ckan',
      source_url: new URL(`/dataset/${pkg.name}`, portal).toString(),
      api_url: new URL(`/api/3/action/package_show?id=${encodeURIComponent(pkg.name)}`, portal).toString(),
      organization: pkg.organization?.title ?? pkg.organization?.name ?? null,
      license: pkg.license_title ?? pkg.license_id ?? 'unknown',
      tags: (pkg.tags ?? []).map((tag) => tag.display_name ?? tag.name),
      resources: (pkg.resources ?? []).map((resource) => ({
        name: resource.name,
        format: resource.format,
        url: resource.url,
      })),
      recommended_connector: 'ckan_dataset_inspector',
      legal_risk: 'verify_dataset_license',
      confidence: scoreResult(pkg),
    })),
  };

  const hash = crypto.createHash('sha1').update(`${portal}:${query}`).digest('hex').slice(0, 10);
  const outputPath = path.join(outputDir, `ckan-${hash}.inspection.json`);
  await writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ inspected: report.sources.length, output: path.relative(root, outputPath) }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..', '..');

const inventoryPath =
  process.argv[2] ??
  path.join(root, 'data', 'research', 'phase6-source-inventory-20260610.json');
const outputDir = process.argv[3] ?? path.join(root, 'data', 'research', 'cities');

function slugCity(city, state) {
  return `${city.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.${state.toLowerCase()}.json`;
}

function evidenceForSource(source) {
  return [
    source.source_url && { url: source.source_url, claim: 'Source landing page discovered in Phase 6 research.' },
    source.metadata_url && { url: source.metadata_url, claim: 'Machine-readable metadata endpoint.' },
    source.api_url && { url: source.api_url, claim: 'Machine-readable API/query endpoint.' },
  ].filter(Boolean);
}

function sourceToManifestSource(city, state, source) {
  return {
    ...source,
    city,
    state,
    evidence: source.evidence ?? evidenceForSource(source),
    field_mapping: source.field_mapping ?? null,
    parser_spec_required: Boolean(
      source.recommended_connector?.includes('parser') ||
        source.recommended_connector?.includes('browser') ||
        source.portal_type === 'html'
    ),
    ingestion_status: source.portal_type === 'socrata' ? 'ready_for_inspection' : 'research_only',
  };
}

async function main() {
  const inventory = JSON.parse(await readFile(inventoryPath, 'utf8'));
  await mkdir(outputDir, { recursive: true });

  const written = [];
  for (const city of inventory.cities ?? []) {
    const manifest = {
      generated_at: new Date().toISOString(),
      source_inventory: path.relative(root, inventoryPath),
      city: city.city,
      state: city.state,
      sources: (city.sources ?? []).map((source) =>
        sourceToManifestSource(city.city, city.state, source)
      ),
      gaps: [],
      acceptance: {
        direct_source_urls_required: true,
        api_sources_require_api_url: true,
        parser_sources_require_parser_spec_before_ingestion: true,
        non_official_sources_require_legal_risk: true,
      },
    };

    const filePath = path.join(outputDir, slugCity(city.city, city.state));
    await writeFile(filePath, JSON.stringify(manifest, null, 2), 'utf8');
    written.push(path.relative(root, filePath));
  }

  console.log(JSON.stringify({ city_manifests_written: written.length, files: written }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

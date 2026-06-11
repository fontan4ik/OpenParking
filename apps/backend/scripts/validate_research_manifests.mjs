import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..', '..');
const manifestsDir = process.argv[2] ?? path.join(root, 'data', 'research', 'cities');
const parserSpecsPath = process.argv[3] ?? path.join(root, 'data', 'research', 'phase6-parser-specs-20260610.json');

function issue(file, source, severity, message) {
  return {
    file: path.relative(root, file),
    source: source?.source_name ?? null,
    severity,
    message,
  };
}

async function loadParserSpecNames() {
  try {
    const report = JSON.parse(await readFile(parserSpecsPath, 'utf8'));
    return new Set((report.parser_specs ?? []).map((spec) => spec.source_name));
  } catch {
    return new Set();
  }
}

function validateSource(file, source, parserSpecNames) {
  const issues = [];
  const required = [
    'source_name',
    'source_type',
    'portal_type',
    'source_url',
    'parking_layers',
    'recommended_connector',
    'legal_risk',
    'confidence',
  ];

  for (const field of required) {
    const value = source[field];
    if (value === undefined || value === null || value === '') {
      issues.push(issue(file, source, 'error', `missing ${field}`));
    }
  }

  if (['socrata', 'arcgis_rest'].includes(source.portal_type) && !source.api_url) {
    issues.push(issue(file, source, 'error', 'API source missing api_url'));
  }

  if (source.portal_type === 'socrata' && !source.metadata_url) {
    issues.push(issue(file, source, 'error', 'Socrata source missing metadata_url'));
  }

  if (!Array.isArray(source.evidence) || source.evidence.length === 0) {
    issues.push(issue(file, source, 'error', 'structured evidence[] missing'));
  }

  if (source.parser_spec_required && !source.parser_spec && !parserSpecNames.has(source.source_name)) {
    issues.push(issue(file, source, 'warn', 'parser source needs parser_spec before ingestion'));
  }

  if (Number(source.confidence) < 0.75) {
    issues.push(issue(file, source, 'warn', `low confidence ${source.confidence}`));
  }

  if (!source.field_mapping && source.ingestion_status === 'ready_for_ingestion') {
    issues.push(issue(file, source, 'error', 'ingestion-ready source missing field_mapping'));
  }

  return issues;
}

async function main() {
  const parserSpecNames = await loadParserSpecNames();
  const files = (await readdir(manifestsDir))
    .filter((file) => file.endsWith('.json'))
    .map((file) => path.join(manifestsDir, file));

  const issues = [];
  let sourceCount = 0;
  for (const file of files) {
    const manifest = JSON.parse(await readFile(file, 'utf8'));
    const sources = manifest.sources ?? [];
    sourceCount += sources.length;
    for (const source of sources) {
      issues.push(...validateSource(file, source, parserSpecNames));
    }
  }

  const errors = issues.filter((item) => item.severity === 'error');
  const warnings = issues.filter((item) => item.severity === 'warn');
  console.log(
    JSON.stringify(
      {
        manifests: files.length,
        sources: sourceCount,
        errors: errors.length,
        warnings: warnings.length,
        issues,
      },
      null,
      2
    )
  );

  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

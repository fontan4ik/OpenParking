import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..', '..');
const manifestsDir = process.argv[2] ?? path.join(root, 'data', 'research', 'cities');
const outputDir = process.argv[3] ?? path.join(root, 'data', 'research');

const allLayers = [
  'street_meters',
  'street_meter_rules',
  'curb_rules',
  'curb_geometry',
  'garages_lots',
  'valet',
  'airport_event',
  'monthly',
  'ev_accessibility',
  'private_customer_only',
  'availability',
  'rates',
];

function parserSpec(source) {
  const browserEvidence =
    source.source_name === 'ParkChicago Rates and Hours'
      ? {
          browser_evidence_artifacts: [
            'data/research/browser-parkchicago-rates.snapshot.txt',
            'data/research/browser-parkchicago-rates.png',
            'data/research/browser-parkchicago-rates.parser-hints.json',
          ],
          browser_observations: [
            'Rendered page states Chicago Parking Meters is the official operator of 36,000 on-street parking spaces.',
            'Rendered page exposes rate bands for neighborhoods, Central Business District, West Loop, and Loop.',
            'Rendered page includes a rate map iframe and monthly parking permit content/link, so browser inspection is required before production parser implementation.',
          ],
        }
      : {};

  return {
    source_name: source.source_name,
    source_type: source.source_type,
    source_url: source.source_url,
    target_urls: [source.source_url].filter(Boolean),
    crawl_or_search_flow:
      source.recommended_connector?.includes('browser')
        ? 'Open landing page, inspect rendered cards and network calls, then record repeatable location/date-time flow.'
        : 'Fetch landing page, extract relevant parking tables/links/text, and follow official links only.',
    static_or_browser_required: source.recommended_connector?.includes('browser') ? 'browser' : 'static_first',
    selectors_or_network_endpoints: [],
    fields_to_extract: [
      'name',
      'address',
      'coordinates_or_zone',
      'facility_type',
      'valet_flag',
      'rates',
      'hours',
      'booking_url',
      'phone',
      'operator',
      'amenities',
      'restrictions',
    ],
    date_time_scenarios: ['now', 'weekday_morning', 'weekday_evening', 'weekend', 'overnight', 'event', 'monthly'],
    pagination_or_location_strategy: 'Document after first browser/static inspection.',
    dedupe_keys: ['normalized_address', 'name', 'operator', 'phone', 'website', 'coordinate_proximity'],
    evidence_capture: ['raw_html_or_markdown', 'screenshot_if_browser', 'network_metadata_if_browser', 'content_hash', 'observed_at'],
    refresh_cadence: 'weekly for prices/rates, monthly for existence, faster for event/airport pages when used in product.',
    legal_tos_risk: source.legal_risk ?? 'verify_terms',
    parser_failure_signals: ['no expected text/cards', 'status_not_200', 'selector_miss', 'network_endpoint_changed', 'captcha_or_block'],
    fallback_path: ['partner_or_outreach', 'ai_call_for_high_value_gap', 'manual_review', 'user_report'],
    ...browserEvidence,
  };
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const files = (await readdir(manifestsDir)).filter((file) => file.endsWith('.json'));
  const manifests = [];
  for (const file of files) {
    manifests.push(JSON.parse(await readFile(path.join(manifestsDir, file), 'utf8')));
  }

  const coverage = manifests.map((manifest) => {
    const covered = new Set((manifest.sources ?? []).flatMap((source) => source.parking_layers ?? []));
    const sourceTypes = new Set((manifest.sources ?? []).map((source) => source.portal_type));
    return {
      city: manifest.city,
      state: manifest.state,
      source_count: manifest.sources?.length ?? 0,
      source_types: [...sourceTypes],
      covered_layers: [...covered],
      missing_layers: allLayers.filter((layer) => !covered.has(layer)),
      parser_required_sources: (manifest.sources ?? []).filter((source) => source.parser_spec_required).map((source) => source.source_name),
      coverage_status: covered.size >= 4 ? 'benchmark_started' : 'needs_more_sources',
    };
  });

  const parserSpecs = manifests.flatMap((manifest) =>
    (manifest.sources ?? [])
      .filter((source) => source.parser_spec_required)
      .map((source) => ({
        city: manifest.city,
        state: manifest.state,
        ...parserSpec(source),
      }))
  );

  const gapWorkflows = manifests.map((manifest) => ({
    city: manifest.city,
    state: manifest.state,
    workflow: [
      'Compare current city manifest against OSM/osm2pgsql parking objects for the city boundary.',
      'Compare against official city portal searches for parking, meter, curb, valet, garage, lot, airport, event, and monthly terms.',
      'Compare against operator/public pages and record parser specs for lawful public sources.',
      'Create browser-agent recipes for dynamic pages and date/time pricing only after static fetch is insufficient.',
      'Queue partner/outreach for risky or unstable sources.',
      'Queue AI call/manual review for high-value stale, missing, conflicting, valet, monthly, event, airport, or venue facts.',
    ],
  }));

  const coveragePath = path.join(outputDir, 'phase6-coverage-estimate-20260610.json');
  const parserSpecPath = path.join(outputDir, 'phase6-parser-specs-20260610.json');
  const gapPath = path.join(outputDir, 'phase6-gap-workflows-20260610.json');
  await writeFile(coveragePath, JSON.stringify({ generated_at: new Date().toISOString(), all_layers: allLayers, cities: coverage }, null, 2), 'utf8');
  await writeFile(parserSpecPath, JSON.stringify({ generated_at: new Date().toISOString(), parser_specs: parserSpecs }, null, 2), 'utf8');
  await writeFile(gapPath, JSON.stringify({ generated_at: new Date().toISOString(), workflows: gapWorkflows }, null, 2), 'utf8');

  console.log(
    JSON.stringify(
      {
        coverage: path.relative(root, coveragePath),
        parser_specs: path.relative(root, parserSpecPath),
        gap_workflows: path.relative(root, gapPath),
        parser_spec_count: parserSpecs.length,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

/**
 * Reconcile OSM parking features against the local fallback extract.
 *
 * The audit uses the official bounded OSM API only for small grid tiles and
 * delegates XML -> GeoJSON conversion to osmtogeojson. It therefore preserves
 * ways, relations, multipolygons and tainted geometry instead of replacing
 * every parking area with a guessed centroid.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMParser } from '@xmldom/xmldom';
import osmtogeojson from 'osmtogeojson';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const OSM_API = 'https://api.openstreetmap.org/api/0.6/map';
const DEFAULT_BBOX = [-80.174, 25.743, -80.113, 25.888]; // west,south,east,north

function argValue(name, fallback) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function parseBbox(value) {
  const parts = String(value).split(',').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    throw new Error('--bbox must be west,south,east,north');
  }
  const [west, south, east, north] = parts;
  if (!(west < east && south < north)) throw new Error('--bbox must satisfy west<east and south<north');
  return parts;
}

function splitBbox(bbox, rows, cols) {
  const [west, south, east, north] = bbox;
  const lonStep = (east - west) / cols;
  const latStep = (north - south) / rows;
  const tiles = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      tiles.push([
        west + col * lonStep,
        south + row * latStep,
        west + (col + 1) * lonStep,
        south + (row + 1) * latStep,
      ]);
    }
  }
  return tiles;
}

function isParkingFeature(feature) {
  const tags = feature.properties?.tags ?? {};
  return isDedicatedParkingTags(tags);
}

function isDedicatedParkingTags(tags) {
  const amenity = String(tags.amenity ?? '');
  if (['parking', 'parking_entrance', 'parking_space'].includes(amenity)) return true;

  const parking = String(tags.parking ?? '').toLowerCase();
  if (!parking || parking === 'yes') return false;
  const describesAnotherObject = [
    'amenity',
    'building',
    'leisure',
    'tourism',
    'shop',
    'office',
    'sport',
    'landuse',
    'natural',
    'healthcare',
  ].some((key) => Boolean(tags[key]));
  if (describesAnotherObject) return false;

  return new Set([
    'surface',
    'multi-storey',
    'underground',
    'rooftop',
    'street_side',
    'lane',
    'carports',
    'garage_boxes',
  ]).has(parking);
}

function parkingKind(feature) {
  const tags = feature.properties?.tags ?? {};
  if (tags.amenity === 'parking_entrance') return 'parking_entrance_evidence';
  if (tags.amenity === 'parking_space') return 'parking_space_evidence';
  if (tags.amenity === 'parking') return 'parking_area_candidate';
  if (tags.parking) return 'parking_tag_candidate';
  return 'parking_evidence';
}

function coordinates(feature) {
  const values = [];
  const walk = (value) => {
    if (Array.isArray(value) && typeof value[0] === 'number' && typeof value[1] === 'number') {
      values.push(value);
      return;
    }
    if (Array.isArray(value)) value.forEach(walk);
  };
  walk(feature.geometry?.coordinates);
  return values;
}

function representativePoint(feature) {
  const points = coordinates(feature);
  if (points.length === 0) return null;
  return [
    points.reduce((sum, point) => sum + point[0], 0) / points.length,
    points.reduce((sum, point) => sum + point[1], 0) / points.length,
  ];
}

function pointInBbox(point, bbox) {
  return point && point[0] >= bbox[0] && point[0] <= bbox[2] && point[1] >= bbox[1] && point[1] <= bbox[3];
}

function distanceMeters(a, b) {
  const lngScale = 111_320 * Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * lngScale, (a[1] - b[1]) * 110_540);
}

async function fetchTile(bbox) {
  const query = new URLSearchParams({ bbox: bbox.join(',') });
  const response = await fetch(`${OSM_API}?${query}`, {
    headers: { 'user-agent': 'OpenParking bounded OSM coverage audit' },
  });
  if (!response.ok) throw new Error(`OSM API ${response.status} ${response.statusText}`);
  const xml = await response.text();
  return osmtogeojson(new DOMParser().parseFromString(xml, 'text/xml'), { flatProperties: false });
}

async function loadCoverage(paths) {
  const collections = [];
  const missing = [];
  for (const relative of paths) {
    const file = path.resolve(ROOT, relative);
    try {
      const collection = JSON.parse(await fs.readFile(file, 'utf8'));
      if (collection.metadata?.complete === false && collection.metadata?.review_only !== true) {
        missing.push({ file: relative, reason: 'incomplete_metadata' });
        continue;
      }
      collections.push({ file: relative, collection });
    } catch {
      missing.push({ file: relative, reason: 'missing_or_invalid_file' });
    }
  }
  return { collections, missing };
}

function localCandidates(collections) {
  const result = [];
  for (const { file, collection } of collections) {
    for (const feature of collection.features ?? []) {
      const sourceId = String(feature.properties?.source_id ?? '');
      const point = representativePoint(feature);
      if (!sourceId.startsWith('osm:') || !point) continue;
      result.push({ sourceId, point, file });
    }
  }
  return result;
}

function candidateFeature(feature) {
  const properties = feature.properties ?? {};
  const tags = properties.tags ?? {};
  const sourceId = `osm:${properties.type}:${properties.id}`;
  const kind = parkingKind(feature);
  const ordinaryOffer = kind === 'parking_area_candidate' || kind === 'parking_tag_candidate';
  return {
    type: 'Feature',
    geometry: feature.geometry,
    properties: {
      source_id: sourceId,
      source_name: 'OpenStreetMap bounded basemap reconciliation',
      name: tags.name || tags.operator || (ordinaryOffer ? 'Unnamed OSM parking candidate' : 'OSM parking evidence'),
      facility_type: tags.parking || tags.amenity || 'parking',
      parking_evidence_kind: kind,
      access: tags.access || '',
      fee: tags.fee || 'unknown',
      operator: tags.operator || '',
      source_url: `https://www.openstreetmap.org/${properties.type}/${properties.id}`,
      api_url: OSM_API,
      evidence_url: `https://www.openstreetmap.org/${properties.type}/${properties.id}`,
      osm_type: properties.type,
      osm_id: properties.id,
      existence_status: 'candidate',
      price_status: 'unknown',
      rule_status: 'unknown',
      enrichment_status: 'needs_review',
      needs_enrichment: true,
      confidence: ordinaryOffer ? 0.55 : 0.35,
      ordinary_parking_status: ordinaryOffer ? 'unknown_pending_access_rule_check' : 'not_ordinary_parking_offer',
      field_conflict_status: 'needs_field_review',
      confidence_reason: ordinaryOffer
        ? 'OSM parking area reconciled from the basemap; public access and rules require verification.'
        : 'OSM parking-related evidence reconciled from the basemap; this is not a verified ordinary parking offer.',
      tainted: Boolean(properties.tainted),
      raw_tags: tags,
      raw_properties: properties,
    },
  };
}

async function main() {
  if (hasFlag('--sanitize-existing-candidates')) {
    const candidatePath = path.resolve(ROOT, argValue('--candidate-file', 'data/miami_beach_osm_basemap_candidates.geojson'));
    const collection = JSON.parse(await fs.readFile(candidatePath, 'utf8'));
    const before = Array.isArray(collection.features) ? collection.features.length : 0;
    collection.features = (collection.features ?? []).filter((feature) => {
      const properties = feature.properties ?? {};
      const tags = properties.raw_tags ?? properties.raw_properties?.tags ?? {};
      return properties.parking_evidence_kind !== 'parking_tag_candidate' || isDedicatedParkingTags(tags);
    });
    collection.metadata = {
      ...(collection.metadata ?? {}),
      count: collection.features.length,
      sanitized_at: new Date().toISOString(),
      incidental_parent_features_removed: before - collection.features.length,
    };
    await fs.writeFile(candidatePath, JSON.stringify(collection, null, 2), 'utf8');
    console.log(JSON.stringify({ candidate_file: candidatePath, before, after: collection.features.length, removed: before - collection.features.length }));
    return;
  }

  const bbox = parseBbox(argValue('--bbox', DEFAULT_BBOX.join(',')));
  const rows = Number(argValue('--rows', '6'));
  const cols = Number(argValue('--cols', '6'));
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) throw new Error('--rows/--cols must be positive integers');
  const requestedCoverage = process.argv.filter((arg) => arg.startsWith('--coverage=')).map((arg) => arg.slice('--coverage='.length));
  const coveragePaths = requestedCoverage.length > 0 ? requestedCoverage : ['data/miami_parking_osm.geojson'];
  const { collections, missing: missingCoverageFiles } = await loadCoverage(coveragePaths);
  const localAll = localCandidates(collections);
  const local = localAll.filter((candidate) => pointInBbox(candidate.point, bbox));
  const localIds = new Set(local.map((candidate) => candidate.sourceId));
  const tiles = splitBbox(bbox, rows, cols);
  const features = [];
  const failedTiles = [];

  for (const [index, tile] of tiles.entries()) {
    try {
      const collection = await fetchTile(tile);
      for (const feature of collection.features ?? []) {
        if (isParkingFeature(feature)) features.push(feature);
      }
      console.log(`OSM parking tile ${index + 1}/${tiles.length}: ${features.length} features`);
    } catch (error) {
      failedTiles.push({ tile: index + 1, bbox: tile, error: String(error) });
      console.warn(`OSM parking tile ${index + 1}/${tiles.length} failed: ${String(error)}`);
    }
  }

  const uniqueFeatures = [...new Map(features.map((feature) => [`${feature.properties?.type}:${feature.properties?.id}`, feature])).values()];
  const missing = uniqueFeatures.filter((feature) => {
    const sourceId = `osm:${feature.properties?.type}:${feature.properties?.id}`;
    return !localIds.has(sourceId);
  });
  const physicalMissing = missing.filter((feature) => ['parking_area_candidate', 'parking_tag_candidate'].includes(parkingKind(feature)));
  const evidenceMissing = missing.filter((feature) => !['parking_area_candidate', 'parking_tag_candidate'].includes(parkingKind(feature)));

  const report = {
    generated_at: new Date().toISOString(),
    method: 'grid_live_osm_api_to_local_fallback_exact_osm_id_reconciliation',
    bbox,
    grid: { rows, cols, requested_tiles: tiles.length, failed_tiles: failedTiles },
    coverage_complete: failedTiles.length === 0,
    reconciliation_status: failedTiles.length === 0 ? 'complete' : 'incomplete_live_sweep',
    coverage_files: collections.map(({ file }) => file),
    incomplete_or_missing_coverage_files: missingCoverageFiles,
    osm_parking_features: uniqueFeatures.length,
    osm_parking_areas: uniqueFeatures.filter((feature) => ['parking_area_candidate', 'parking_tag_candidate'].includes(parkingKind(feature))).length,
    osm_parking_evidence: uniqueFeatures.filter((feature) => !['parking_area_candidate', 'parking_tag_candidate'].includes(parkingKind(feature))).length,
    local_osm_candidates: localAll.length,
    local_osm_candidates_in_bbox: local.length,
    // Partial sweeps cannot establish a global missing count. Keep the
    // feature sample for diagnostics, but make aggregate claims explicit.
    missing_from_fallback: failedTiles.length === 0 ? missing.length : null,
    missing_physical_parking: failedTiles.length === 0 ? physicalMissing.length : null,
    missing_evidence_only: failedTiles.length === 0 ? evidenceMissing.length : null,
    missing: missing.map((feature) => ({
      source_id: `osm:${feature.properties?.type}:${feature.properties?.id}`,
      kind: parkingKind(feature),
      geometry_type: feature.geometry?.type,
      tags: feature.properties?.tags ?? {},
    })),
  };

  const output = path.resolve(ROOT, argValue('--output', 'data/research/miami-osm-basemap-coverage-report.json'));
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2), 'utf8');

  const writePath = argValue('--write-missing-candidates', '');
  if (writePath) {
    const candidateOutput = path.resolve(ROOT, writePath);
    await fs.mkdir(path.dirname(candidateOutput), { recursive: true });
    let existingFeatures = [];
    try {
      const existing = JSON.parse(await fs.readFile(candidateOutput, 'utf8'));
      existingFeatures = Array.isArray(existing.features) ? existing.features : [];
    } catch {
      // The first run has no candidate file yet.
    }
    const currentIds = new Set(uniqueFeatures.map((feature) => `osm:${feature.properties?.type}:${feature.properties?.id}`));
    const merged = new Map();
    for (const feature of existingFeatures) {
      const sourceId = String(feature.properties?.source_id ?? '');
      // A partial live sweep must never prune candidates from tiles that
      // failed (for example because the OSM API returned 509). Keep the
      // previous set intact until a complete sweep can replace it.
      if (failedTiles.length > 0 || currentIds.has(sourceId)) merged.set(sourceId, feature);
    }
    for (const feature of missing) {
      merged.set(`osm:${feature.properties?.type}:${feature.properties?.id}`, candidateFeature(feature));
    }
    const candidateFeatures = [...merged.values()];
    const candidateCollection = {
      type: 'FeatureCollection',
      metadata: {
        scope: 'grid OSM basemap reconciliation candidates',
        source: OSM_API,
        bbox,
        grid: { rows, cols, requested_tiles: tiles.length, failed_tiles: failedTiles },
        complete: failedTiles.length === 0,
        generated_at: report.generated_at,
        count: candidateFeatures.length,
        review_only: true,
      },
      features: candidateFeatures,
    };
    if (failedTiles.length === 0 || existingFeatures.length === 0) {
      await fs.writeFile(candidateOutput, JSON.stringify(candidateCollection, null, 2), 'utf8');
      console.log(candidateOutput);
    } else {
      console.warn(`Skipping candidate replacement because ${failedTiles.length} OSM tiles failed; existing candidate file preserved.`);
    }
  }
  console.log(JSON.stringify({ osm: uniqueFeatures.length, missing: report.missing_from_fallback, physical_missing: report.missing_physical_parking, failed_tiles: failedTiles.length }));
  console.log(output);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

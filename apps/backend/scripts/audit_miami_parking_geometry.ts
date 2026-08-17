import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  isParkingAreaGeometryReferenceFeature,
  loadCurbSegments,
  loadZones,
  type GeoJSONCollection,
  type GeoJSONFeature,
} from '../../frontend/lib/data-loader';
import {
  areasFromCollection,
  assessCurbGeometryQuality,
  roadLinesFromCollection,
  type CurbGeometryQualityResult,
} from '../../frontend/lib/parking-geometry-quality';

type Bbox = [number, number, number, number]; // south,west,north,east

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..', '..');
const reportPath = path.join(root, 'data', 'research', 'miami-parking-geometry-quality-report.json');
const cachePath = path.join(root, 'data', 'research', 'fetches', 'miami-osm-roads-buildings-cache.geojson');

const defaultBbox: Bbox = [25.743, -80.174, 25.888, -80.113];

function argValue(name: string, fallback = '') {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function parseBbox(value: string): Bbox {
  const parts = value.split(',').map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    throw new Error('--bbox must be south,west,north,east');
  }
  const [south, west, north, east] = parts;
  if (!(south < north && west < east)) throw new Error('--bbox must satisfy south<north and west<east');
  return [south, west, north, east];
}

function splitBbox(bbox: Bbox, rows: number, cols: number): Bbox[] {
  const [south, west, north, east] = bbox;
  const latStep = (north - south) / rows;
  const lngStep = (east - west) / cols;
  const result: Bbox[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      result.push([
        south + row * latStep,
        west + col * lngStep,
        south + (row + 1) * latStep,
        west + (col + 1) * lngStep,
      ]);
    }
  }
  return result;
}

function overpassQuery(bbox: Bbox) {
  const [south, west, north, east] = bbox;
  const box = `${south},${west},${north},${east}`;
  return `
[out:json][timeout:45];
(
  way["highway"](${box});
  way["building"](${box});
);
out tags geom;
`;
}

async function fetchOverpassTile(bbox: Bbox) {
  const query = overpassQuery(bbox);
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];
  let lastError = '';
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'user-agent': 'OpenParking geometry QA cache refresh',
        },
        body: new URLSearchParams({ data: query }),
      });
      if (response.ok) {
        return response.json() as Promise<{ elements?: Array<Record<string, unknown>> }>;
      }
      lastError = `${endpoint} returned ${response.status} ${response.statusText}: ${(await response.text()).slice(0, 240)}`;
    } catch (error) {
      lastError = `${endpoint} failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  throw new Error(lastError);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOverpassTileWithRetry(bbox: Bbox, attempts = 3) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetchOverpassTile(bbox);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(1000 * attempt);
    }
  }
  throw lastError;
}

function wayFeature(element: Record<string, unknown>): GeoJSONFeature | null {
  const geometry = element.geometry;
  if (!Array.isArray(geometry)) return null;
  const coordinates = geometry
    .map((point) => {
      if (!point || typeof point !== 'object') return null;
      const lat = Number((point as Record<string, unknown>).lat);
      const lon = Number((point as Record<string, unknown>).lon);
      return Number.isFinite(lat) && Number.isFinite(lon) ? [lon, lat] : null;
    })
    .filter((point): point is [number, number] => point !== null);
  if (coordinates.length < 2) return null;

  const tags = (element.tags && typeof element.tags === 'object' ? element.tags : {}) as Record<string, unknown>;
  const isBuilding = typeof tags.building === 'string';
  const highway = typeof tags.highway === 'string' ? tags.highway : '';
  const excludedRoadClasses = new Set(['footway', 'path', 'steps', 'cycleway', 'corridor', 'elevator', 'proposed', 'construction']);
  if (!isBuilding && (!highway || excludedRoadClasses.has(highway))) return null;
  const closed =
    coordinates.length >= 4 &&
    coordinates[0][0] === coordinates[coordinates.length - 1][0] &&
    coordinates[0][1] === coordinates[coordinates.length - 1][1];

  return {
    type: 'Feature',
    geometry: isBuilding && closed
      ? { type: 'Polygon', coordinates: [coordinates] }
      : { type: 'LineString', coordinates },
    properties: {
      ...tags,
      source_name: 'OpenStreetMap Overpass',
      source_id: `osm:way:${element.id}`,
      osm_type: 'way',
      osm_id: element.id,
    },
  };
}

async function loadOrFetchOsmReference(bbox: Bbox, rows: number, cols: number, refresh: boolean): Promise<GeoJSONCollection> {
  if (!refresh) {
    try {
      return JSON.parse(await fs.readFile(cachePath, 'utf8')) as GeoJSONCollection;
    } catch {
      // Cache miss: fetch below.
    }
  }

  const seen = new Set<string>();
  const features: GeoJSONFeature[] = [];
  try {
    const existing = JSON.parse(await fs.readFile(cachePath, 'utf8')) as GeoJSONCollection;
    for (const feature of existing.features ?? []) {
      const sourceId = feature.properties?.source_id;
      if (typeof sourceId !== 'string' || seen.has(sourceId)) continue;
      seen.add(sourceId);
      features.push(feature);
    }
  } catch {
    // No checkpoint yet.
  }
  const failedTiles: Array<{ tile: number; bbox: Bbox; error: string }> = [];

  async function writeCheckpoint(complete: boolean) {
    const collection: GeoJSONCollection = {
      type: 'FeatureCollection',
      metadata: {
        source: 'OpenStreetMap Overpass roads/buildings for parking geometry QA',
        bbox,
        rows,
        cols,
        generated_at: new Date().toISOString(),
        complete,
        failed_tiles: failedTiles,
        count: features.length,
        road_count: features.filter((feature) => feature.geometry.type === 'LineString').length,
        building_count: features.filter((feature) => feature.geometry.type === 'Polygon').length,
      },
      features,
    };
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(cachePath, JSON.stringify(collection, null, 2), 'utf8');
    return collection;
  }

  for (const [index, tile] of splitBbox(bbox, rows, cols).entries()) {
    console.log(`Fetching OSM road/building tile ${index + 1}/${rows * cols}`);
    let payload: { elements?: Array<Record<string, unknown>> };
    try {
      payload = await fetchOverpassTileWithRetry(tile);
    } catch (error) {
      failedTiles.push({
        tile: index + 1,
        bbox: tile,
        error: error instanceof Error ? error.message : String(error),
      });
      await writeCheckpoint(false);
      console.warn(`Skipping OSM road/building tile ${index + 1}/${rows * cols}: ${failedTiles[failedTiles.length - 1].error}`);
      continue;
    }
    for (const element of payload.elements ?? []) {
      const feature = wayFeature(element);
      const sourceId = feature?.properties.source_id;
      if (!feature || typeof sourceId !== 'string' || seen.has(sourceId)) continue;
      seen.add(sourceId);
      features.push(feature);
    }
    await writeCheckpoint(false);
  }

  return writeCheckpoint(failedTiles.length === 0);
}

function isGeneratedCurb(feature: GeoJSONFeature) {
  const sourceId = String(feature.properties.source_id ?? '');
  return sourceId.startsWith('parking-space-row:') || sourceId.includes(':spaces:');
}

function generatedKind(feature: GeoJSONFeature) {
  const sourceId = String(feature.properties.source_id ?? '');
  if (sourceId.startsWith('parking-space-row:')) return 'parking_space_row';
  if (sourceId.includes(':spaces:')) return 'single_space_line';
  return 'other_line';
}

function loaderGeometryQualityResult(feature: GeoJSONFeature): CurbGeometryQualityResult | null {
  const status = feature.properties.geometry_quality_status;
  if (status !== 'accepted' && status !== 'needs_field_review' && status !== 'suppressed') return null;

  const reasonsValue = feature.properties.geometry_quality_reasons;
  const reasons = Array.isArray(reasonsValue)
    ? reasonsValue.filter((reason): reason is string => typeof reason === 'string')
    : [];
  const distanceValue = feature.properties.nearest_road_distance_meters;
  const angleValue = feature.properties.nearest_road_angle_delta_degrees;
  const sourceId = feature.properties.matched_road_source_id;

  return {
    status,
    reasons,
    nearestRoadDistanceMeters: typeof distanceValue === 'number' ? distanceValue : null,
    nearestRoadAngleDeltaDegrees: typeof angleValue === 'number' ? angleValue : null,
    nearestRoadSourceId: typeof sourceId === 'string' ? sourceId : null,
  };
}

function summarize(results: Array<{ feature: GeoJSONFeature; result: CurbGeometryQualityResult }>) {
  const byStatus: Record<string, number> = {};
  const byReason: Record<string, number> = {};
  const byKind: Record<string, Record<string, number>> = {};
  const sourceRoadDistances: number[] = [];
  const alignmentDisplacements: number[] = [];
  const lateralAdjustments: number[] = [];
  const officialPointFitResiduals: number[] = [];

  for (const item of results) {
    byStatus[item.result.status] = (byStatus[item.result.status] ?? 0) + 1;
    const kind = generatedKind(item.feature);
    byKind[kind] ??= {};
    byKind[kind][item.result.status] = (byKind[kind][item.result.status] ?? 0) + 1;
    for (const reason of item.result.reasons) {
      byReason[reason] = (byReason[reason] ?? 0) + 1;
    }
    const sourceRoadDistance = item.feature.properties.geometry_source_road_distance_meters;
    const alignmentDisplacement = item.feature.properties.geometry_alignment_displacement_meters;
    const lateralAdjustment = item.feature.properties.geometry_lateral_adjustment_meters;
    const officialPointFit = item.feature.properties.official_point_fit_max_meters;
    if (typeof sourceRoadDistance === 'number') sourceRoadDistances.push(sourceRoadDistance);
    if (typeof alignmentDisplacement === 'number') alignmentDisplacements.push(alignmentDisplacement);
    if (typeof lateralAdjustment === 'number') lateralAdjustments.push(lateralAdjustment);
    if (typeof officialPointFit === 'number') officialPointFitResiduals.push(officialPointFit);
  }

  const distribution = (values: number[]) => {
    if (values.length === 0) return { sample_count: 0, p95: null, max: null };
    const sorted = [...values].sort((a, b) => a - b);
    const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
    return {
      sample_count: sorted.length,
      p95: Math.round(sorted[p95Index] * 10) / 10,
      max: Math.round(sorted[sorted.length - 1] * 10) / 10,
    };
  };

  return {
    byStatus,
    byReason,
    byKind,
    alignment_metrics: {
      source_to_matched_road_meters: distribution(sourceRoadDistances),
      automatic_alignment_shift_meters: distribution(alignmentDisplacements),
      official_lateral_position_adjustment_meters: distribution(lateralAdjustments),
      official_point_to_generated_line_max_meters: distribution(officialPointFitResiduals),
    },
  };
}

async function main() {
  const bbox = parseBbox(argValue('--bbox', defaultBbox.join(',')));
  const rows = Number(argValue('--rows', '4'));
  const cols = Number(argValue('--cols', '4'));
  const limit = Number(argValue('--limit', '0'));
  const refresh = hasFlag('--refresh-osm');
  const osmReference = await loadOrFetchOsmReference(bbox, rows, cols, refresh);
  const [segments, zones] = await Promise.all([
    loadCurbSegments('miami', { parkingAreaEligibility: 'physical' }),
    loadZones('miami'),
  ]);
  const roads = roadLinesFromCollection(osmReference);
  const buildings = areasFromCollection({
    ...osmReference,
    features: osmReference.features.filter((feature) => feature.geometry.type === 'Polygon'),
  });
  const parkingAreas = areasFromCollection({
    ...zones,
    features: zones.features.filter(isParkingAreaGeometryReferenceFeature),
  });
  const candidates = segments.features
    .filter((feature) => feature.geometry.type === 'LineString')
    .filter(isGeneratedCurb);
  const sampled = limit > 0 ? candidates.slice(0, limit) : candidates;

  const results = sampled.map((feature) => {
    const auditedResult = assessCurbGeometryQuality(feature, {
      roads,
      buildings,
      parkingAreas,
      maxRoadDistanceMeters: 12,
      minRoadOffsetMeters: 0.8,
      maxParallelAngleDegrees: 18,
    });
    const loaderResult = loaderGeometryQualityResult(feature);
    const result = auditedResult.status === 'suppressed'
      ? auditedResult
      : loaderResult?.status === 'needs_field_review'
        ? loaderResult
        : auditedResult;

    return { feature, result };
  });

  const worst = results
    .filter((item) => item.result.status !== 'accepted')
    .slice(0, 100)
    .map((item) => ({
      source_id: item.feature.properties.source_id,
      name: item.feature.properties.name,
      status: item.result.status,
      reasons: item.result.reasons,
      nearest_road_distance_meters: item.result.nearestRoadDistanceMeters,
      nearest_road_angle_delta_degrees: item.result.nearestRoadAngleDeltaDegrees,
      matched_road_source_id: item.result.nearestRoadSourceId,
      source_to_matched_road_meters: item.feature.properties.geometry_source_road_distance_meters ?? null,
      automatic_alignment_shift_meters: item.feature.properties.geometry_alignment_displacement_meters ?? null,
      lateral_position_source: item.feature.properties.geometry_lateral_position_source ?? null,
      lateral_adjustment_meters: item.feature.properties.geometry_lateral_adjustment_meters ?? null,
      official_point_fit_max_meters: item.feature.properties.official_point_fit_max_meters ?? null,
      geometry_accuracy_class: item.feature.properties.geometry_accuracy_class ?? null,
      geometry: item.feature.geometry,
    }));

  const report = {
    generated_at: new Date().toISOString(),
    method: 'deterministic_road_parallel_area_intersection_check',
    city: 'miami',
    bbox,
    cache_path: path.relative(root, cachePath),
    checked_count: results.length,
    total_generated_curb_candidates: candidates.length,
    osm_reference_counts: osmReference.metadata,
    zone_parking_area_count: parkingAreas.length,
    quality_thresholds: {
      max_road_distance_meters: 12,
      min_road_offset_meters: 0.8,
      max_parallel_angle_degrees: 18,
      max_automatic_alignment_shift_meters: 15,
    },
    ...summarize(results),
    worst_examples: worst,
  };

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({
    report: path.relative(root, reportPath),
    checked_count: report.checked_count,
    total_generated_curb_candidates: report.total_generated_curb_candidates,
    byStatus: report.byStatus,
    byReason: report.byReason,
    osm_reference_counts: report.osm_reference_counts,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

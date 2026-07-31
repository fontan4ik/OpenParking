import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const outputPath = path.join(root, 'data/research/miami-parking-zone-quality-report.json');
const metersPerDegreeLat = 111_320;

const inputs = [
  {
    id: 'miami_beach_arcgis_lots',
    path: 'data/miami_beach_parking_arcgis_lots.geojson',
    semanticClass: 'physical_facility_footprint',
    sourceAuthority: 'official',
  },
  {
    id: 'miami_beach_arcgis_zones',
    path: 'data/miami_beach_parking_arcgis_zones.geojson',
    semanticClass: 'regulatory_residential_zone',
    sourceAuthority: 'official',
  },
  {
    id: 'miami_beach_arcgis_lots_zones',
    path: 'data/miami_beach_parking_arcgis_lots_zones.geojson',
    semanticClass: 'mixed_official_polygon_export',
    sourceAuthority: 'official',
  },
  {
    id: 'miami_osm_fallback',
    path: 'data/miami_parking_osm.geojson',
    semanticClass: 'osm_candidate',
    sourceAuthority: 'osm',
  },
];

function finitePair(value) {
  return Array.isArray(value) && value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1]);
}

function closeEnough(a, b) {
  return finitePair(a) && finitePair(b) && Math.abs(a[0] - b[0]) < 1e-10 && Math.abs(a[1] - b[1]) < 1e-10;
}

function flattenPolygons(feature) {
  const geometry = feature.geometry;
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [{ rings: geometry.coordinates, part: 0 }];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.map((rings, part) => ({ rings, part }));
  return [];
}

function allCoordinates(record) {
  return record.parts.flatMap((part) => part.rings.flat());
}

function bboxOfCoordinates(coordinates) {
  const xs = coordinates.map(([x]) => x);
  const ys = coordinates.map(([, y]) => y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function centroidOfCoordinates(coordinates) {
  const total = coordinates.reduce(([x, y], [nextX, nextY]) => [x + nextX, y + nextY], [0, 0]);
  return coordinates.length ? [total[0] / coordinates.length, total[1] / coordinates.length] : null;
}

function bboxOverlaps(a, b) {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

function projectedArea(ring) {
  const origin = ring[0];
  const cosLat = Math.cos((origin[1] * Math.PI) / 180);
  let area = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    const ax = (x1 - origin[0]) * 111_320 * cosLat;
    const ay = (y1 - origin[1]) * metersPerDegreeLat;
    const bx = (x2 - origin[0]) * 111_320 * cosLat;
    const by = (y2 - origin[1]) * metersPerDegreeLat;
    area += ax * by - bx * ay;
  }
  return Math.abs(area) / 2;
}

function pointInRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses = (yi > point[1]) !== (yj > point[1]);
    if (crosses && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function pointInPart(point, part) {
  if (!pointInRing(point, part.rings[0])) return false;
  return !part.rings.slice(1).some((ring) => pointInRing(point, ring));
}

function pointInRecord(point, record) {
  return record.parts.some((part) => pointInPart(point, part));
}

function orientation(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(a, b, c) {
  return Math.min(a[0], b[0]) <= c[0] && c[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= c[1] && c[1] <= Math.max(a[1], b[1]);
}

function segmentsIntersect(a, b, c, d) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) return true;
  return (Math.abs(o1) < 1e-12 && onSegment(a, b, c)) || (Math.abs(o2) < 1e-12 && onSegment(a, b, d)) || (Math.abs(o3) < 1e-12 && onSegment(c, d, a)) || (Math.abs(o4) < 1e-12 && onSegment(c, d, b));
}

function partsIntersect(a, b) {
  if (!bboxOverlaps(a.bbox, b.bbox)) return false;
  for (const point of allCoordinates(a)) if (pointInRecord(point, b)) return true;
  for (const point of allCoordinates(b)) if (pointInRecord(point, a)) return true;
  for (const ringA of a.parts.flatMap((part) => part.rings)) {
    for (let i = 1; i < ringA.length; i += 1) {
      for (const ringB of b.parts.flatMap((part) => part.rings)) {
        for (let j = 1; j < ringB.length; j += 1) if (segmentsIntersect(ringA[i - 1], ringA[i], ringB[j - 1], ringB[j])) return true;
      }
    }
  }
  return false;
}

function normalizeRecord(input, feature, index) {
  const parts = flattenPolygons(feature);
  const coordinates = parts.flatMap((part) => part.rings.flat());
  const properties = feature.properties ?? {};
  const sourceId = String(properties.source_id ?? `${input.id}:${feature.id ?? index + 1}`);
  const geometryIssues = [];
  if (parts.length > 0) {
    for (const part of parts) {
      if (!Array.isArray(part.rings) || part.rings.length === 0) geometryIssues.push('missing_rings');
      for (const ring of part.rings ?? []) {
        if (!Array.isArray(ring) || ring.length < 4) geometryIssues.push('ring_too_short');
        else if (!closeEnough(ring[0], ring[ring.length - 1])) geometryIssues.push('ring_not_closed');
        if ((ring ?? []).some((point) => !finitePair(point))) geometryIssues.push('non_finite_coordinate');
      }
    }
  }
  const areaM2 = parts.reduce((total, part) => total + (part.rings[0]?.length >= 4 ? projectedArea(part.rings[0]) : 0), 0);
  if (areaM2 < 1) geometryIssues.push('near_zero_area');
  return {
    inputId: input.id,
    path: input.path,
    sourceId,
    featureIndex: index,
    properties,
    parts,
    bbox: coordinates.length ? bboxOfCoordinates(coordinates) : null,
    centroid: centroidOfCoordinates(coordinates),
    areaM2,
    geometryIssues: [...new Set(geometryIssues)],
    semanticClass: input.semanticClass,
    sourceAuthority: input.sourceAuthority,
  };
}

function classify(record) {
  const properties = record.properties;
  if (record.inputId === 'miami_beach_arcgis_zones') return 'regulatory_residential_zone';
  if (record.inputId === 'miami_beach_arcgis_lots') return properties.SUBTYPE === 'Garage' ? 'physical_garage_footprint' : 'physical_surface_lot_footprint';
  if (record.inputId === 'miami_beach_arcgis_lots_zones') return String(properties.source_id ?? '').includes(':zones:') ? 'regulatory_residential_zone' : 'physical_facility_footprint';
  return 'osm_candidate_polygon';
}

async function readCollection(input) {
  const fullPath = path.join(root, input.path);
  const collection = JSON.parse(await fs.readFile(fullPath, 'utf8'));
  const records = (collection.features ?? []).map((feature, index) => normalizeRecord(input, feature, index));
  return { input, collection, records };
}

function summarizeInput(collection) {
  const geometryTypes = {};
  for (const feature of collection.collection.features ?? []) geometryTypes[feature.geometry?.type ?? 'null'] = (geometryTypes[feature.geometry?.type ?? 'null'] ?? 0) + 1;
  return {
    path: collection.input.path,
    featureCount: collection.collection.features?.length ?? 0,
    polygonRecordCount: collection.records.filter((record) => record.parts.length > 0).length,
    geometryTypes,
    complete: collection.collection.metadata?.complete ?? null,
    reviewOnly: collection.collection.metadata?.review_only ?? null,
    generatedAt: collection.collection.metadata?.generated_at ?? null,
  };
}

async function main() {
  const collections = await Promise.all(inputs.map(readCollection));
  const allRecords = collections.flatMap((collection) => collection.records);
  const canonicalCollections = collections.filter((collection) => ['miami_beach_arcgis_lots', 'miami_beach_arcgis_zones'].includes(collection.input.id));
  const canonicalRecords = canonicalCollections.flatMap((collection) => collection.records).filter((record) => record.parts.length > 0);
  const polygonRecords = canonicalRecords;
  const boundary = await readCollection({ id: 'miami_dade_boundary', path: 'data/boundaries/miami_dade_county_boundary.geojson', semanticClass: 'boundary', sourceAuthority: 'official' });
  const boundaryPart = boundary.records[0]?.parts[0] ?? null;

  const findings = [];
  const sourceIds = new Map();
  for (const record of canonicalRecords) {
    if (sourceIds.has(record.sourceId)) findings.push({ severity: 'high', code: 'duplicate_source_id', sourceId: record.sourceId, inputs: [sourceIds.get(record.sourceId), record.inputId] });
    sourceIds.set(record.sourceId, record.inputId);
    if (record.geometryIssues.length) findings.push({ severity: 'high', code: 'invalid_or_degenerate_geometry', sourceId: record.sourceId, inputId: record.inputId, issues: record.geometryIssues, areaM2: record.areaM2 });
    if (record.areaM2 > 1_000_000) findings.push({ severity: 'medium', code: 'unusually_large_polygon', sourceId: record.sourceId, inputId: record.inputId, areaM2: Math.round(record.areaM2) });
    if (boundaryPart && record.centroid && !pointInRing(record.centroid, boundaryPart.rings[0])) findings.push({ severity: 'medium', code: 'centroid_outside_miami_dade_boundary', sourceId: record.sourceId, inputId: record.inputId });
    const expected = classify(record);
    if (record.inputId.startsWith('miami_beach_arcgis') && expected === 'regulatory_residential_zone' && record.properties.price_status !== 'not_applicable') findings.push({ severity: 'high', code: 'regulatory_zone_has_parking_price_semantics', sourceId: record.sourceId, priceStatus: record.properties.price_status });
    if (record.inputId.startsWith('miami_beach_arcgis') && expected === 'regulatory_residential_zone' && record.properties.access !== 'regulated_residential_zone') findings.push({ severity: 'high', code: 'regulatory_zone_missing_restricted_access_semantics', sourceId: record.sourceId, access: record.properties.access });
    if (record.inputId === 'miami_beach_arcgis_zones' && (record.properties.ZONE_ == null || record.properties.ZONE_TYPE == null || record.properties.RESTRICTED_RES_TIME == null)) findings.push({ severity: 'medium', code: 'regulatory_zone_missing_upstream_rule_field', sourceId: record.sourceId, missingFields: ['ZONE_', 'ZONE_TYPE', 'RESTRICTED_RES_TIME'].filter((field) => record.properties[field] == null) });
  }

  const exactGeometry = new Map();
  for (const record of polygonRecords) {
    const fingerprint = JSON.stringify(record.parts.map((part) => part.rings));
    const prior = exactGeometry.get(fingerprint);
    if (prior) findings.push({ severity: 'medium', code: 'duplicate_geometry', sourceIds: [prior.sourceId, record.sourceId], inputIds: [prior.inputId, record.inputId] });
    else exactGeometry.set(fingerprint, record);
  }

  const lots = polygonRecords.filter((record) => ['physical_facility_footprint', 'physical_garage_footprint', 'physical_surface_lot_footprint'].includes(classify(record)));
  const regulatoryZones = polygonRecords.filter((record) => classify(record) === 'regulatory_residential_zone');
  const overlaps = [];
  for (const zone of regulatoryZones) {
    for (const lot of lots) {
      if (!partsIntersect(zone, lot)) continue;
      overlaps.push({ zoneSourceId: zone.sourceId, lotSourceId: lot.sourceId, zoneName: zone.properties.name, lotName: lot.properties.name, zoneTypeCode: zone.properties.zone_type_code ?? zone.properties.ZONE_TYPE, zoneAreaM2: Math.round(zone.areaM2), lotAreaM2: Math.round(lot.areaM2) });
    }
  }
  for (const overlap of overlaps) findings.push({ severity: 'medium', code: 'regulatory_zone_overlaps_physical_lot', ...overlap });

  const combined = collections.find((collection) => collection.input.id === 'miami_beach_arcgis_lots_zones');
  const canonicalIds = new Set(canonicalRecords.map((record) => record.sourceId));
  const combinedIds = new Set((combined?.records ?? []).filter((record) => record.parts.length > 0).map((record) => record.sourceId));
  const missingFromCombined = [...canonicalIds].filter((sourceId) => !combinedIds.has(sourceId));
  const extraInCombined = [...combinedIds].filter((sourceId) => !canonicalIds.has(sourceId));
  if (missingFromCombined.length || extraInCombined.length) findings.push({ severity: 'high', code: 'combined_official_export_mismatch', missingFromCombined, extraInCombined });

  const report = {
    generatedAt: new Date().toISOString(),
    city: 'Miami / Miami Beach / Miami-Dade fallback scope',
    method: 'read_only_polygon_geometry_semantics_overlap_audit',
    thresholds: { nearZeroAreaM2: 1, unusuallyLargePolygonM2: 1_000_000, boundaryCheck: 'all polygon vertices must be inside Miami-Dade boundary' },
    sourceSummary: collections.map(summarizeInput),
    semanticSummary: {
      physicalFacilityFootprints: lots.length,
      regulatoryResidentialZones: regulatoryZones.length,
      osmPolygonCandidates: allRecords.filter((record) => record.inputId === 'miami_osm_fallback' && record.parts.length > 0).length,
      note: 'ArcGIS layer 7 is a regulatory/residential rule layer, not evidence that the whole polygon is parkable. OSM fallback currently contains points only, so polygon coverage is absent there.',
    },
    geometrySummary: {
      polygonRecords: polygonRecords.length,
      invalidOrDegenerate: polygonRecords.filter((record) => record.geometryIssues.length > 0).length,
      zeroOrNearZeroArea: polygonRecords.filter((record) => record.geometryIssues.includes('near_zero_area')).length,
      outsideBoundary: findings.filter((finding) => finding.code === 'centroid_outside_miami_dade_boundary').length,
    },
    exportConsistency: { canonicalLayer5And7Records: canonicalIds.size, combinedExportRecords: combinedIds.size, missingFromCombined, extraInCombined },
    overlapSummary: { regulatoryZonesOverlappingPhysicalLots: overlaps.length, examples: overlaps.slice(0, 100) },
    findingSummary: findings.reduce((summary, finding) => { summary[finding.severity] = (summary[finding.severity] ?? 0) + 1; summary.byCode[finding.code] = (summary.byCode[finding.code] ?? 0) + 1; return summary; }, { high: 0, medium: 0, low: 0, byCode: {} }),
    findings,
    limitations: [
      'This audit checks local fallback fixtures and does not claim live PostGIS completeness.',
      'The current Miami OSM fallback has zero polygon features and metadata complete=false with failed tiles; OSM zones outside official Miami Beach polygons remain unaudited.',
      'Overlap detection is planar and conservative; it identifies intersections and duplicates but does not replace parcel-level or field verification.',
    ],
  };
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ report: path.relative(root, outputPath), polygonRecords: report.geometrySummary.polygonRecords, findings: report.findingSummary, overlaps: overlaps.length }, null, 2));
}

await main();

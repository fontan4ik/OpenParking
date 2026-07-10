import type { GeoJSONCollection, GeoJSONFeature } from '@/lib/data-loader';

export type Coordinate = [number, number];

export type PolygonArea = {
  bbox: [number, number, number, number];
  rings: Coordinate[][];
  sourceId?: string;
};

export type RoadLine = {
  coordinates: Coordinate[];
  sourceId?: string;
  name?: string;
};

export type CurbGeometryQualityRefs = {
  roads?: RoadLine[];
  parkingAreas?: PolygonArea[];
  buildings?: PolygonArea[];
  maxRoadDistanceMeters?: number;
  minRoadOffsetMeters?: number;
  maxParallelAngleDegrees?: number;
};

export type CurbGeometryQualityResult = {
  status: 'accepted' | 'needs_field_review' | 'suppressed';
  reasons: string[];
  nearestRoadDistanceMeters: number | null;
  nearestRoadAngleDeltaDegrees: number | null;
  nearestRoadSourceId: string | null;
};

const DEFAULT_MAX_ROAD_DISTANCE_METERS = 12;
const DEFAULT_MIN_ROAD_OFFSET_METERS = 0.8;
const DEFAULT_MAX_PARALLEL_ANGLE_DEGREES = 18;

function numberPair(value: unknown): Coordinate | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const [lng, lat] = value;
  return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
}

function lineCoordinates(geometry: GeoJSONFeature['geometry']): Coordinate[] {
  if (geometry?.type !== 'LineString' || !Array.isArray(geometry.coordinates)) return [];
  return geometry.coordinates.map(numberPair).filter((item): item is Coordinate => item !== null);
}

function ringCoordinates(value: unknown): Coordinate[] {
  if (!Array.isArray(value)) return [];
  const positions = value.map(numberPair).filter((item): item is Coordinate => item !== null);
  if (positions.length < 3) return [];
  const first = positions[0];
  const last = positions[positions.length - 1];
  return first[0] === last[0] && first[1] === last[1] ? positions.slice(0, -1) : positions;
}

function bboxForRing(ring: Coordinate[]): [number, number, number, number] {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of ring) {
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }
  return [minLng, minLat, maxLng, maxLat];
}

export function polygonFeatureToAreas(feature: GeoJSONFeature): PolygonArea[] {
  if (!feature.geometry || !Array.isArray(feature.geometry.coordinates)) return [];
  const polygons =
    feature.geometry.type === 'Polygon'
      ? [feature.geometry.coordinates]
      : feature.geometry.type === 'MultiPolygon'
        ? feature.geometry.coordinates
        : [];

  return polygons
    .map((polygon): PolygonArea | null => {
      if (!Array.isArray(polygon)) return null;
      const rings = polygon.map(ringCoordinates).filter((ring) => ring.length >= 3);
      if (rings.length === 0) return null;
      return {
        bbox: bboxForRing(rings[0]),
        rings,
        sourceId: typeof feature.properties?.source_id === 'string' ? feature.properties.source_id : undefined,
      };
    })
    .filter((area): area is PolygonArea => area !== null);
}

export function roadFeatureToLines(feature: GeoJSONFeature): RoadLine[] {
  if (!feature.geometry || !Array.isArray(feature.geometry.coordinates)) return [];
  const lines =
    feature.geometry.type === 'LineString'
      ? [feature.geometry.coordinates]
      : feature.geometry.type === 'MultiLineString'
        ? feature.geometry.coordinates
        : [];
  return lines
    .map((line): RoadLine | null => {
      if (!Array.isArray(line)) return null;
      const coordinates = line.map(numberPair).filter((item): item is Coordinate => item !== null);
      if (coordinates.length < 2) return null;
      return {
        coordinates,
        sourceId: typeof feature.properties?.source_id === 'string' ? feature.properties.source_id : undefined,
        name: typeof feature.properties?.name === 'string' ? feature.properties.name : undefined,
      };
    })
    .filter((line): line is RoadLine => line !== null);
}

export function areasFromCollection(collection: GeoJSONCollection | null | undefined): PolygonArea[] {
  return collection?.features.flatMap(polygonFeatureToAreas) ?? [];
}

export function roadLinesFromCollection(collection: GeoJSONCollection | null | undefined): RoadLine[] {
  return collection?.features.flatMap(roadFeatureToLines) ?? [];
}

function metersPerLngDegree(lat: number) {
  return Math.max(1, 111_320 * Math.cos((lat * Math.PI) / 180));
}

function project(point: Coordinate, referenceLat: number) {
  return { x: point[0] * metersPerLngDegree(referenceLat), y: point[1] * 110_540 };
}

function distancePointToSegmentMeters(point: Coordinate, a: Coordinate, b: Coordinate) {
  const referenceLat = (point[1] + a[1] + b[1]) / 3;
  const p = project(point, referenceLat);
  const start = project(a, referenceLat);
  const end = project(b, referenceLat);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(p.x - start.x, p.y - start.y);
  const t = Math.max(0, Math.min(1, ((p.x - start.x) * dx + (p.y - start.y) * dy) / lengthSquared));
  const closestX = start.x + t * dx;
  const closestY = start.y + t * dy;
  return Math.hypot(p.x - closestX, p.y - closestY);
}

function segmentAngle(a: Coordinate, b: Coordinate) {
  const referenceLat = (a[1] + b[1]) / 2;
  const start = project(a, referenceLat);
  const end = project(b, referenceLat);
  return Math.atan2(end.y - start.y, end.x - start.x);
}

function angleDeltaDegrees(a: number, b: number) {
  const diff = Math.abs((((a - b) % Math.PI) + Math.PI) % Math.PI);
  return (Math.min(diff, Math.PI - diff) * 180) / Math.PI;
}

function lineAxisAngle(coordinates: Coordinate[]) {
  return segmentAngle(coordinates[0], coordinates[coordinates.length - 1]);
}

function lineBbox(coordinates: Coordinate[]): [number, number, number, number] {
  return bboxForRing(coordinates.length >= 3 ? coordinates : [coordinates[0], coordinates[1], coordinates[0]]);
}

function bboxExpandedIntersects(
  a: [number, number, number, number],
  b: [number, number, number, number],
  meters: number
) {
  const referenceLat = (a[1] + a[3] + b[1] + b[3]) / 4;
  const lngPad = meters / metersPerLngDegree(referenceLat);
  const latPad = meters / 110_540;
  return !(a[2] + lngPad < b[0] || a[0] - lngPad > b[2] || a[3] + latPad < b[1] || a[1] - latPad > b[3]);
}

function pointInRing(point: Coordinate, ring: Coordinate[]) {
  const [lng, lat] = point;
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [lngA, latA] = ring[index];
    const [lngB, latB] = ring[previous];
    const crosses = latA > lat !== latB > lat;
    if (crosses) {
      const intersectLng = ((lngB - lngA) * (lat - latA)) / (latB - latA) + lngA;
      if (lng < intersectLng) inside = !inside;
    }
  }
  return inside;
}

function pointInsideArea(point: Coordinate, area: PolygonArea) {
  const [lng, lat] = point;
  const [minLng, minLat, maxLng, maxLat] = area.bbox;
  if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) return false;
  if (!pointInRing(point, area.rings[0])) return false;
  return !area.rings.slice(1).some((hole) => pointInRing(point, hole));
}

function orientation(a: Coordinate, b: Coordinate, c: Coordinate) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(a: Coordinate, b: Coordinate, c: Coordinate) {
  return (
    Math.min(a[0], c[0]) <= b[0] &&
    b[0] <= Math.max(a[0], c[0]) &&
    Math.min(a[1], c[1]) <= b[1] &&
    b[1] <= Math.max(a[1], c[1])
  );
}

function segmentsIntersect(a: Coordinate, b: Coordinate, c: Coordinate, d: Coordinate) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  const epsilon = 1e-12;

  if (Math.abs(o1) < epsilon && onSegment(a, c, b)) return true;
  if (Math.abs(o2) < epsilon && onSegment(a, d, b)) return true;
  if (Math.abs(o3) < epsilon && onSegment(c, a, d)) return true;
  if (Math.abs(o4) < epsilon && onSegment(c, b, d)) return true;

  return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0);
}

function lineTouchesArea(coordinates: Coordinate[], area: PolygonArea) {
  if (coordinates.some((point) => pointInsideArea(point, area))) return true;
  for (let lineIndex = 1; lineIndex < coordinates.length; lineIndex += 1) {
    const lineStart = coordinates[lineIndex - 1];
    const lineEnd = coordinates[lineIndex];
    for (const ring of area.rings) {
      for (let ringIndex = 0; ringIndex < ring.length; ringIndex += 1) {
        if (segmentsIntersect(lineStart, lineEnd, ring[ringIndex], ring[(ringIndex + 1) % ring.length])) {
          return true;
        }
      }
    }
  }
  return false;
}

function nearestRoad(coordinates: Coordinate[], roads: RoadLine[]) {
  const curbBbox = lineBbox(coordinates);
  const curbAngle = lineAxisAngle(coordinates);
  let best: {
    distanceMeters: number;
    angleDeltaDegrees: number;
    sourceId: string | null;
    name: string | null;
    segmentStart: Coordinate;
    segmentEnd: Coordinate;
    score: number;
  } | null = null;

  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  const midpoint: Coordinate = [(first[0] + last[0]) / 2, (first[1] + last[1]) / 2];

  for (const road of roads) {
    if (!bboxExpandedIntersects(curbBbox, lineBbox(road.coordinates), 40)) continue;
    for (let index = 1; index < road.coordinates.length; index += 1) {
      const a = road.coordinates[index - 1];
      const b = road.coordinates[index];
      const distanceMeters = distancePointToSegmentMeters(midpoint, a, b);
      const angle = segmentAngle(a, b);
      const delta = angleDeltaDegrees(curbAngle, angle);
      const score = distanceMeters + delta * 1.5;
      if (!best || score < best.score) {
        best = {
          distanceMeters,
          angleDeltaDegrees: delta,
          sourceId: road.sourceId ?? null,
          name: road.name ?? null,
          segmentStart: a,
          segmentEnd: b,
          score,
        };
      }
    }
  }

  return best;
}

const namedRoadIndexCache = new WeakMap<RoadLine[], Map<string, RoadLine[]>>();

function namedRoadIndex(roads: RoadLine[]) {
  const cached = namedRoadIndexCache.get(roads);
  if (cached) return cached;
  const index = new Map<string, RoadLine[]>();
  for (const road of roads) {
    const name = road.name?.trim().toLowerCase();
    if (!name) continue;
    index.set(name, [...(index.get(name) ?? []), road]);
  }
  namedRoadIndexCache.set(roads, index);
  return index;
}

function namedRoadAxis(name: string, roads: RoadLine[], anchor: Coordinate) {
  const normalizedName = name.trim().toLowerCase();
  let sin2 = 0;
  let cos2 = 0;
  let totalWeight = 0;
  let weightedLng = 0;
  let weightedLat = 0;

  for (const road of namedRoadIndex(roads).get(normalizedName) ?? []) {
    for (let index = 1; index < road.coordinates.length; index += 1) {
      const start = road.coordinates[index - 1];
      const end = road.coordinates[index];
      if (distancePointToSegmentMeters(anchor, start, end) > 300) continue;
      const angle = segmentAngle(start, end);
      const referenceLat = (start[1] + end[1]) / 2;
      const projectedStart = project(start, referenceLat);
      const projectedEnd = project(end, referenceLat);
      const segmentLength = Math.hypot(projectedEnd.x - projectedStart.x, projectedEnd.y - projectedStart.y);
      const effectiveWeight = Math.max(0.1, segmentLength);
      sin2 += Math.sin(2 * angle) * effectiveWeight;
      cos2 += Math.cos(2 * angle) * effectiveWeight;
      weightedLng += ((start[0] + end[0]) / 2) * effectiveWeight;
      weightedLat += ((start[1] + end[1]) / 2) * effectiveWeight;
      totalWeight += effectiveWeight;
    }
  }

  return totalWeight > 0
    ? {
        angle: 0.5 * Math.atan2(sin2, cos2),
        center: [weightedLng / totalWeight, weightedLat / totalWeight] as Coordinate,
      }
    : null;
}

export function alignCurbLineToNearestRoad(
  feature: GeoJSONFeature,
  refs: CurbGeometryQualityRefs
): GeoJSONFeature {
  const coordinates = lineCoordinates(feature.geometry);
  if (coordinates.length < 2 || !refs.roads || refs.roads.length === 0) return feature;

  const road = nearestRoad(coordinates, refs.roads);
  if (!road) return feature;

  const start = coordinates[0];
  const end = coordinates[coordinates.length - 1];
  const referenceLat = (start[1] + end[1]) / 2;
  const projectedStart = project(start, referenceLat);
  const projectedEnd = project(end, referenceLat);
  const midpoint = {
    x: (projectedStart.x + projectedEnd.x) / 2,
    y: (projectedStart.y + projectedEnd.y) / 2,
  };
  const halfLength = Math.hypot(projectedEnd.x - projectedStart.x, projectedEnd.y - projectedStart.y) / 2;
  if (halfLength === 0) return feature;

  const roadStart = project(road.segmentStart, referenceLat);
  const roadEnd = project(road.segmentEnd, referenceLat);
  const roadLength = Math.hypot(roadEnd.x - roadStart.x, roadEnd.y - roadStart.y);
  if (roadLength === 0) return feature;

  const localRoadAngle = Math.atan2(roadEnd.y - roadStart.y, roadEnd.x - roadStart.x);
  const sourceMidpoint: Coordinate = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
  const streetAxis = road.name ? namedRoadAxis(road.name, refs.roads, sourceMidpoint) : null;
  const alignmentAngle =
    streetAxis !== null && angleDeltaDegrees(localRoadAngle, streetAxis.angle) <= 12
      ? streetAxis.angle
      : localRoadAngle;
  const ux = Math.cos(alignmentAngle);
  const uy = Math.sin(alignmentAngle);
  let alignedMidpoint = midpoint;

  if (streetAxis && alignmentAngle === streetAxis.angle) {
    const axisCenter = project(streetAxis.center, referenceLat);
    const along = (midpoint.x - axisCenter.x) * ux + (midpoint.y - axisCenter.y) * uy;
    const normalX = -uy;
    const normalY = ux;
    const localSide = (midpoint.x - roadStart.x) * normalX + (midpoint.y - roadStart.y) * normalY;
    const curbOffsetMeters = 4;
    const side = localSide < 0 ? -1 : 1;
    alignedMidpoint = {
      x: axisCenter.x + along * ux + side * curbOffsetMeters * normalX,
      y: axisCenter.y + along * uy + side * curbOffsetMeters * normalY,
    };
    if (Math.hypot(alignedMidpoint.x - midpoint.x, alignedMidpoint.y - midpoint.y) > 15) {
      alignedMidpoint = midpoint;
    }
  }
  const toLngLat = (x: number, y: number): Coordinate => [
    x / metersPerLngDegree(referenceLat),
    y / 110_540,
  ];

  return {
    ...feature,
    geometry: {
      type: 'LineString',
      coordinates: [
        toLngLat(alignedMidpoint.x - ux * halfLength, alignedMidpoint.y - uy * halfLength),
        toLngLat(alignedMidpoint.x + ux * halfLength, alignedMidpoint.y + uy * halfLength),
      ],
    },
    properties: {
      ...feature.properties,
      geometry_alignment_method:
        streetAxis && alignmentAngle === streetAxis.angle
          ? 'named_street_shared_axis'
          : 'nearest_road_segment_exact_parallel',
      geometry_alignment_road_name: road.name ?? feature.properties.geometry_alignment_road_name,
    },
  };
}

function lineIntersectsAnyArea(coordinates: Coordinate[], areas: PolygonArea[] | undefined) {
  if (!areas || areas.length === 0) return false;
  const bbox = lineBbox(coordinates);
  return areas.some((area) => bboxExpandedIntersects(bbox, area.bbox, 0) && lineTouchesArea(coordinates, area));
}

function lineCrossesIntersectingRoad(coordinates: Coordinate[], roads: RoadLine[] | undefined) {
  if (!roads || roads.length === 0) return false;
  const curbStart = coordinates[0];
  const curbEnd = coordinates[coordinates.length - 1];
  const curbAngle = segmentAngle(curbStart, curbEnd);
  const curbBbox = lineBbox(coordinates);

  return roads.some((road) => {
    if (!bboxExpandedIntersects(curbBbox, lineBbox(road.coordinates), 0)) return false;
    return road.coordinates.slice(1).some((end, index) => {
      const start = road.coordinates[index];
      if (angleDeltaDegrees(curbAngle, segmentAngle(start, end)) <= 30) return false;
      return segmentsIntersect(curbStart, curbEnd, start, end);
    });
  });
}

export function assessCurbGeometryQuality(
  feature: GeoJSONFeature,
  refs: CurbGeometryQualityRefs
): CurbGeometryQualityResult {
  const coordinates = lineCoordinates(feature.geometry);
  const reasons: string[] = [];
  if (coordinates.length < 2) {
    return {
      status: 'suppressed',
      reasons: ['invalid_line_geometry'],
      nearestRoadDistanceMeters: null,
      nearestRoadAngleDeltaDegrees: null,
      nearestRoadSourceId: null,
    };
  }

  const road = refs.roads && refs.roads.length > 0 ? nearestRoad(coordinates, refs.roads) : null;
  const maxRoadDistance = refs.maxRoadDistanceMeters ?? DEFAULT_MAX_ROAD_DISTANCE_METERS;
  const minRoadOffset = refs.minRoadOffsetMeters ?? DEFAULT_MIN_ROAD_OFFSET_METERS;
  const maxParallelAngle = refs.maxParallelAngleDegrees ?? DEFAULT_MAX_PARALLEL_ANGLE_DEGREES;

  if (!road) {
    reasons.push('missing_road_reference');
  } else {
    if (road.distanceMeters > maxRoadDistance) reasons.push('too_far_from_road');
    if (road.distanceMeters < minRoadOffset) reasons.push('on_road_centerline_or_too_close');
    if (road.angleDeltaDegrees > maxParallelAngle) reasons.push('not_parallel_to_road');
  }

  if (lineIntersectsAnyArea(coordinates, refs.buildings)) reasons.push('intersects_building');
  if (lineIntersectsAnyArea(coordinates, refs.parkingAreas)) reasons.push('intersects_parking_area_interior');
  if (lineCrossesIntersectingRoad(coordinates, refs.roads)) reasons.push('crosses_intersecting_road');

  const suppressReasons = new Set([
    'intersects_building',
    'intersects_parking_area_interior',
    'crosses_intersecting_road',
    'invalid_line_geometry',
  ]);
  const status = reasons.some((reason) => suppressReasons.has(reason))
    ? 'suppressed'
    : reasons.length > 0
      ? 'needs_field_review'
      : 'accepted';

  return {
    status,
    reasons,
    nearestRoadDistanceMeters: road ? Math.round(road.distanceMeters * 10) / 10 : null,
    nearestRoadAngleDeltaDegrees: road ? Math.round(road.angleDeltaDegrees * 10) / 10 : null,
    nearestRoadSourceId: road?.sourceId ?? null,
  };
}

export function withCurbGeometryQuality(
  feature: GeoJSONFeature,
  refs: CurbGeometryQualityRefs
): GeoJSONFeature | null {
  const result = assessCurbGeometryQuality(feature, refs);
  const properties = {
    ...feature.properties,
    geometry_quality_status: result.status,
    geometry_quality_reasons: result.reasons,
    nearest_road_distance_meters: result.nearestRoadDistanceMeters,
    nearest_road_angle_delta_degrees: result.nearestRoadAngleDeltaDegrees,
    matched_road_source_id: result.nearestRoadSourceId ?? feature.properties.matched_road_source_id,
    geometry_quality_method: 'deterministic_road_parallel_area_intersection_check',
  };

  if (result.status === 'suppressed') {
    return null;
  }

  if (result.status === 'needs_field_review') {
    return {
      ...feature,
      properties: {
        ...properties,
        ordinary_parking_status: 'unknown_pending_snap_conflict_check',
        field_conflict_status: 'needs_field_review',
        enrichment_status: feature.properties.enrichment_status === 'conflict' ? 'conflict' : 'needs_review',
        offer_confidence: Math.min(Number(feature.properties.offer_confidence ?? feature.properties.confidence ?? 0.55), 0.55),
        display_confidence: Math.min(Number(feature.properties.display_confidence ?? feature.properties.confidence ?? 0.55), 0.55),
        confidence: Math.min(Number(feature.properties.display_confidence ?? feature.properties.confidence ?? 0.55), 0.55),
      },
    };
  }

  return { ...feature, properties };
}

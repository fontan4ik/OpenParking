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

function isGeneratedCurbRow(feature: GeoJSONFeature) {
  const sourceId = typeof feature.properties.source_id === 'string'
    ? feature.properties.source_id.toLowerCase()
    : '';
  const provenance = typeof feature.properties.geometry_provenance === 'string'
    ? feature.properties.geometry_provenance.toLowerCase()
    : '';
  const sourceGeometryType = typeof feature.properties.source_geometry_type === 'string'
    ? feature.properties.source_geometry_type.toLowerCase()
    : '';
  return (
    sourceId.startsWith('parking-space-row:') ||
    sourceId.includes(':spaces:') ||
    sourceGeometryType === 'pointcluster' ||
    provenance.includes('derived from grouped official parking-space points') ||
    provenance.includes('derived from an official parking-space point')
  );
}

function straightReferenceGeometry(feature: GeoJSONFeature): GeoJSONFeature {
  const coordinates = lineCoordinates(feature.geometry);
  if (coordinates.length <= 2) return feature;
  return {
    ...feature,
    geometry: {
      type: 'LineString',
      coordinates: [coordinates[0], coordinates[coordinates.length - 1]],
    },
  };
}

function sourcePointDerivedAccuracyClass(feature: GeoJSONFeature) {
  return isGeneratedCurbRow(feature)
    ? 'official_point_derived_road_oriented'
    : 'estimated_road_aligned';
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
  const anchors = [first, midpoint, last];

  for (const road of roads) {
    if (!bboxExpandedIntersects(curbBbox, lineBbox(road.coordinates), 40)) continue;
    for (let index = 1; index < road.coordinates.length; index += 1) {
      const a = road.coordinates[index - 1];
      const b = road.coordinates[index];
      const anchorDistances = anchors.map((point) => distancePointToSegmentMeters(point, a, b));
      const distanceMeters = anchorDistances.reduce((sum, value) => sum + value, 0) / anchorDistances.length;
      const maxAnchorDistanceMeters = Math.max(...anchorDistances);
      const angle = segmentAngle(a, b);
      const delta = angleDeltaDegrees(curbAngle, angle);
      // A crossing or short side street can be closest to the midpoint while being far
      // from the row endpoints. Penalize that shape so the selected road explains the
      // whole curb row, not one convenient point near an intersection.
      const endpointSpreadPenalty = Math.max(0, maxAnchorDistanceMeters - distanceMeters);
      const score = distanceMeters + endpointSpreadPenalty * 1.5 + delta * 1.5;
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
  let lateralPositionSource = isGeneratedCurbRow(feature)
    ? 'official_parking_space_points'
    : 'source_geometry';
  let lateralAdjustmentMeters = 0;

  if (streetAxis && alignmentAngle === streetAxis.angle) {
    const normalX = -uy;
    const normalY = ux;
    // Official parking-space points carry the best available lateral position.
    // Use OSM for direction, without replacing that evidence with a synthetic
    // fixed curb offset from the road centerline.
    const sourceLateralOffsetMeters =
      (midpoint.x - roadStart.x) * normalX + (midpoint.y - roadStart.y) * normalY;
    const effectiveLateralOffsetMeters =
      isGeneratedCurbRow(feature) && Math.abs(sourceLateralOffsetMeters) >= DEFAULT_MIN_ROAD_OFFSET_METERS
        ? sourceLateralOffsetMeters
        : (sourceLateralOffsetMeters < 0 ? -1 : 1) * 4;
    lateralAdjustmentMeters = Math.abs(effectiveLateralOffsetMeters - sourceLateralOffsetMeters);
    if (lateralAdjustmentMeters > 0) lateralPositionSource = 'minimum_curb_offset_guard';
    alignedMidpoint = {
      x: midpoint.x + (effectiveLateralOffsetMeters - sourceLateralOffsetMeters) * normalX,
      y: midpoint.y + (effectiveLateralOffsetMeters - sourceLateralOffsetMeters) * normalY,
    };
    if (Math.hypot(alignedMidpoint.x - midpoint.x, alignedMidpoint.y - midpoint.y) > 15) {
      alignedMidpoint = midpoint;
    }
  }
  const toLngLat = (x: number, y: number): Coordinate => [
    x / metersPerLngDegree(referenceLat),
    y / 110_540,
  ];
  const alignmentDisplacementMeters = Math.hypot(
    alignedMidpoint.x - midpoint.x,
    alignedMidpoint.y - midpoint.y,
  );

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
      geometry_alignment_road_source_id: road.sourceId ?? feature.properties.geometry_alignment_road_source_id,
      geometry_source_road_distance_meters: Math.round(road.distanceMeters * 10) / 10,
      geometry_alignment_displacement_meters: Math.round(alignmentDisplacementMeters * 10) / 10,
      geometry_lateral_position_source: lateralPositionSource,
      geometry_lateral_adjustment_meters: Math.round(lateralAdjustmentMeters * 10) / 10,
      geometry_accuracy_class: sourcePointDerivedAccuracyClass(feature),
    },
  };
}

function projectOntoPolyline(
  point: Coordinate,
  polyline: Coordinate[],
  referenceLat: number
): { segmentIndex: number; t: number } | null {
  if (polyline.length < 2) return null;
  const pt = project(point, referenceLat);
  let bestDist = Infinity;
  let bestIdx = -1;
  let bestT = 0;

  for (let i = 1; i < polyline.length; i++) {
    const a = project(polyline[i - 1], referenceLat);
    const b = project(polyline[i], referenceLat);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    let t = 0;
    if (lenSq > 0) {
      t = Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / lenSq));
    }
    const cx = a.x + t * dx;
    const cy = a.y + t * dy;
    const d = Math.hypot(pt.x - cx, pt.y - cy);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i - 1;
      bestT = t;
    }
  }

  return bestIdx >= 0 ? { segmentIndex: bestIdx, t: bestT } : null;
}

export function alignCurbLineAlongRoad(
  feature: GeoJSONFeature,
  refs: CurbGeometryQualityRefs
): GeoJSONFeature {
  const coordinates = lineCoordinates(feature.geometry);
  if (coordinates.length < 2 || !refs.roads || refs.roads.length === 0) return feature;

  const roadMatch = nearestRoad(coordinates, refs.roads);
  if (!roadMatch) return feature;

  const start = coordinates[0];
  const end = coordinates[coordinates.length - 1];
  const referenceLat = (start[1] + end[1]) / 2;
  const projectedStart = project(start, referenceLat);
  const projectedEnd = project(end, referenceLat);
  const midpoint = {
    x: (projectedStart.x + projectedEnd.x) / 2,
    y: (projectedStart.y + projectedEnd.y) / 2,
  };
  const sourceMidpoint: Coordinate = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];

  const roadLine = refs.roads.find((r) => {
    const coords = r.coordinates;
    for (let i = 1; i < coords.length; i++) {
      if (
        Math.abs(coords[i - 1][0] - roadMatch.segmentStart[0]) < 1e-10 &&
        Math.abs(coords[i - 1][1] - roadMatch.segmentStart[1]) < 1e-10 &&
        Math.abs(coords[i][0] - roadMatch.segmentEnd[0]) < 1e-10 &&
        Math.abs(coords[i][1] - roadMatch.segmentEnd[1]) < 1e-10
      ) {
        return true;
      }
    }
    return false;
  });

  if (!roadLine || roadLine.coordinates.length < 3) {
    return alignCurbLineToNearestRoad(feature, refs);
  }

  const roadCoords = roadLine.coordinates;

  const projStart = projectOntoPolyline(start, roadCoords, referenceLat);
  const projEnd = projectOntoPolyline(end, roadCoords, referenceLat);

  if (!projStart || !projEnd) {
    return alignCurbLineToNearestRoad(feature, refs);
  }

  const streetAxis = roadMatch.name
    ? namedRoadAxis(roadMatch.name, refs.roads, sourceMidpoint)
    : null;
  const roadStartProj = project(roadMatch.segmentStart, referenceLat);
  const roadEndProj = project(roadMatch.segmentEnd, referenceLat);
  const localRoadAngle = Math.atan2(
    roadEndProj.y - roadStartProj.y,
    roadEndProj.x - roadStartProj.x
  );
  const alignmentAngle =
    streetAxis !== null && angleDeltaDegrees(localRoadAngle, streetAxis.angle) <= 12
      ? streetAxis.angle
      : localRoadAngle;
  const ux = Math.cos(alignmentAngle);
  const uy = Math.sin(alignmentAngle);
  const normalX = -uy;
  const normalY = ux;
  const localSide =
    (midpoint.x - roadStartProj.x) * normalX + (midpoint.y - roadStartProj.y) * normalY;
  const side = localSide < 0 ? -1 : 1;
  const sourceLateralOffsetMeters = Math.abs(localSide);
  const preserveOfficialLateralPosition =
    isGeneratedCurbRow(feature) && sourceLateralOffsetMeters >= DEFAULT_MIN_ROAD_OFFSET_METERS;
  const effectiveLateralOffsetMeters = preserveOfficialLateralPosition
    ? sourceLateralOffsetMeters
    : 4;
  const lateralAdjustmentMeters = Math.abs(effectiveLateralOffsetMeters - sourceLateralOffsetMeters);

  const rawPoints: { x: number; y: number; segIndex: number }[] = [];

  if (projStart.segmentIndex === projEnd.segmentIndex) {
    const a = project(roadCoords[projStart.segmentIndex], referenceLat);
    const b = project(roadCoords[projStart.segmentIndex + 1], referenceLat);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t1 = Math.min(projStart.t, projEnd.t);
    const t2 = Math.max(projStart.t, projEnd.t);
    rawPoints.push({ x: a.x + t1 * dx, y: a.y + t1 * dy, segIndex: projStart.segmentIndex });
    rawPoints.push({ x: a.x + t2 * dx, y: a.y + t2 * dy, segIndex: projStart.segmentIndex });
  } else if (projStart.segmentIndex < projEnd.segmentIndex) {
    const aStart = project(roadCoords[projStart.segmentIndex], referenceLat);
    const bStart = project(roadCoords[projStart.segmentIndex + 1], referenceLat);
    rawPoints.push({
      x: aStart.x + projStart.t * (bStart.x - aStart.x),
      y: aStart.y + projStart.t * (bStart.y - aStart.y),
      segIndex: projStart.segmentIndex,
    });
    for (let i = projStart.segmentIndex + 1; i <= projEnd.segmentIndex; i++) {
      const v = project(roadCoords[i], referenceLat);
      rawPoints.push({ x: v.x, y: v.y, segIndex: i - 1 });
    }
    const aEnd = project(roadCoords[projEnd.segmentIndex], referenceLat);
    const bEnd = project(roadCoords[projEnd.segmentIndex + 1], referenceLat);
    rawPoints.push({
      x: aEnd.x + projEnd.t * (bEnd.x - aEnd.x),
      y: aEnd.y + projEnd.t * (bEnd.y - aEnd.y),
      segIndex: projEnd.segmentIndex,
    });
  } else {
    const aStart = project(roadCoords[projEnd.segmentIndex], referenceLat);
    const bStart = project(roadCoords[projEnd.segmentIndex + 1], referenceLat);
    rawPoints.push({
      x: aStart.x + projEnd.t * (bStart.x - aStart.x),
      y: aStart.y + projEnd.t * (bStart.y - aStart.y),
      segIndex: projEnd.segmentIndex,
    });
    for (let i = projEnd.segmentIndex + 1; i <= projStart.segmentIndex; i++) {
      const v = project(roadCoords[i], referenceLat);
      rawPoints.push({ x: v.x, y: v.y, segIndex: i - 1 });
    }
    const aEnd = project(roadCoords[projStart.segmentIndex], referenceLat);
    const bEnd = project(roadCoords[projStart.segmentIndex + 1], referenceLat);
    rawPoints.push({
      x: aEnd.x + projStart.t * (bEnd.x - aEnd.x),
      y: aEnd.y + projStart.t * (bEnd.y - aEnd.y),
      segIndex: projStart.segmentIndex,
    });
  }

  if (rawPoints.length < 2) return alignCurbLineToNearestRoad(feature, refs);

  const deduped: typeof rawPoints = [rawPoints[0]];
  for (let i = 1; i < rawPoints.length; i++) {
    const prev = deduped[deduped.length - 1];
    if (Math.hypot(rawPoints[i].x - prev.x, rawPoints[i].y - prev.y) > 0.01) {
      deduped.push(rawPoints[i]);
    }
  }

  let offsetPoints = deduped.map((pt) => {
    const roadA = project(roadCoords[pt.segIndex], referenceLat);
    const roadB = project(
      roadCoords[Math.min(pt.segIndex + 1, roadCoords.length - 1)],
      referenceLat
    );
    const tanAngle = Math.atan2(roadB.y - roadA.y, roadB.x - roadA.x);
    const nx = -Math.sin(tanAngle);
    const ny = Math.cos(tanAngle);
    return {
      x: pt.x + side * effectiveLateralOffsetMeters * nx,
      y: pt.y + side * effectiveLateralOffsetMeters * ny,
    };
  });

  const alignedMidX = offsetPoints.reduce((s, p) => s + p.x, 0) / offsetPoints.length;
  const alignedMidY = offsetPoints.reduce((s, p) => s + p.y, 0) / offsetPoints.length;
  const targetMidpoint = {
    x: midpoint.x + side * lateralAdjustmentMeters * normalX,
    y: midpoint.y + side * lateralAdjustmentMeters * normalY,
  };
  const translateX = targetMidpoint.x - alignedMidX;
  const translateY = targetMidpoint.y - alignedMidY;
  offsetPoints = offsetPoints.map((point) => ({
    x: point.x + translateX,
    y: point.y + translateY,
  }));
  const alignmentDisplacementMeters = Math.hypot(
    targetMidpoint.x - midpoint.x,
    targetMidpoint.y - midpoint.y,
  );
  if (alignmentDisplacementMeters > 15) {
    return alignCurbLineToNearestRoad(feature, refs);
  }

  const toLngLat = (x: number, y: number): Coordinate => [
    x / metersPerLngDegree(referenceLat),
    y / 110_540,
  ];

  return {
    ...feature,
    geometry: {
      type: 'LineString',
      coordinates: offsetPoints.map((p) => toLngLat(p.x, p.y)),
    },
    properties: {
      ...feature.properties,
      geometry_alignment_method: 'road_centerline_following_polyline',
      geometry_alignment_road_name: roadMatch.name ?? feature.properties.geometry_alignment_road_name,
      geometry_alignment_road_source_id: roadMatch.sourceId ?? feature.properties.geometry_alignment_road_source_id,
      geometry_source_road_distance_meters: Math.round(roadMatch.distanceMeters * 10) / 10,
      geometry_alignment_displacement_meters: Math.round(alignmentDisplacementMeters * 10) / 10,
      geometry_lateral_position_source: preserveOfficialLateralPosition
        ? 'official_parking_space_points'
        : 'minimum_curb_offset_guard',
      geometry_lateral_adjustment_meters: Math.round(lateralAdjustmentMeters * 10) / 10,
      geometry_accuracy_class: sourcePointDerivedAccuracyClass(feature),
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
  if (coordinates.length < 2) return false;
  const curbBbox = lineBbox(coordinates);

  return roads.some((road) => {
    if (!bboxExpandedIntersects(curbBbox, lineBbox(road.coordinates), 0)) return false;
    for (let i = 1; i < coordinates.length; i++) {
      const curbStart = coordinates[i - 1];
      const curbEnd = coordinates[i];
      const curbAngle = segmentAngle(curbStart, curbEnd);
      for (let j = 1; j < road.coordinates.length; j++) {
        const roadStart = road.coordinates[j - 1];
        const roadEnd = road.coordinates[j];
        if (angleDeltaDegrees(curbAngle, segmentAngle(roadStart, roadEnd)) <= 30) continue;
        if (segmentsIntersect(curbStart, curbEnd, roadStart, roadEnd)) return true;
      }
    }
    return false;
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

  const maxRoadDistance = refs.maxRoadDistanceMeters ?? DEFAULT_MAX_ROAD_DISTANCE_METERS;
  const minRoadOffset = refs.minRoadOffsetMeters ?? DEFAULT_MIN_ROAD_OFFSET_METERS;
  const maxParallelAngle = refs.maxParallelAngleDegrees ?? DEFAULT_MAX_PARALLEL_ANGLE_DEGREES;

  let overallRoad: ReturnType<typeof nearestRoad> = null;
  let anyRoadFound = false;

  if (refs.roads && refs.roads.length > 0) {
    for (let i = 1; i < coordinates.length; i++) {
      const pair: Coordinate[] = [coordinates[i - 1], coordinates[i]];
      const pairRoad = nearestRoad(pair, refs.roads);
      if (pairRoad) {
        anyRoadFound = true;
        if (!overallRoad || pairRoad.score < overallRoad.score) {
          overallRoad = pairRoad;
        }
        if (pairRoad.distanceMeters > maxRoadDistance && !reasons.includes('too_far_from_road')) {
          reasons.push('too_far_from_road');
        }
        if (
          pairRoad.distanceMeters < minRoadOffset &&
          !reasons.includes('on_road_centerline_or_too_close')
        ) {
          reasons.push('on_road_centerline_or_too_close');
        }
        if (
          pairRoad.angleDeltaDegrees > maxParallelAngle &&
          !reasons.includes('not_parallel_to_road')
        ) {
          reasons.push('not_parallel_to_road');
        }
      }
    }
  }

  if (!anyRoadFound) {
    reasons.push('missing_road_reference');
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
    nearestRoadDistanceMeters: overallRoad ? Math.round(overallRoad.distanceMeters * 10) / 10 : null,
    nearestRoadAngleDeltaDegrees: overallRoad
      ? Math.round(overallRoad.angleDeltaDegrees * 10) / 10
      : null,
    nearestRoadSourceId: overallRoad?.sourceId ?? null,
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
    geometry_accuracy_class:
      result.status === 'accepted'
        ? feature.properties.geometry_accuracy_class ?? sourcePointDerivedAccuracyClass(feature)
        : result.status === 'needs_field_review'
          ? 'needs_field_review'
          : 'suppressed',
  };

  if (result.status === 'suppressed') {
    return null;
  }

  if (result.status === 'needs_field_review') {
    const referenceFeature = isGeneratedCurbRow(feature) ? straightReferenceGeometry(feature) : feature;
    return {
      ...referenceFeature,
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

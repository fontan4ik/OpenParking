import type { GeoJSONFeature } from '@/lib/data-loader';

const EARTH_RADIUS_M = 6_371_008.8;
const DEFAULT_SURFACE_SPACE_M2 = 30;
const DEFAULT_STRUCTURED_SPACE_M2 = 34;
const DEFAULT_CURB_SPACE_M = 6.1;

export interface CapacityHeuristic {
  sourceId: string;
  entityType: 'parking_zone' | 'curb_segment';
  estimatedCapacity: number;
  confidence: number;
  method: string;
  inputs: Record<string, unknown>;
  reviewRequired: boolean;
}

function numberFromUnknown(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const match = value.match(/\d+(\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function toMeters([lng, lat]: [number, number], originLat: number): [number, number] {
  const latRad = (lat * Math.PI) / 180;
  const originRad = (originLat * Math.PI) / 180;
  const x = EARTH_RADIUS_M * ((lng * Math.PI) / 180) * Math.cos(originRad);
  const y = EARTH_RADIUS_M * latRad;
  return [x, y];
}

function ringAreaM2(ring: unknown): number {
  if (!Array.isArray(ring) || ring.length < 4) return 0;
  const coords = ring.filter(
    (coord): coord is [number, number] =>
      Array.isArray(coord) &&
      typeof coord[0] === 'number' &&
      typeof coord[1] === 'number'
  );
  if (coords.length < 4) return 0;

  const originLat = coords.reduce((sum, [, lat]) => sum + lat, 0) / coords.length;
  const points = coords.map((coord) => toMeters(coord, originLat));
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

export function polygonAreaM2(geometry: GeoJSONFeature['geometry']): number {
  if (geometry?.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
    const [outer, ...holes] = geometry.coordinates as unknown[];
    return Math.max(
      0,
      ringAreaM2(outer) - holes.reduce<number>((sum, ring) => sum + ringAreaM2(ring), 0)
    );
  }

  if (geometry?.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    return (geometry.coordinates as unknown[]).reduce<number>((sum, polygon) => {
      if (!Array.isArray(polygon)) return sum;
      const [outer, ...holes] = polygon;
      return (
        sum +
        Math.max(
          0,
          ringAreaM2(outer) -
            holes.reduce<number>((holeSum, ring) => holeSum + ringAreaM2(ring), 0)
        )
      );
    }, 0);
  }

  return 0;
}

export function lineLengthM(geometry: GeoJSONFeature['geometry']): number {
  if (geometry?.type !== 'LineString' || !Array.isArray(geometry.coordinates)) return 0;
  const coords = geometry.coordinates.filter(
    (coord): coord is [number, number] =>
      Array.isArray(coord) &&
      typeof coord[0] === 'number' &&
      typeof coord[1] === 'number'
  );
  if (coords.length < 2) return 0;

  const originLat = coords.reduce((sum, [, lat]) => sum + lat, 0) / coords.length;
  let length = 0;
  for (let i = 1; i < coords.length; i += 1) {
    const [x1, y1] = toMeters(coords[i - 1], originLat);
    const [x2, y2] = toMeters(coords[i], originLat);
    length += Math.hypot(x2 - x1, y2 - y1);
  }
  return length;
}

export function estimateZoneCapacity(feature: GeoJSONFeature): CapacityHeuristic | null {
  const p = feature.properties ?? {};
  const sourceId = String(p.source_id ?? '');
  if (!sourceId) return null;

  const taggedCapacity = numberFromUnknown(p.capacity);
  if (taggedCapacity && taggedCapacity > 0) {
    return {
      sourceId,
      entityType: 'parking_zone',
      estimatedCapacity: Math.round(taggedCapacity),
      confidence: 0.85,
      method: 'osm_tagged_capacity',
      inputs: { capacity: p.capacity },
      reviewRequired: false,
    };
  }

  const areaM2 = polygonAreaM2(feature.geometry);
  if (areaM2 <= 0) return null;

  const rawTags = (p.raw_tags ?? {}) as Record<string, unknown>;
  const parkingType = String(p.facility_type ?? rawTags.parking ?? 'surface');
  const structured = ['multi-storey', 'underground', 'garage', 'rooftop'].includes(parkingType);
  const spaceM2 = structured ? DEFAULT_STRUCTURED_SPACE_M2 : DEFAULT_SURFACE_SPACE_M2;
  const estimated = Math.max(1, Math.round(areaM2 / spaceM2));
  const approximateGeometry = Boolean(p.geometry_note) || String(p.geometry_quality ?? '').includes('fallback');

  return {
    sourceId,
    entityType: 'parking_zone',
    estimatedCapacity: estimated,
    confidence: approximateGeometry ? 0.2 : 0.38,
    method: structured ? 'abstreet_area_structured_capacity' : 'abstreet_area_surface_capacity',
    inputs: { area_m2: Math.round(areaM2), parking_type: parkingType, space_m2: spaceM2 },
    reviewRequired: true,
  };
}

export function estimateCurbCapacity(feature: GeoJSONFeature): CapacityHeuristic | null {
  const p = feature.properties ?? {};
  const sourceId = String(p.source_id ?? '');
  if (!sourceId) return null;

  const meterCount = numberFromUnknown(p.meter_count);
  if (meterCount && meterCount > 0) {
    return {
      sourceId,
      entityType: 'curb_segment',
      estimatedCapacity: Math.round(meterCount),
      confidence: 0.75,
      method: 'datasf_meter_count',
      inputs: { meter_count: p.meter_count },
      reviewRequired: false,
    };
  }

  const lengthM = lineLengthM(feature.geometry);
  if (lengthM <= 0) return null;

  return {
    sourceId,
    entityType: 'curb_segment',
    estimatedCapacity: Math.max(1, Math.round(lengthM / DEFAULT_CURB_SPACE_M)),
    confidence: 0.32,
    method: 'abstreet_curb_length_capacity',
    inputs: { length_m: Math.round(lengthM), space_m: DEFAULT_CURB_SPACE_M },
    reviewRequired: true,
  };
}

export function deriveCapacityHeuristics(
  zones: GeoJSONFeature[],
  curbs: GeoJSONFeature[]
): CapacityHeuristic[] {
  return [
    ...zones.map(estimateZoneCapacity).filter((item): item is CapacityHeuristic => Boolean(item)),
    ...curbs.map(estimateCurbCapacity).filter((item): item is CapacityHeuristic => Boolean(item)),
  ];
}

export const ROUTE_DISTANCE_CAP_M = 100_000;
export const ROUTE_TIMEOUT_MS = 5_000;
export const ROUTE_ATTRIBUTION = 'Routing by Valhalla with OpenStreetMap data';

const EARTH_RADIUS_M = 6_371_008.8;
const METERS_PER_MILE = 1_609.344;

export type RoutingErrorCode =
  | 'INVALID_COORDINATES'
  | 'INVALID_GEOMETRY'
  | 'UNSUPPORTED_COSTING'
  | 'ROUTE_TOO_LONG'
  | 'ROUTE_TIMEOUT'
  | 'ROUTE_SERVICE_UNAVAILABLE'
  | 'NO_ROUTE'
  | 'MALFORMED_PROVIDER_RESPONSE';

export type RouteCosting = 'auto';

export interface RouteCoordinate {
  lat: number;
  lon: number;
}

export interface RouteRequestBody {
  start: RouteCoordinate;
  destination: RouteCoordinate;
  costing: RouteCosting;
}

export interface RouteError {
  code: RoutingErrorCode;
  message: string;
}

export interface RouteSuccessResponse {
  provider: 'valhalla';
  costing: RouteCosting;
  distanceMeters: number;
  durationSeconds: number;
  geometry: GeoJSON.LineString;
  attribution: typeof ROUTE_ATTRIBUTION;
}

export type RouteValidationResult =
  | { ok: true; request: RouteRequestBody; directDistanceMeters: number }
  | { ok: false; error: RouteError };

export interface ValhallaRouteRequest {
  locations: [RouteCoordinate, RouteCoordinate];
  costing: RouteCosting;
  directions_options: { units: 'miles' };
  shape_format: 'geojson';
}

type ValhallaSummary = { time?: unknown; length?: unknown };
type ValhallaLeg = { summary?: ValhallaSummary; shape?: unknown };
type ValhallaTrip = { status?: unknown; status_message?: unknown; summary?: ValhallaSummary; legs?: unknown };
type ValhallaResponse = { trip?: ValhallaTrip };

export type DestinationResolveResult =
  | { ok: true; destination: RouteCoordinate }
  | { ok: false; error: RouteError };

export function routingError(code: RoutingErrorCode, message: string): RouteError {
  return { code, message };
}

export function isValidLatitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLongitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -180 && value <= 180;
}

export function isRouteCoordinate(value: unknown): value is RouteCoordinate {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return isValidLatitude(candidate.lat) && isValidLongitude(candidate.lon);
}

export function distanceMeters(a: RouteCoordinate, b: RouteCoordinate): number {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLon = toRadians(b.lon - a.lon);
  const sinLat = Math.sin(deltaLat / 2);
  const sinLon = Math.sin(deltaLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function validateRouteRequest(value: unknown): RouteValidationResult {
  if (!value || typeof value !== 'object') {
    return { ok: false, error: routingError('INVALID_COORDINATES', 'Route request must be a JSON object.') };
  }

  const body = value as Record<string, unknown>;
  if (!isRouteCoordinate(body.start) || !isRouteCoordinate(body.destination)) {
    return { ok: false, error: routingError('INVALID_COORDINATES', 'Start and destination must include finite lat/lon coordinates.') };
  }

  if (body.costing !== 'auto') {
    return { ok: false, error: routingError('UNSUPPORTED_COSTING', 'Only auto routing is supported.') };
  }

  const directDistanceMeters = distanceMeters(body.start, body.destination);
  if (directDistanceMeters > ROUTE_DISTANCE_CAP_M) {
    return { ok: false, error: routingError('ROUTE_TOO_LONG', 'Route is outside the 100 km MVP distance limit.') };
  }

  return { ok: true, request: { start: body.start, destination: body.destination, costing: 'auto' }, directDistanceMeters };
}

export function toValhallaRouteRequest(request: RouteRequestBody): ValhallaRouteRequest {
  return {
    locations: [request.start, request.destination],
    costing: 'auto',
    directions_options: { units: 'miles' },
    shape_format: 'geojson',
  };
}

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return 'Distance unavailable';
  const miles = meters / METERS_PER_MILE;
  if (miles < 0.1) return `${Math.round(meters)} m`;
  return `${miles.toFixed(1)} mi`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return 'Time unavailable';
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0 ? `${hours} hr` : `${hours} hr ${remainingMinutes} min`;
}

export function formatRouteSummary(distanceMetersValue: number, durationSeconds: number): string {
  return `${formatDistance(distanceMetersValue)} · ${formatDuration(durationSeconds)}`;
}

export function resolveParkingDestination(
  geometry: GeoJSON.Geometry | null | undefined,
  start?: RouteCoordinate | null
): DestinationResolveResult {
  if (!geometry) return invalidGeometry('Parking geometry is missing.');

  if (geometry.type === 'Point') {
    const point = pointFromPosition(geometry.coordinates);
    return point ? destination(point) : invalidGeometry('Point geometry has invalid coordinates.');
  }

  if (geometry.type === 'MultiPoint') {
    const points = geometry.coordinates.map(pointFromPosition).filter((point): point is RouteCoordinate => Boolean(point));
    if (points.length === 0) return invalidGeometry('MultiPoint geometry has no valid coordinates.');
    if (!start) return destination(points[0]);
    return destination(points.reduce((best, point) => (distanceMeters(start, point) < distanceMeters(start, best) ? point : best)));
  }

  if (geometry.type === 'LineString') {
    const point = lineMidpoint(geometry.coordinates);
    return point ? destination(point) : invalidGeometry('LineString geometry has no valid midpoint.');
  }

  if (geometry.type === 'MultiLineString') {
    const bestLine = geometry.coordinates.reduce<GeoJSON.Position[] | null>((best, line) => {
      if (!Array.isArray(line) || validPositions(line).length < 2) return best;
      if (!best) return line;
      return lineLengthMeters(line) > lineLengthMeters(best) ? line : best;
    }, null);
    const point = bestLine ? lineMidpoint(bestLine) : null;
    return point ? destination(point) : invalidGeometry('MultiLineString geometry has no valid line.');
  }

  if (geometry.type === 'Polygon') {
    const point = polygonRepresentativePoint(geometry.coordinates);
    return point ? destination(point) : invalidGeometry('Polygon geometry has no valid representative point.');
  }

  if (geometry.type === 'MultiPolygon') {
    const bestPolygon = geometry.coordinates.reduce<GeoJSON.Position[][] | null>((best, polygon) => {
      if (!Array.isArray(polygon) || validPositions(polygon[0]).length < 4) return best;
      if (!best) return polygon;
      return polygonAreaMeters(polygon) > polygonAreaMeters(best) ? polygon : best;
    }, null);
    const point = bestPolygon ? polygonRepresentativePoint(bestPolygon) : null;
    return point ? destination(point) : invalidGeometry('MultiPolygon geometry has no valid polygon.');
  }

  return invalidGeometry(`Unsupported geometry type: ${geometry.type}.`);
}

export function normalizeValhallaRouteResponse(value: unknown): RouteSuccessResponse | RouteError {
  const response = value as ValhallaResponse;
  const trip = response?.trip;
  if (!trip || typeof trip !== 'object') {
    return routingError('MALFORMED_PROVIDER_RESPONSE', 'Valhalla response is missing trip data.');
  }

  if (typeof trip.status === 'number' && trip.status !== 0) {
    return routingError('NO_ROUTE', typeof trip.status_message === 'string' ? trip.status_message : 'No route found.');
  }

  if (!Array.isArray(trip.legs) || trip.legs.length === 0) {
    return routingError('MALFORMED_PROVIDER_RESPONSE', 'Valhalla response is missing route legs.');
  }

  const legs = trip.legs.filter((leg): leg is ValhallaLeg => Boolean(leg) && typeof leg === 'object');
  const coordinates = dedupeConsecutiveCoordinates(legs.flatMap((leg) => coordinatesFromValhallaShape(leg.shape)));
  if (coordinates.length < 2) {
    return routingError('MALFORMED_PROVIDER_RESPONSE', 'Valhalla route geometry is malformed.');
  }

  const summary = trip.summary ?? legs[0].summary ?? {};
  const durationSeconds = numberOrNull(summary.time);
  const lengthMiles = numberOrNull(summary.length);
  if (durationSeconds === null || lengthMiles === null || durationSeconds <= 0 || lengthMiles <= 0) {
    return routingError('MALFORMED_PROVIDER_RESPONSE', 'Valhalla route summary is malformed.');
  }

  return {
    provider: 'valhalla',
    costing: 'auto',
    distanceMeters: lengthMiles * METERS_PER_MILE,
    durationSeconds,
    geometry: { type: 'LineString', coordinates },
    attribution: ROUTE_ATTRIBUTION,
  };
}

export function decodeValhallaPolyline6(shape: string): [number, number][] {
  const coordinates: [number, number][] = [];
  const factor = 1_000_000;
  let index = 0;
  let lat = 0;
  let lon = 0;

  while (index < shape.length) {
    const latResult = decodeSignedValue(shape, index);
    index = latResult.nextIndex;
    const lonResult = decodeSignedValue(shape, index);
    index = lonResult.nextIndex;
    lat += latResult.value;
    lon += lonResult.value;
    coordinates.push([lon / factor, lat / factor]);
  }

  return coordinates;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function invalidGeometry(message: string): DestinationResolveResult {
  return { ok: false, error: routingError('INVALID_GEOMETRY', message) };
}

function destination(point: RouteCoordinate): DestinationResolveResult {
  return { ok: true, destination: point };
}

function pointFromPosition(position: unknown): RouteCoordinate | null {
  if (!Array.isArray(position)) return null;
  const [lon, lat] = position;
  return isValidLongitude(lon) && isValidLatitude(lat) ? { lat, lon } : null;
}

function validPositions(positions: unknown): [number, number][] {
  if (!Array.isArray(positions)) return [];
  return positions.filter(
    (position): position is [number, number] =>
      Array.isArray(position) && isValidLongitude(position[0]) && isValidLatitude(position[1])
  );
}

function lineLengthMeters(line: GeoJSON.Position[]): number {
  const points = validPositions(line).map(([lon, lat]) => ({ lon, lat }));
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += distanceMeters(points[index - 1], points[index]);
  }
  return length;
}

function lineMidpoint(line: GeoJSON.Position[]): RouteCoordinate | null {
  const points = validPositions(line).map(([lon, lat]) => ({ lon, lat }));
  if (points.length < 2) return null;

  const totalLength = lineLengthMeters(line);
  if (totalLength <= 0) return points[0];
  const target = totalLength / 2;
  let walked = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const segmentLength = distanceMeters(previous, current);
    if (walked + segmentLength >= target) {
      const ratio = segmentLength === 0 ? 0 : (target - walked) / segmentLength;
      return {
        lat: previous.lat + (current.lat - previous.lat) * ratio,
        lon: previous.lon + (current.lon - previous.lon) * ratio,
      };
    }
    walked += segmentLength;
  }
  return points[points.length - 1];
}

function polygonRepresentativePoint(polygon: GeoJSON.Position[][]): RouteCoordinate | null {
  const outerRing = validPositions(polygon[0]);
  if (outerRing.length < 4) return null;
  const openRing = samePosition(outerRing[0], outerRing[outerRing.length - 1]) ? outerRing.slice(0, -1) : outerRing;
  const centroid = ringCentroid(openRing);
  return centroid ?? { lon: openRing[0][0], lat: openRing[0][1] };
}

function polygonAreaMeters(polygon: GeoJSON.Position[][]): number {
  const outer = validPositions(polygon[0]);
  if (outer.length < 4) return 0;
  return Math.abs(projectedRingArea(outer));
}

function ringCentroid(ring: [number, number][]): RouteCoordinate | null {
  if (ring.length === 0) return null;
  const area = projectedRingArea(ring);
  if (Math.abs(area) < 1e-9) {
    const sums = ring.reduce((acc, [lon, lat]) => ({ lon: acc.lon + lon, lat: acc.lat + lat }), { lon: 0, lat: 0 });
    return { lon: sums.lon / ring.length, lat: sums.lat / ring.length };
  }
  let cx = 0;
  let cy = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const [x0, y0] = ring[index];
    const [x1, y1] = ring[(index + 1) % ring.length];
    const cross = x0 * y1 - x1 * y0;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  return { lon: cx / (6 * area), lat: cy / (6 * area) };
}

function projectedRingArea(ring: [number, number][]): number {
  if (ring.length < 3) return 0;
  const averageLat = ring.reduce((sum, [, lat]) => sum + lat, 0) / ring.length;
  const latScale = 111_320;
  const lonScale = Math.cos(toRadians(averageLat)) * 111_320;
  let area = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const [lonA, latA] = ring[index];
    const [lonB, latB] = ring[(index + 1) % ring.length];
    area += lonA * lonScale * (latB * latScale) - lonB * lonScale * (latA * latScale);
  }
  return area / 2;
}

function samePosition(a: [number, number], b: [number, number]): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function coordinatesFromValhallaShape(shape: unknown): [number, number][] {
  if (typeof shape === 'string') return decodeValhallaPolyline6(shape);
  if (!shape || typeof shape !== 'object') return [];
  const candidate = shape as { type?: unknown; coordinates?: unknown };
  if (candidate.type !== 'LineString') return [];
  return validPositions(candidate.coordinates);
}

function dedupeConsecutiveCoordinates(coordinates: [number, number][]): [number, number][] {
  const deduped: [number, number][] = [];
  for (const coordinate of coordinates) {
    const previous = deduped[deduped.length - 1];
    if (!previous || previous[0] !== coordinate[0] || previous[1] !== coordinate[1]) deduped.push(coordinate);
  }
  return deduped;
}

function decodeSignedValue(shape: string, startIndex: number): { value: number; nextIndex: number } {
  let result = 0;
  let shift = 0;
  let index = startIndex;
  let byte = 0;
  do {
    byte = shape.charCodeAt(index) - 63;
    index += 1;
    result |= (byte & 0x1f) << shift;
    shift += 5;
  } while (byte >= 0x20 && index < shape.length + 1);
  return { value: result & 1 ? ~(result >> 1) : result >> 1, nextIndex: index };
}

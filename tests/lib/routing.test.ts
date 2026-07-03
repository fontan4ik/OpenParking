import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/route/route';
import {
  decodeValhallaPolyline6,
  distanceMeters,
  formatDistance,
  formatDuration,
  formatRouteSummary,
  normalizeValhallaRouteResponse,
  resolveParkingDestination,
  toValhallaRouteRequest,
  validateRouteRequest,
} from '@/lib/routing';

afterEach(() => {
  vi.unstubAllGlobals();
});

function routeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const miamiStart = { lat: 25.761681, lon: -80.191788 };
const miamiDestination = { lat: 25.766123, lon: -80.193456 };
const seattle = { lat: 47.6062, lon: -122.3321 };

describe('routing validation helpers', () => {
  it('accepts valid Miami auto-route coordinates', () => {
    const result = validateRouteRequest({ start: miamiStart, destination: miamiDestination, costing: 'auto' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request).toMatchObject({ start: miamiStart, destination: miamiDestination, costing: 'auto' });
      expect(result.directDistanceMeters).toBeGreaterThan(400);
    }
  });

  it('rejects invalid coordinate values with INVALID_COORDINATES', () => {
    for (const coordinate of [
      { lat: 91, lon: -80 },
      { lat: 25, lon: -181 },
      { lat: Number.NaN, lon: -80 },
      { lat: Number.POSITIVE_INFINITY, lon: -80 },
      { lat: '25.7', lon: -80 },
      null,
    ]) {
      expect(validateRouteRequest({ start: coordinate, destination: miamiDestination, costing: 'auto' })).toMatchObject({
        ok: false,
        error: { code: 'INVALID_COORDINATES' },
      });
    }
  });

  it('rejects unsupported costing modes and long routes', () => {
    expect(validateRouteRequest({ start: miamiStart, destination: miamiDestination, costing: 'pedestrian' })).toMatchObject({
      ok: false,
      error: { code: 'UNSUPPORTED_COSTING' },
    });
    expect(validateRouteRequest({ start: miamiStart, destination: seattle, costing: 'auto' })).toMatchObject({
      ok: false,
      error: { code: 'ROUTE_TOO_LONG' },
    });
  });

  it('formats route distance and duration summaries', () => {
    expect(formatDistance(1_609.344)).toBe('1.0 mi');
    expect(formatDuration(60)).toBe('1 min');
    expect(formatRouteSummary(1_609.344, 60)).toBe('1.0 mi · 1 min');
  });

  it('builds Valhalla auto request using lat/lon coordinates', () => {
    expect(toValhallaRouteRequest({ start: miamiStart, destination: miamiDestination, costing: 'auto' })).toEqual({
      locations: [miamiStart, miamiDestination],
      costing: 'auto',
      directions_options: { units: 'miles' },
      shape_format: 'geojson',
    });
  });
});

describe('parking destination resolver', () => {
  it('resolves common parking geometries', () => {
    expect(resolveParkingDestination({ type: 'Point', coordinates: [-80.19, 25.76] })).toEqual({
      ok: true,
      destination: { lat: 25.76, lon: -80.19 },
    });
    expect(
      resolveParkingDestination(
        { type: 'MultiPoint', coordinates: [[-81, 26], [-80.192, 25.762]] },
        miamiStart
      )
    ).toEqual({ ok: true, destination: { lat: 25.762, lon: -80.192 } });

    const line = resolveParkingDestination({ type: 'LineString', coordinates: [[-80.2, 25.7], [-80.18, 25.7]] });
    expect(line).toMatchObject({ ok: true });
    if (line.ok) expect(line.destination.lon).toBeCloseTo(-80.19, 3);

    const polygon = resolveParkingDestination({
      type: 'Polygon',
      coordinates: [[[-80.2, 25.7], [-80.1, 25.7], [-80.1, 25.8], [-80.2, 25.8], [-80.2, 25.7]]],
    });
    expect(polygon).toMatchObject({ ok: true });
  });

  it('rejects malformed and empty geometries with INVALID_GEOMETRY', () => {
    expect(resolveParkingDestination({ type: 'Point', coordinates: [-200, 25] })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_GEOMETRY' },
    });
    expect(resolveParkingDestination({ type: 'LineString', coordinates: [] })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_GEOMETRY' },
    });
    expect(resolveParkingDestination({ type: 'LineString', coordinates: [[-80.19, 25.76]] })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_GEOMETRY' },
    });
    expect(resolveParkingDestination(null)).toMatchObject({ ok: false, error: { code: 'INVALID_GEOMETRY' } });
  });
});

describe('Valhalla response normalization', () => {
  it('normalizes GeoJSON route shapes and preserves [lon, lat] coordinate order', () => {
    const normalized = normalizeValhallaRouteResponse({
      trip: {
        status: 0,
        summary: { time: 180, length: 1.5 },
        legs: [{ shape: { type: 'LineString', coordinates: [[-80.191788, 25.761681], [-80.193456, 25.766123]] } }],
      },
    });
    expect(normalized).toMatchObject({ provider: 'valhalla', costing: 'auto', durationSeconds: 180, geometry: { type: 'LineString' } });
    if ('geometry' in normalized) {
      expect(normalized.geometry.coordinates[0]).toEqual([-80.191788, 25.761681]);
      expect(normalized.distanceMeters).toBeCloseTo(2_414.016, 3);
    }
  });

  it('decodes Valhalla polyline6 fallback into GeoJSON coordinate order', () => {
    expect(decodeValhallaPolyline6('_izlhA~rlgdF_{geC~ywl@_kwzCn`{nI')).toEqual([
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ]);
  });

  it('maps no-route and malformed provider responses to stable error codes', () => {
    expect(normalizeValhallaRouteResponse({ trip: { status: 1, status_message: 'No route found' } })).toEqual({
      code: 'NO_ROUTE',
      message: 'No route found',
    });
    expect(
      normalizeValhallaRouteResponse({ trip: { status: 0, summary: { time: 180, length: 1.5 }, legs: [{ shape: { type: 'LineString', coordinates: [[-80.191788, 25.761681]] } }] } })
    ).toEqual({ code: 'MALFORMED_PROVIDER_RESPONSE', message: 'Valhalla route geometry is malformed.' });
  });
});

describe('routing distance helper', () => {
  it('computes finite route distances in meters', () => {
    expect(distanceMeters(miamiStart, miamiDestination)).toBeGreaterThan(400);
    expect(distanceMeters(miamiStart, miamiDestination)).toBeLessThan(700);
  });
});

describe('POST /api/route handler', () => {
  it('returns INVALID_COORDINATES before provider calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await POST(routeRequest({ start: { lat: 91, lon: -80 }, destination: miamiDestination, costing: 'auto' }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: 'INVALID_COORDINATES', message: 'Start and destination must include finite lat/lon coordinates.' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns ROUTE_TOO_LONG before provider calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await POST(routeRequest({ start: miamiStart, destination: seattle, costing: 'auto' }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'ROUTE_TOO_LONG' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps provider 500 to ROUTE_SERVICE_UNAVAILABLE', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('provider down', { status: 500 })));
    const response = await POST(routeRequest({ start: miamiStart, destination: miamiDestination, costing: 'auto' }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: 'ROUTE_SERVICE_UNAVAILABLE', message: 'Routing service is unavailable.' } });
  });

  it('returns normalized successful Valhalla route shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          trip: {
            status: 0,
            summary: { time: 120, length: 0.5 },
            legs: [{ shape: { type: 'LineString', coordinates: [[-80.191788, 25.761681], [-80.193456, 25.766123]] } }],
          },
        })
      )
    );
    const response = await POST(routeRequest({ start: miamiStart, destination: miamiDestination, costing: 'auto' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      provider: 'valhalla',
      costing: 'auto',
      distanceMeters: expect.any(Number),
      durationSeconds: 120,
      geometry: { type: 'LineString', coordinates: [[-80.191788, 25.761681], [-80.193456, 25.766123]] },
      attribution: 'Routing by Valhalla with OpenStreetMap data',
    });
  });
});

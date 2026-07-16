/* ═══════════════════════════════════════════════════════════════
   GET /api/geocode/forward — route handler tests
   ═══════════════════════════════════════════════════════════════ */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock the geocoding library so we control what forwardGeocode returns
// without needing a real API key or network.
vi.mock('@/lib/geocoding', () => ({
  forwardGeocode: vi.fn(),
}));

import { GET } from '@/app/api/geocode/forward/route';
import { forwardGeocode } from '@/lib/geocoding';

/** Build a minimal mock NextRequest-like object. */
function mockRequest(searchParams: Record<string, string>): Parameters<typeof GET>[0] {
  const url = new URL('http://localhost/api/geocode/forward');
  for (const [key, value] of Object.entries(searchParams)) {
    url.searchParams.set(key, value);
  }
  return { nextUrl: url } as Parameters<typeof GET>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/geocode/forward', () => {
  it('returns 200 with results when library returns ok', async () => {
    vi.mocked(forwardGeocode).mockResolvedValueOnce({
      results: [
        {
          formatted: '123 Main St, City, State',
          lat: 40.71,
          lng: -74.01,
          placeType: 'address',
          confidence: 9,
          components: { road: 'Main St' },
        },
      ],
      status: 'ok',
    });

    const response = await GET(mockRequest({ q: '123 Main St', limit: '5', language: 'en' }));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.results).toHaveLength(1);
    expect(body.results[0].formatted).toBe('123 Main St, City, State');
  });

  it('returns Cache-Control headers on success', async () => {
    vi.mocked(forwardGeocode).mockResolvedValueOnce({
      results: [{ formatted: 'X', lat: 1, lng: 2, placeType: 'address', confidence: 5, components: {} }],
      status: 'ok',
    });

    const response = await GET(mockRequest({ q: 'Test', limit: '1' }));
    expect(response.headers.get('Cache-Control')).toMatch(/max-age=60/);
  });

  it('returns 400 for validation error', async () => {
    vi.mocked(forwardGeocode).mockResolvedValueOnce({
      results: [],
      status: 'error',
      error: 'q must be at least 3 characters',
      errorType: 'validation',
    });

    const response = await GET(mockRequest({ q: 'ab' }));
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.status).toBe('error');
    expect(body.errorType).toBe('validation');
    expect(body.error).toContain('3 characters');
    expect(body.results).toEqual([]);
  });

  it('returns 502 for provider error', async () => {
    vi.mocked(forwardGeocode).mockResolvedValueOnce({
      results: [],
      status: 'error',
      error: 'Provider returned status 502',
      errorType: 'provider',
    });

    const response = await GET(mockRequest({ q: 'Valid Query' }));
    expect(response.status).toBe(502);

    const body = await response.json();
    expect(body.status).toBe('error');
    expect(body.errorType).toBe('provider');
    expect(body.error).toContain('Provider returned status 502');
    expect(body.results).toEqual([]);
  });

  it('returns 200 with unconfigured status when API key is missing', async () => {
    vi.mocked(forwardGeocode).mockResolvedValueOnce({
      results: [],
      status: 'unconfigured',
    });

    const response = await GET(mockRequest({ q: 'Main St' }));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('unconfigured');
    expect(body.results).toEqual([]);
  });

  it('passes undefined params as empty input when omitted', async () => {
    vi.mocked(forwardGeocode).mockResolvedValueOnce({
      results: [],
      status: 'error',
      error: 'q is required and must be a non-empty string',
      errorType: 'validation',
    });

    const response = await GET(mockRequest({}));
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.status).toBe('error');
    expect(body.error).toContain('q is required');
  });

  it('passes only provided search params to library', async () => {
    vi.mocked(forwardGeocode).mockResolvedValueOnce({
      results: [],
      status: 'ok',
    });

    await GET(mockRequest({ q: 'Test', language: 'ru' }));
    expect(forwardGeocode).toHaveBeenCalledWith(
      { q: 'Test', language: 'ru' },
      expect.any(AbortSignal),
    );
  });
});

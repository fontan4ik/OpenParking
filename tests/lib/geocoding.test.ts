/* ═══════════════════════════════════════════════════════════════
   geocoding.ts — library unit tests
   ═══════════════════════════════════════════════════════════════ */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  validateForwardParams,
  normalizeCacheKey,
  sanitizeProviderResult,
  fetchForwardGeocode,
  forwardGeocode,
  expandGeocodeQueries,
  __resetCache,
} from '@/lib/geocoding';

beforeEach(() => {
  __resetCache();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ───────────────────────────────────────────────────────────────
// validateForwardParams
// ───────────────────────────────────────────────────────────────

describe('validateForwardParams', () => {
  it('accepts valid input with all fields', () => {
    const result = validateForwardParams({ q: '1600 Pennsylvania Ave', limit: 5, language: 'en' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.params.q).toBe('1600 Pennsylvania Ave');
      expect(result.params.limit).toBe(5);
      expect(result.params.language).toBe('en');
    }
  });

  it('accepts valid Russian input', () => {
    const result = validateForwardParams({ q: 'Москва, Кремль', limit: 3, language: 'ru' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.params.language).toBe('ru');
    }
  });

  it('rejects input that is not an object', () => {
    expect(validateForwardParams(null as unknown as Record<string, unknown>).ok).toBe(false);
    expect(validateForwardParams('string' as unknown as Record<string, unknown>).ok).toBe(false);
  });

  it('rejects missing q', () => {
    const result = validateForwardParams({ limit: 5 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('q is required');
  });

  it('rejects empty q string', () => {
    const result = validateForwardParams({ q: '   ' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('q is required');
  });

  it('rejects q shorter than 3 characters', () => {
    const result = validateForwardParams({ q: 'ab' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/at least 3/);
  });

  it('rejects q longer than 400 characters', () => {
    const result = validateForwardParams({ q: 'x'.repeat(401) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not exceed 400/);
  });

  it('trims leading/trailing whitespace from q', () => {
    const result = validateForwardParams({ q: '  Main St  ' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.params.q).toBe('Main St');
  });

  it('defaults limit to 5 when omitted', () => {
    const result = validateForwardParams({ q: 'Main St' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.params.limit).toBe(5);
  });

  it('parses string limit', () => {
    const result = validateForwardParams({ q: 'Main St', limit: '3' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.params.limit).toBe(3);
  });

  it('rejects limit below 1', () => {
    const result = validateForwardParams({ q: 'Main St', limit: 0 });
    expect(result.ok).toBe(false);
  });

  it('rejects limit above 10', () => {
    const result = validateForwardParams({ q: 'Main St', limit: 11 });
    expect(result.ok).toBe(false);
  });

  it('rejects non-numeric limit', () => {
    const result = validateForwardParams({ q: 'Main St', limit: 'abc' });
    expect(result.ok).toBe(false);
  });

  it('defaults language to en when omitted', () => {
    const result = validateForwardParams({ q: 'Main St' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.params.language).toBe('en');
  });

  it('rejects unsupported language', () => {
    const result = validateForwardParams({ q: 'Main St', language: 'fr' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('language');
  });
});

// ───────────────────────────────────────────────────────────────
// expandGeocodeQueries
// ───────────────────────────────────────────────────────────────

describe('expandGeocodeQueries', () => {
  it('returns single candidate for Latin-only query', () => {
    expect(expandGeocodeQueries('Miami Beach')).toEqual(['Miami Beach']);
  });

  it('returns single candidate for empty-Latin mixed query', () => {
    expect(expandGeocodeQueries('Main St')).toEqual(['Main St']);
  });

  it('expands майами оушен драйв to include Miami Ocean Drive', () => {
    const candidates = expandGeocodeQueries('майами оушен драйв');
    expect(candidates[0]).toBe('майами оушен драйв');
    expect(candidates).toContain('Miami Ocean Drive');
  });

  it('expands Майами Бич Оушен Драйв to include Miami Beach Ocean Drive', () => {
    const candidates = expandGeocodeQueries('Майами Бич Оушен Драйв');
    expect(candidates[0]).toBe('Майами Бич Оушен Драйв');
    expect(candidates).toContain('Miami Beach Ocean Drive');
  });

  it('preserves Latin tokens in mixed input', () => {
    const candidates = expandGeocodeQueries('майами beach');
    expect(candidates).toContain('Miami beach');
  });

  it('uses char transliteration for unknown Cyrillic tokens', () => {
    // 'здесь' is not in the alias table → char transliteration
    const candidates = expandGeocodeQueries('парк здесь');
    expect(candidates).toContain('Park zdes');
  });

  it('deduplicates candidates', () => {
    // If query has no alias entries, original and expanded could be same
    // but generally they differ — test dedup logic
    const candidates = expandGeocodeQueries('майами');
    expect(candidates).toEqual(['майами', 'Miami']);
  });

  it('handles hyphenated compound alias terms', () => {
    const candidates = expandGeocodeQueries('нью-йорк');
    expect(candidates[0]).toBe('нью-йорк');
    // 'нью-йорк' is not a single alias key (it's hyphenated).
    // Tokenization by whitespace keeps it as one token → char translit fallback
    // Both parts are separate alias entries though.
    const expanded = candidates.find((c) => c !== 'нью-йорк') ?? '';
    expect(expanded).toBeTruthy();
  });
});

// ───────────────────────────────────────────────────────────────
// normalizeCacheKey
// ───────────────────────────────────────────────────────────────

describe('normalizeCacheKey', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalizeCacheKey('  Main  St  ', 'en')).toBe('main st|en');
  });

  it('includes language in the key', () => {
    expect(normalizeCacheKey('Main St', 'ru')).toBe('main st|ru');
  });

  it('produces different keys for different languages', () => {
    const a = normalizeCacheKey('Main St', 'en');
    const b = normalizeCacheKey('Main St', 'ru');
    expect(a).not.toBe(b);
  });
});

// ───────────────────────────────────────────────────────────────
// sanitizeProviderResult
// ───────────────────────────────────────────────────────────────

describe('sanitizeProviderResult', () => {
  it('returns empty array for null/undefined', () => {
    expect(sanitizeProviderResult(null)).toEqual([]);
    expect(sanitizeProviderResult(undefined as unknown as Record<string, unknown>)).toEqual([]);
  });

  it('returns empty array for non-object', () => {
    expect(sanitizeProviderResult('string')).toEqual([]);
  });

  it('returns empty array when results is missing', () => {
    expect(sanitizeProviderResult({})).toEqual([]);
  });

  it('returns empty array when results is not an array', () => {
    expect(sanitizeProviderResult({ results: 'not-array' })).toEqual([]);
  });

  it('sanitizes a valid result entry', () => {
    const raw = {
      results: [
        {
          formatted: '1600 Pennsylvania Ave NW, Washington, DC 20500, USA',
          geometry: { lat: 38.8977, lng: -77.0365 },
          confidence: 10,
          components: {
            house_number: '1600',
            road: 'Pennsylvania Ave NW',
            city: 'Washington',
            state: 'DC',
            country: 'USA',
          },
        },
      ],
    };

    const results = sanitizeProviderResult(raw);
    expect(results).toHaveLength(1);
    expect(results[0].formatted).toBe('1600 Pennsylvania Ave NW, Washington, DC 20500, USA');
    expect(results[0].lat).toBeCloseTo(38.8977);
    expect(results[0].lng).toBeCloseTo(-77.0365);
    expect(results[0].confidence).toBe(10);
    expect(results[0].placeType).toBe('address');
    expect(results[0].components.road).toBe('Pennsylvania Ave NW');
  });

  it('derives placeType from components', () => {
    const addr = sanitizeProviderResult({
      results: [{ formatted: 'x', geometry: { lat: 1, lng: 2 }, confidence: 1, components: { house_number: '1', road: 'Main' } }],
    });
    expect(addr[0].placeType).toBe('address');

    const street = sanitizeProviderResult({
      results: [{ formatted: 'x', geometry: { lat: 1, lng: 2 }, confidence: 1, components: { road: 'Main St' } }],
    });
    expect(street[0].placeType).toBe('street');

    const city = sanitizeProviderResult({
      results: [{ formatted: 'x', geometry: { lat: 1, lng: 2 }, confidence: 1, components: { city: 'Springfield' } }],
    });
    expect(city[0].placeType).toBe('city');

    const state = sanitizeProviderResult({
      results: [{ formatted: 'x', geometry: { lat: 1, lng: 2 }, confidence: 1, components: { state: 'IL' } }],
    });
    expect(state[0].placeType).toBe('state');

    const country = sanitizeProviderResult({
      results: [{ formatted: 'x', geometry: { lat: 1, lng: 2 }, confidence: 1, components: { country: 'USA' } }],
    });
    expect(country[0].placeType).toBe('country');

    const unknown = sanitizeProviderResult({
      results: [{ formatted: 'x', geometry: { lat: 1, lng: 2 }, confidence: 1, components: { foo: 'bar' } }],
    });
    expect(unknown[0].placeType).toBe('unknown');
  });

  it('skips entries without valid geometry', () => {
    const raw = {
      results: [
        { formatted: 'Good', geometry: { lat: 1, lng: 2 }, confidence: 1, components: {} },
        { formatted: 'No geometry' },
        { formatted: 'Partial', geometry: { lat: 1 }, confidence: 1, components: {} },
      ],
    };
    expect(sanitizeProviderResult(raw)).toHaveLength(1);
  });

  it('skips non-object entries in results array', () => {
    const raw = { results: [null, 'string', { formatted: 'x', geometry: { lat: 1, lng: 2 }, confidence: 1, components: {} }] };
    expect(sanitizeProviderResult(raw)).toHaveLength(1);
  });
});

// ───────────────────────────────────────────────────────────────
// forwardGeocode — integration with mocked fetch
// ───────────────────────────────────────────────────────────────

describe('forwardGeocode', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    __resetCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('returns unconfigured when OPENCAGE_API_KEY is missing', async () => {
    vi.unstubAllEnvs();
    const result = await forwardGeocode({ q: 'Main St', limit: '5' });
    expect(result.status).toBe('unconfigured');
    expect(result.results).toEqual([]);
  });

  it('returns validation error for invalid input', async () => {
    vi.stubEnv('OPENCAGE_API_KEY', 'test-key');
    const result = await forwardGeocode({ q: 'ab' });
    expect(result.status).toBe('error');
    expect(result.error).toBeDefined();
    expect(result.errorType).toBe('validation');
    expect(result.results).toEqual([]);
  });

  it('fetches from provider and returns sanitized results', async () => {
    vi.stubEnv('OPENCAGE_API_KEY', 'test-key');
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            formatted: '123 Main St',
            geometry: { lat: 40.71, lng: -74.01 },
            confidence: 9,
            components: { house_number: '123', road: 'Main St' },
          },
        ],
      }),
    } as Response);

    const result = await forwardGeocode({ q: '123 Main St', limit: '5', language: 'en' });
    expect(result.status).toBe('ok');
    expect(result.results).toHaveLength(1);
    expect(result.results[0].formatted).toBe('123 Main St');

    // Verify the fetch URL includes required params
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('api.opencagedata.com/geocode/v1/json');
    expect(calledUrl).toContain('key=test-key');
    expect(calledUrl).toContain('no_annotations=1');
  });

  it('returns provider error on provider failure', async () => {
    vi.stubEnv('OPENCAGE_API_KEY', 'test-key');
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
    } as Response);

    const result = await forwardGeocode({ q: 'Main St' });
    expect(result.status).toBe('error');
    expect(result.errorType).toBe('provider');
    expect(result.error).toContain('Provider returned status 401');
    expect(result.results).toEqual([]);
  });

  it('returns provider error on network failure', async () => {
    vi.stubEnv('OPENCAGE_API_KEY', 'test-key');
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

    const result = await forwardGeocode({ q: 'Main St' });
    expect(result.status).toBe('error');
    expect(result.errorType).toBe('provider');
    expect(result.error).toBe('Network error');
  });

  it('caches results and returns cached on subsequent call', async () => {
    vi.stubEnv('OPENCAGE_API_KEY', 'test-key');
    const mockFetch = vi.mocked(fetch);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            formatted: '123 Main St',
            geometry: { lat: 40.71, lng: -74.01 },
            confidence: 9,
            components: { road: 'Main St' },
          },
        ],
      }),
    } as Response);

    // First call — fetches
    const first = await forwardGeocode({ q: '123 Main St', language: 'en' });
    expect(first.status).toBe('ok');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Second call with same query and language — uses cache
    const second = await forwardGeocode({ q: '123 Main St', language: 'en' });
    expect(second.status).toBe('ok');
    expect(second.results).toEqual(first.results);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('cache differentiates by language', async () => {
    vi.stubEnv('OPENCAGE_API_KEY', 'test-key');
    const mockFetch = vi.mocked(fetch);

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            formatted: 'Place',
            geometry: { lat: 1, lng: 2 },
            confidence: 5,
            components: {},
          },
        ],
      }),
    } as Response);

    await forwardGeocode({ q: 'Place', language: 'en' });
    await forwardGeocode({ q: 'Place', language: 'ru' });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('cache normalises whitespace for key matching', async () => {
    vi.stubEnv('OPENCAGE_API_KEY', 'test-key');
    const mockFetch = vi.mocked(fetch);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            formatted: 'Result',
            geometry: { lat: 1, lng: 2 },
            confidence: 5,
            components: {},
          },
        ],
      }),
    } as Response);

    await forwardGeocode({ q: '   Main   St   ' });
    const after = await forwardGeocode({ q: 'Main St' });

    expect(after.status).toBe('ok');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does not use stale cache entries', async () => {
    vi.useFakeTimers();
    vi.stubEnv('OPENCAGE_API_KEY', 'test-key');
    const mockFetch = vi.mocked(fetch);

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            formatted: 'Stale',
            geometry: { lat: 1, lng: 2 },
            confidence: 5,
            components: {},
          },
        ],
      }),
    } as Response);

    await forwardGeocode({ q: 'Test' });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Advance time past cache TTL
    vi.advanceTimersByTime(5 * 60 * 1_000 + 1);

    await forwardGeocode({ q: 'Test' });
    expect(mockFetch).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});

describe('Cyrillic expansion fallback', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    __resetCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  // ───────────────────────────────────────────────────────────
  // Integration tests
  // ───────────────────────────────────────────────────────────

  it('falls back to expanded candidate when original returns empty', async () => {
    vi.stubEnv('OPENCAGE_API_KEY', 'test-key');
    const mockFetch = vi.mocked(fetch);

    // Original Cyrillic → empty
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    } as Response);

    // Expanded English → result
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{
          formatted: 'Miami Ocean Drive, Miami Beach, FL, USA',
          geometry: { lat: 25.76, lng: -80.13 },
          confidence: 9,
          components: { road: 'Ocean Drive', city: 'Miami Beach' },
        }],
      }),
    } as Response);

    const result = await forwardGeocode({ q: 'майами оушен драйв' });

    expect(result.status).toBe('ok');
    expect(result.results).toHaveLength(1);
    expect(result.results[0].formatted).toContain('Miami');
    expect(result.results[0].formatted).toContain('Ocean Drive');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('does not expand when Cyrillic original already returns results', async () => {
    vi.stubEnv('OPENCAGE_API_KEY', 'test-key');
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{
          formatted: 'Some Result',
          geometry: { lat: 1, lng: 2 },
          confidence: 5,
          components: {},
        }],
      }),
    } as Response);

    const result = await forwardGeocode({ q: 'майами' });

    expect(result.status).toBe('ok');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns empty ok when all candidates return empty', async () => {
    vi.stubEnv('OPENCAGE_API_KEY', 'test-key');
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    } as Response);

    const result = await forwardGeocode({ q: 'майами оушен драйв' });

    expect(result.status).toBe('ok');
    expect(result.results).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('still fetches once for English-only queries', async () => {
    vi.stubEnv('OPENCAGE_API_KEY', 'test-key');
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{
          formatted: 'Result',
          geometry: { lat: 1, lng: 2 },
          confidence: 5,
          components: {},
        }],
      }),
    } as Response);

    const result = await forwardGeocode({ q: 'Miami Beach' });
    expect(result.status).toBe('ok');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// ───────────────────────────────────────────────────────────────
// fetchForwardGeocode (lower-level)
// ───────────────────────────────────────────────────────────────

describe('fetchForwardGeocode', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('throws when API key is missing', async () => {
    vi.unstubAllEnvs();
    await expect(
      fetchForwardGeocode({ q: 'Test', limit: 5, language: 'en' }),
    ).rejects.toThrow('OPENCAGE_API_KEY is not configured');
  });

  it('throws on non-OK response', async () => {
    vi.stubEnv('OPENCAGE_API_KEY', 'test-key');
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 402,
    } as Response);

    await expect(
      fetchForwardGeocode({ q: 'Test', limit: 5, language: 'en' }),
    ).rejects.toThrow('Provider returned status 402');
  });
});

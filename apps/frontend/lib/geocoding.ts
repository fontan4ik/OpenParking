/* ═══════════════════════════════════════════════════════════════
   OpenCage forward-geocoding library.
   Server-side only — never expose OPENCAGE_API_KEY to the client.
   // allow: SIZE_OK — pure-data alias/transliteration tables
   // inflate line count; single responsibility (geocoding).
   ═══════════════════════════════════════════════════════════════ */

// ───────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────

export interface ForwardGeocodeParams {
  q: string;
  limit: number;
  language: 'en' | 'ru';
}

export interface GeocodingResult {
  formatted: string;
  lat: number;
  lng: number;
  placeType: string;
  confidence: number;
  components: Record<string, string>;
}

export type GeocodingStatus = 'ok' | 'unconfigured' | 'error';

export interface GeocodingResponse {
  results: GeocodingResult[];
  status: GeocodingStatus;
  error?: string;
  errorType?: 'validation' | 'provider';
}

// ───────────────────────────────────────────────────────────────
// Constants
// ───────────────────────────────────────────────────────────────

const OPENCAGE_BASE = 'https://api.opencagedata.com/geocode/v1/json';
const FETCH_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 5 * 60 * 1_000;
const MAX_CACHE_ENTRIES = 100;

const SUPPORTED_LANGUAGES = new Set(['en', 'ru']);
const MAX_Q_LENGTH = 400;
const MIN_Q_LENGTH = 3;
const DEFAULT_LIMIT = 5;
const MIN_LIMIT = 1;
const MAX_LIMIT = 10;

// ───────────────────────────────────────────────────────────────
// Cyrillic phonetic expansion for US address queries
// ───────────────────────────────────────────────────────────────

const CYRILLIC_RE = /[а-яёА-ЯЁ]/;

/** Auditable alias table: common Russian-phonetic US terms → English. */
const ALIAS_MAP: Record<string, string> = {
  'майами': 'Miami',
  'оушен': 'Ocean',
  'драйв': 'Drive',
  'бич': 'Beach',
  'стрит': 'Street',
  'авеню': 'Avenue',
  'бульвар': 'Boulevard',
  'парк': 'Park',
  'роуд': 'Road',
  'лейн': 'Lane',
  'плейс': 'Place',
  'уэй': 'Way',
  'саус': 'South',
  'норс': 'North',
  'ист': 'East',
  'вест': 'West',
  'нью': 'New',
  'йорк': 'York',
  'лос': 'Los',
  'анджелес': 'Angeles',
  'сан': 'San',
  'франциско': 'Francisco',
  'чикаго': 'Chicago',
  'вашингтон': 'Washington',
  'бостон': 'Boston',
  'филадельфия': 'Philadelphia',
  'сиэтл': 'Seattle',
  'денвер': 'Denver',
};

/** Character-level transliteration fallback for tokens not in ALIAS_MAP. */
const CHAR_MAP: Record<string, string> = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd',
  'е': 'e', 'ё': 'e', 'ж': 'zh', 'з': 'z', 'и': 'i',
  'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n',
  'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't',
  'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch',
  'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '',
  'э': 'e', 'ю': 'yu', 'я': 'ya',
};

function hasCyrillic(s: string): boolean {
  return CYRILLIC_RE.test(s);
}

function transliterateToken(token: string): string {
  const lower = token.toLowerCase();
  const alias = ALIAS_MAP[lower];
  if (alias) return alias;

  // Character-level fallback
  let result = '';
  for (const ch of lower) {
    const mapped = CHAR_MAP[ch];
    result += mapped !== undefined ? mapped : ch;
  }
  return result || token;
}

/** Deterministic query expansion for Cyrillic US address queries.
 *
 *  Returns one or more candidates: the original query always first,
 *  followed by alias-translated then character-transliterated variants.
 *  Returns `[query]` unchanged for Latin-only input.
 */
export function expandGeocodeQueries(query: string): string[] {
  const trimmed = query.trim();
  if (!hasCyrillic(trimmed)) return [trimmed];

  const candidates: string[] = [trimmed];

  const translatedTokens = trimmed
    .split(/\s+/)
    .map((t) => transliterateToken(t));
  const expanded = translatedTokens.join(' ');
  if (expanded !== trimmed && !candidates.includes(expanded)) {
    candidates.push(expanded);
  }

  return candidates;
}

// ───────────────────────────────────────────────────────────────
// Validation
// ───────────────────────────────────────────────────────────────

export function validateForwardParams(
  input: Record<string, unknown>,
): { ok: true; params: ForwardGeocodeParams } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Input must be an object' };
  }

  const { q, limit, language } = input as Record<string, unknown>;

  // q — required, trimmed, 3‑400 chars
  if (typeof q !== 'string' || q.trim().length === 0) {
    return { ok: false, error: 'q is required and must be a non-empty string' };
  }
  const trimmedQ = q.trim();
  if (trimmedQ.length < MIN_Q_LENGTH) {
    return { ok: false, error: `q must be at least ${MIN_Q_LENGTH} characters` };
  }
  if (trimmedQ.length > MAX_Q_LENGTH) {
    return { ok: false, error: `q must not exceed ${MAX_Q_LENGTH} characters` };
  }

  // limit — optional, parsed to number, clamped 1‑10
  let parsedLimit = DEFAULT_LIMIT;
  if (limit !== undefined && limit !== null) {
    const num =
      typeof limit === 'number' ? limit : Number(limit);
    if (!Number.isFinite(num) || num < MIN_LIMIT || num > MAX_LIMIT) {
      return { ok: false, error: `limit must be between ${MIN_LIMIT} and ${MAX_LIMIT}` };
    }
    parsedLimit = Math.round(num);
  }

  // language — optional, must be 'en' or 'ru'
  let parsedLanguage: 'en' | 'ru' = 'en';
  if (language !== undefined && language !== null) {
    const lang = String(language).toLowerCase();
    if (!SUPPORTED_LANGUAGES.has(lang)) {
      return {
        ok: false,
        error: `language must be one of: ${[...SUPPORTED_LANGUAGES].join(', ')}`,
      };
    }
    parsedLanguage = lang as 'en' | 'ru';
  }

  return {
    ok: true,
    params: { q: trimmedQ, limit: parsedLimit, language: parsedLanguage },
  };
}

// ───────────────────────────────────────────────────────────────
// Cache — bounded TTL, LRU-style eviction (by insertion order)
// ───────────────────────────────────────────────────────────────

interface CacheEntry {
  results: GeocodingResult[];
  expiresAt: number;
}

const geoCache = new Map<string, CacheEntry>();

/** Normalise cache key — lowercased, collapsed whitespace + language. */
export function normalizeCacheKey(q: string, language: string): string {
  return `${q.trim().toLowerCase().replace(/\s+/g, ' ')}|${language}`;
}

function getCached(key: string): GeocodingResult[] | undefined {
  const entry = geoCache.get(key);
  if (!entry) return undefined;
  if (Date.now() >= entry.expiresAt) {
    geoCache.delete(key);
    return undefined;
  }
  // Move to end (most recently used) by re-inserting
  geoCache.delete(key);
  geoCache.set(key, entry);
  return entry.results;
}

function setCache(key: string, results: GeocodingResult[]): void {
  const expiresAt = Date.now() + CACHE_TTL_MS;

  // Evict oldest entries when over capacity
  if (geoCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = geoCache.keys().next();
    if (!oldest.done) geoCache.delete(oldest.value);
  }

  geoCache.set(key, { results, expiresAt });
}

/** Reset the entire cache (testing only). */
export function __resetCache(): void {
  geoCache.clear();
}

// ───────────────────────────────────────────────────────────────
// Provider response sanitisation
// ───────────────────────────────────────────────────────────────

function derivePlaceType(components: Record<string, unknown>): string {
  if (typeof components.house_number === 'string' || typeof components.building === 'string') {
    return 'address';
  }
  if (typeof components.road === 'string' || typeof components.street === 'string') {
    return 'street';
  }
  if (
    typeof components.postcode === 'string' ||
    typeof components.suburb === 'string' ||
    typeof components.city_district === 'string'
  ) {
    return 'postcode';
  }
  if (
    typeof components.city === 'string' ||
    typeof components.town === 'string' ||
    typeof components.village === 'string'
  ) {
    return 'city';
  }
  if (typeof components.state === 'string' || typeof components.region === 'string') {
    return 'state';
  }
  if (typeof components.country === 'string') {
    return 'country';
  }
  return 'unknown';
}

export function sanitizeProviderResult(raw: unknown): GeocodingResult[] {
  if (!raw || typeof raw !== 'object') return [];

  const data = raw as Record<string, unknown>;
  if (!Array.isArray(data.results)) return [];

  const results: GeocodingResult[] = [];

  for (const item of data.results) {
    if (!item || typeof item !== 'object') continue;

    const obj = item as Record<string, unknown>;
    const geometry = obj.geometry;
    const geom =
      geometry && typeof geometry === 'object'
        ? (geometry as Record<string, unknown>)
        : null;

    const components =
      obj.components && typeof obj.components === 'object'
        ? (obj.components as Record<string, unknown>)
        : {};

    const formatted = typeof obj.formatted === 'string' ? obj.formatted : '';
    const lat = geom && typeof geom.lat === 'number' ? geom.lat : null;
    const lng = geom && typeof geom.lng === 'number' ? geom.lng : null;
    const confidence = typeof obj.confidence === 'number' ? obj.confidence : 0;

    // Skip entries with no valid coordinates
    if (lat === null || lng === null) continue;

    const placeType = derivePlaceType(components);

    // Convert components values to strings
    const stringComponents: Record<string, string> = {};
    for (const [key, value] of Object.entries(components)) {
      if (typeof value === 'string') {
        stringComponents[key] = value;
      }
    }

    results.push({ formatted, lat, lng, placeType, confidence, components: stringComponents });
  }

  return results;
}

// ───────────────────────────────────────────────────────────────
// Provider fetch
// ───────────────────────────────────────────────────────────────

export async function fetchForwardGeocode(
  params: ForwardGeocodeParams,
  signal?: AbortSignal,
): Promise<GeocodingResult[]> {
  const apiKey = process.env.OPENCAGE_API_KEY;
  if (!apiKey) {
    throw new Error('OPENCAGE_API_KEY is not configured');
  }

  const url = new URL(OPENCAGE_BASE);
  url.searchParams.set('q', params.q);
  url.searchParams.set('limit', String(params.limit));
  url.searchParams.set('language', params.language);
  url.searchParams.set('no_annotations', '1');
  url.searchParams.set('key', apiKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  // Combine caller signal with our timeout
  const combinedSignal = signal
    ? combineAbortSignals(signal, controller.signal)
    : controller.signal;

  try {
    const response = await fetch(url.toString(), {
      signal: combinedSignal,
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Provider returned status ${response.status}`);
    }

    const raw = (await response.json()) as unknown;
    return sanitizeProviderResult(raw);
  } finally {
    clearTimeout(timeout);
  }
}

/** Wire two AbortSignals together — whichever fires first aborts the returned one. */
function combineAbortSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  const controller = new AbortController();

  function onAbort(): void {
    controller.abort();
  }

  a.addEventListener('abort', onAbort, { once: true });
  b.addEventListener('abort', onAbort, { once: true });

  // Clean up listeners when the combined signal fires
  controller.signal.addEventListener('abort', () => {
    a.removeEventListener('abort', onAbort);
    b.removeEventListener('abort', onAbort);
  }, { once: true });

  return controller.signal;
}

// ───────────────────────────────────────────────────────────────
// High-level public API
// ───────────────────────────────────────────────────────────────

export async function forwardGeocode(
  input: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<GeocodingResponse> {
  // 1. Validate
  const validation = validateForwardParams(input);
  if (!validation.ok) {
    return { results: [], status: 'error', error: validation.error, errorType: 'validation' };
  }

  const { params: originalParams } = validation;

  // 2. Check API key
  if (!process.env.OPENCAGE_API_KEY) {
    return { results: [], status: 'unconfigured' };
  }

  // 3. Expand Cyrillic queries into candidate strings (original first)
  const candidates = expandGeocodeQueries(originalParams.q);

  // 4. Try each candidate — cache check then provider fetch,
  //    stopping at the first non-empty result.
  let lastProviderError: string | undefined;

  for (const q of candidates) {
    const cacheKey = normalizeCacheKey(q, originalParams.language);
    const cached = getCached(cacheKey);
    if (cached) {
      if (cached.length > 0) {
        return { results: cached, status: 'ok' };
      }
      continue; // cached empty result, skip
    }

    try {
      const fetchParams: ForwardGeocodeParams = { ...originalParams, q };
      const results = await fetchForwardGeocode(fetchParams, signal);
      setCache(cacheKey, results);
      if (results.length > 0) {
        return { results, status: 'ok' };
      }
      // Empty result — continue to next candidate
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Geocoding request failed';
      // Single candidate (Latin-only input) → propagate error immediately
      if (candidates.length === 1) {
        return { results: [], status: 'error', error: message, errorType: 'provider' };
      }
      lastProviderError = message;
      // Otherwise try the next candidate
    }
  }

  // All candidates exhausted
  if (lastProviderError) {
    return { results: [], status: 'error', error: lastProviderError, errorType: 'provider' };
  }
  return { results: [], status: 'ok' };
}

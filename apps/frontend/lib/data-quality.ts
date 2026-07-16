/* ═══════════════════════════════════════════════════════════════
   ParkingUSA — Data Quality Helpers
   Shared provenance, status derivation, safe URL, and metric helpers
   for loader, API, and UI layers. Pure functions; no React, no Prisma,
   no Node-only filesystem deps, no network calls.
   ═══════════════════════════════════════════════════════════════ */

import { hasKnownPrice } from '@/lib/price-utils';

/* ── URL Safety ───────────────────────────────────────────── */

const PRIVATE_HOST_RE = /^(?:localhost|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|0\.\d{1,3}\.\d{1,3}\.\d{1,3}|\[?::1\]?|\[?0+(?::0+)+\]?)$/i;

/** Returns `true` when `value` is a safe public http: or https: URL. */
export function isSafeUrl(value: string): boolean {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    if (PRIVATE_HOST_RE.test(url.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

/** Returns the trimmed URL if safe, otherwise empty string. */
export function safeUrl(value: string): string {
  return isSafeUrl(value) ? value.trim() : '';
}

/* ── Status Type Definitions ──────────────────────────────── */

export type ExistenceStatus =
  | 'confirmed'
  | 'probable'
  | 'candidate'
  | 'disputed'
  | 'closed'
  | 'unknown';

export type PriceStatus =
  | 'known_priced'
  | 'known_free'
  | 'known_unpriced'
  | 'paid_unknown'
  | 'variable'
  | 'stale'
  | 'not_applicable'
  | 'unknown';

export type RuleStatus =
  | 'known'
  | 'partial'
  | 'conflict'
  | 'stale'
  | 'not_applicable'
  | 'unknown';

export type EnrichmentStatus =
  | 'complete'
  | 'needs_price'
  | 'needs_rules'
  | 'needs_payment_link'
  | 'needs_source_url'
  | 'needs_review'
  | 'stale'
  | 'conflict';

const EXISTENCE_STATUSES = new Set<ExistenceStatus>([
  'confirmed',
  'probable',
  'candidate',
  'disputed',
  'closed',
  'unknown',
]);

/* ── Internal Helpers ─────────────────────────────────────── */

const FREE_PRICE_VALUES = new Set([
  'free',
  'no',
  'no charge',
  'gratis',
  '$0',
  '0',
  '0.00',
]);

function normalizedText(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isFreeValue(value: unknown): boolean {
  return FREE_PRICE_VALUES.has(normalizedText(value));
}

function isVariableValue(value: unknown): boolean {
  const text = normalizedText(value);
  return text === 'variable' || text === 'varies' || text === 'dynamic';
}

function isStaleDate(
  lastVerifiedAt: unknown,
  dataAsOf: unknown,
  staleDays = 365,
): boolean {
  const dateStr =
    typeof lastVerifiedAt === 'string'
      ? lastVerifiedAt
      : typeof dataAsOf === 'string'
        ? dataAsOf
        : null;
  if (!dateStr) return false;
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return false;
  const diffDays = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays > staleDays;
}

export function normalizeExistenceStatus(value: unknown): ExistenceStatus {
  if (value === 'known') return 'confirmed';
  return typeof value === 'string' && EXISTENCE_STATUSES.has(value as ExistenceStatus)
    ? value as ExistenceStatus
    : 'confirmed';
}

function hasExplicitKnownPriceStatus(properties: Record<string, unknown>): boolean {
  return isKnownPriceStatus(properties.price_status);
}

/** Returns true only for canonical price statuses that mean price is known. */
export function isKnownPriceStatus(status: unknown): boolean {
  return status === 'known_priced' || status === 'known_free';
}

export function matchesPriceFilter(properties: Record<string, unknown>, priceFilter: string | null) {
  if (priceFilter === 'known') return isKnownPriceStatus(properties.price_status);
  if (priceFilter === 'free') return properties.price_status === 'known_free';
  if (priceFilter === 'unknown') return !isKnownPriceStatus(properties.price_status);
  return true;
}

export type TrustFilter = 'reliable' | 'likely' | 'all' | 'review' | 'conflict';

const RESTRICTED_ORDINARY_PARKING_ACCESS = new Set([
  'private',
  'customers',
  'customer',
  'permit',
  'residents',
  'resident',
  'employees',
  'staff',
  'delivery',
  'destination',
]);

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function statusText(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function driverConfidence(properties: Record<string, unknown>): number {
  return (
    numberValue(properties.display_confidence) ??
    numberValue(properties.displayConfidence) ??
    numberValue(properties.offer_confidence) ??
    numberValue(properties.offerConfidence) ??
    numberValue(properties.confidence) ??
    numberValue(properties.source_confidence) ??
    numberValue(properties.sourceConfidence) ??
    0.5
  );
}

export function hasParkingConflict(properties: Record<string, unknown>): boolean {
  const ordinaryStatus = statusText(properties.ordinary_parking_status);
  const enrichmentStatus = statusText(properties.enrichment_status);
  const ruleStatus = statusText(properties.rule_status);
  const fieldConflict = statusText(properties.field_conflict_status);
  const access = statusText(properties.access);
  return (
    ordinaryStatus === 'not_ordinary_parking_offer' ||
    enrichmentStatus === 'conflict' ||
    ruleStatus === 'conflict' ||
    fieldConflict.includes('conflict') ||
    access === 'no' ||
    RESTRICTED_ORDINARY_PARKING_ACCESS.has(access)
  );
}

export function needsParkingReview(properties: Record<string, unknown>): boolean {
  const confidence = driverConfidence(properties);
  const enrichmentStatus = statusText(properties.enrichment_status);
  const ruleStatus = statusText(properties.rule_status);
  const priceStatus = statusText(properties.price_status);
  const fieldConflict = statusText(properties.field_conflict_status);

  return (
    confidence < 0.7 ||
    enrichmentStatus === 'needs_review' ||
    enrichmentStatus === 'stale' ||
    ruleStatus === 'stale' ||
    priceStatus === 'stale' ||
    fieldConflict === 'needs_field_review' ||
    fieldConflict.includes('review')
  );
}

export function trustLabel(properties: Record<string, unknown>): TrustFilter {
  if (hasParkingConflict(properties)) return 'conflict';
  if (needsParkingReview(properties)) return 'review';
  return driverConfidence(properties) >= 0.75 ? 'reliable' : 'likely';
}

export function matchesTrustFilter(properties: Record<string, unknown>, trustFilter: string | null) {
  const confidence = driverConfidence(properties);
  const conflict = hasParkingConflict(properties);

  if (!trustFilter || trustFilter === 'all') return !conflict;
  if (trustFilter === 'reliable') return !conflict && !needsParkingReview(properties) && confidence >= 0.75;
  if (trustFilter === 'likely') {
    return !conflict && (confidence >= 0.6 || (properties.review_only === true && needsParkingReview(properties)));
  }
  if (trustFilter === 'review') return !conflict && needsParkingReview(properties);
  if (trustFilter === 'conflict') return conflict;
  return true;
}

export function trustRank(properties: Record<string, unknown>): number {
  const label = trustLabel(properties);
  if (label === 'reliable') return 4;
  if (label === 'likely') return 3;
  if (label === 'review') return 2;
  return 1;
}

/* ── Price Status Derivation ──────────────────────────────── */

/**
 * Derives a granular `PriceStatus` from raw feature properties.
 *
 * Order of precedence:
 *  1. Explicitly free (`free`, `no`, `0`, …)
 *  2. Variable / dynamic pricing
 *  3. Known price via `hasKnownPrice()` from price-utils
 *  4. Paid but amount unknown (`fee: yes`)
 *  5. Existence confirmed but no price (`known_unpriced`)
 *  6. Data too old (`stale`)
 *  7. Fallback: `unknown`
 *
 * Unknown price is **never** classified as free.
 */
export function derivePriceStatus(
  properties: Record<string, unknown> | null | undefined,
): PriceStatus {
  if (!properties) return 'unknown';

  const charge = properties.charge;
  const fee = properties.fee;

  // 1. Explicitly free
  if (isFreeValue(charge) || isFreeValue(fee)) return 'known_free';

  // 2. Variable / dynamic pricing
  if (isVariableValue(charge) || isVariableValue(fee)) return 'variable';

  // 3. Known price (numeric rates, explicit charge, known price_status)
  if (hasKnownPrice(properties)) return 'known_priced';

  // 4. Paid but amount unknown
  if (normalizedText(fee) === 'yes' || fee === true) return 'paid_unknown';

  // 5. Existence confirmed without price
  const existence = properties.existence_status;
  if (existence === 'confirmed' || existence === 'probable')
    return 'known_unpriced';

  // 6. Data too old
  if (isStaleDate(properties.last_verified_at, properties.data_as_of))
    return 'stale';

  return 'unknown';
}

/* ── Rule Status Derivation ───────────────────────────────── */

/**
 * Derives a `RuleStatus` from feature properties.
 */
export function deriveRuleStatus(
  properties: Record<string, unknown> | null | undefined,
): RuleStatus {
  if (!properties) return 'unknown';

  if (properties.rule_status === 'conflict') return 'conflict';
  if (isStaleDate(properties.last_verified_at, properties.data_as_of))
    return 'stale';

  const hasExplicitRules = Boolean(
    properties.opening_hours ||
      properties.rules ||
      properties.restrictions,
  );
  if (hasExplicitRules) return 'known';

  if (properties.raw_properties || properties.parking_type) return 'partial';

  return 'unknown';
}

/* ── Enrichment Derivation ────────────────────────────────── */

/**
 * Derives a granular `EnrichmentStatus` from feature properties.
 *
 * Priority: conflict > stale > missing source URL > missing price >
 * missing payment link > missing rules > low confidence > complete.
 */
export function deriveEnrichmentStatus(
  properties: Record<string, unknown> | null | undefined,
): EnrichmentStatus {
  if (!properties) return 'needs_review';

  // Explicit conflict
  if (properties.enrichment_status === 'conflict') return 'conflict';

  // Stale data
  if (isStaleDate(properties.last_verified_at, properties.data_as_of))
    return 'stale';

  // Missing or unsafe source URL — unsafe URLs must not satisfy completeness
  const rawSourceUrl = properties.sourceUrl || properties.source_url;
  if (typeof rawSourceUrl !== 'string' || !safeUrl(rawSourceUrl))
    return 'needs_source_url';

  // Missing price
  if (!hasKnownPrice(properties) && !hasExplicitKnownPriceStatus(properties)) return 'needs_price';

  // Missing or unsafe payment link for known-priced facilities
  const rawPaymentUrl = properties.paymentUrl || properties.payment_url;
  if (typeof rawPaymentUrl !== 'string' || !safeUrl(rawPaymentUrl))
    return 'needs_payment_link';

  // Missing rules
  if (
    !properties.opening_hours &&
    !properties.rules &&
    !properties.restrictions
  )
    return 'needs_rules';

  // Low confidence → needs human review
  const confidence =
    typeof properties.confidence === 'number'
      ? properties.confidence
      : typeof properties.sourceConfidence === 'number'
        ? properties.sourceConfidence
        : null;
  if (confidence !== null && confidence < 0.7) return 'needs_review';

  return 'complete';
}

/** Boolean shorthand for "has any enrichment gap". */
export function needsEnrichment(
  properties: Record<string, unknown> | null | undefined,
): boolean {
  return deriveEnrichmentStatus(properties) !== 'complete';
}

/* ── Record Completeness Metrics ──────────────────────────── */

export interface RecordCompleteness {
  /** Total records in the index. */
  totalKnownRecords: number;
  /** Records with `known_priced` or `known_free` price status. */
  priceKnownRecords: number;
  /** Records without a known price (`totalKnownRecords - priceKnownRecords`). */
  priceUnknownRecords: number;
  /** Records explicitly marked as `known_free`. */
  knownFreeRecords: number;
  /** Records with a non-empty safe `source_url`. */
  sourceLinkedRecords: number;
  /** Records with a non-empty safe `payment_url`. */
  paymentLinkedRecords: number;
  /** Records with a non-empty safe `booking_url`. */
  bookingLinkedRecords: number;
  /** Records with a non-empty safe `payment_url` or `booking_url`. */
  paymentOrBookingLinkedRecords: number;
  /** Records with a non-empty safe `evidence_url`. */
  evidenceLinkedRecords: number;
  /** Records tagged as stale in any status field (price, rule, or enrichment). */
  staleRecords: number;
  /** Records with enrichment status `needs_review`. */
  needsReviewRecords: number;
  /** Records with enrichment status `conflict`. */
  conflictRecords: number;
}

/**
 * Computes record-completeness / provenance-coverage metrics from an array
 * of canonical feature properties.
 *
 * Treats only `known_priced` and `known_free` as price-known.
 * Unknown/missing URLs are not counted as linked (assumes upstream
 * `safeUrl()` already rejected unsafe values).
 * Unknown price is never classified as free.
 */
export function computeRecordCompleteness(
  features: Record<string, unknown>[],
): RecordCompleteness {
  let priceKnownRecords = 0;
  let knownFreeRecords = 0;
  let sourceLinkedRecords = 0;
  let paymentLinkedRecords = 0;
  let bookingLinkedRecords = 0;
  let paymentOrBookingLinkedRecords = 0;
  let evidenceLinkedRecords = 0;
  let staleRecords = 0;
  let needsReviewRecords = 0;
  let conflictRecords = 0;

  for (const props of features) {
    const priceStatus = typeof props.price_status === 'string' ? props.price_status : '';
    const enrichmentStatus = typeof props.enrichment_status === 'string' ? props.enrichment_status : '';
    const ruleStatus = typeof props.rule_status === 'string' ? props.rule_status : '';

    if (isKnownPriceStatus(priceStatus)) {
      priceKnownRecords++;
    }

    if (priceStatus === 'known_free') {
      knownFreeRecords++;
    }

    if (typeof props.source_url === 'string' && props.source_url.trim().length > 0) {
      sourceLinkedRecords++;
    }

    const hasPaymentLink = typeof props.payment_url === 'string' && props.payment_url.trim().length > 0;
    const hasBookingLink = typeof props.booking_url === 'string' && props.booking_url.trim().length > 0;

    if (hasPaymentLink) {
      paymentLinkedRecords++;
    }

    if (hasBookingLink) {
      bookingLinkedRecords++;
    }

    if (hasPaymentLink || hasBookingLink) {
      paymentOrBookingLinkedRecords++;
    }

    if (typeof props.evidence_url === 'string' && props.evidence_url.trim().length > 0) {
      evidenceLinkedRecords++;
    }

    if (
      priceStatus === 'stale' ||
      ruleStatus === 'stale' ||
      enrichmentStatus === 'stale'
    ) {
      staleRecords++;
    }

    if (enrichmentStatus === 'needs_review') {
      needsReviewRecords++;
    }

    if (enrichmentStatus === 'conflict') {
      conflictRecords++;
    }
  }

  const totalKnownRecords = features.length;
  const priceUnknownRecords = totalKnownRecords - priceKnownRecords;

  return {
    totalKnownRecords,
    priceKnownRecords,
    priceUnknownRecords,
    knownFreeRecords,
    sourceLinkedRecords,
    paymentLinkedRecords,
    bookingLinkedRecords,
    paymentOrBookingLinkedRecords,
    evidenceLinkedRecords,
    staleRecords,
    needsReviewRecords,
    conflictRecords,
  };
}

/* ── Safe Metric Helpers ──────────────────────────────────── */

/**
 * Zero-denominator-safe percentage.
 * Returns 0 when denominator is 0, NaN, or Infinity.
 */
export function safePercentage(
  numerator: number,
  denominator: number,
  decimals = 0,
): number {
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator === 0
  )
    return 0;
  const factor = 10 ** decimals;
  return Math.round((numerator / denominator) * 100 * factor) / factor;
}

/**
 * Zero-denominator-safe ratio (0..1).
 * Returns 0 when denominator is 0, NaN, or Infinity.
 */
export function safeRatio(numerator: number, denominator: number): number {
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator === 0
  )
    return 0;
  return numerator / denominator;
}

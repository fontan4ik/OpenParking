import { describe, expect, it } from 'vitest';
import {
  isSafeUrl,
  safeUrl,
  derivePriceStatus,
  deriveRuleStatus,
  deriveEnrichmentStatus,
  needsEnrichment,
  safePercentage,
  safeRatio,
  computeRecordCompleteness,
  hasParkingConflict,
  isKnownPriceStatus,
  matchesTrustFilter,
} from '@/lib/data-quality';

describe('parking access trust filters', () => {
  it.each(['private', 'customers', 'permit', 'residents', 'employees', 'delivery'])(
    'keeps %s parking out of ordinary candidate views',
    (access) => {
      const properties = { access, confidence: 0.9 };
      expect(hasParkingConflict(properties)).toBe(true);
      expect(matchesTrustFilter(properties, 'all')).toBe(false);
      expect(matchesTrustFilter(properties, 'conflict')).toBe(true);
    }
  );

  it('keeps unknown-access OSM candidates in review instead of conflicts', () => {
    const properties = {
      access: '',
      confidence: 0.55,
      enrichment_status: 'needs_review',
      field_conflict_status: 'needs_field_review',
    };
    expect(hasParkingConflict(properties)).toBe(false);
    expect(matchesTrustFilter(properties, 'likely')).toBe(false);
    expect(matchesTrustFilter(properties, 'review')).toBe(true);
  });
});

describe('isKnownPriceStatus', () => {
  it('treats only canonical priced and free statuses as known', () => {
    expect(isKnownPriceStatus('known_priced')).toBe(true);
    expect(isKnownPriceStatus('known_free')).toBe(true);

    for (const status of [
      'known_unpriced',
      'paid_unknown',
      'variable',
      'stale',
      'not_applicable',
      'unknown',
      'known',
      undefined,
      null,
    ]) {
      expect(isKnownPriceStatus(status)).toBe(false);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════
   URL Safety
   ═══════════════════════════════════════════════════════════════ */

describe('isSafeUrl / safeUrl', () => {
  it('accepts public HTTPS URLs', () => {
    expect(isSafeUrl('https://www.sfmta.com/')).toBe(true);
    expect(safeUrl('https://www.sfmta.com/')).toBe('https://www.sfmta.com/');
  });

  it('accepts public HTTP URLs', () => {
    expect(isSafeUrl('http://example.com/foo')).toBe(true);
    expect(safeUrl('http://example.com/foo')).toBe('http://example.com/foo');
  });

  it('accepts URLs with paths, queries, and fragments', () => {
    expect(
      isSafeUrl('https://data.sfgov.org/resource/8vzz-qzz9.json?$limit=10'),
    ).toBe(true);
  });

  it('rejects javascript: URLs', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(safeUrl('javascript:alert(1)')).toBe('');
  });

  it('rejects data: URLs', () => {
    expect(isSafeUrl('data:text/html,<x>')).toBe(false);
    expect(safeUrl('data:text/html,<x>')).toBe('');
  });

  it('rejects file: URLs', () => {
    expect(isSafeUrl('file:///C:/x')).toBe(false);
    expect(safeUrl('file:///C:/x')).toBe('');
  });

  it('rejects localhost', () => {
    expect(isSafeUrl('http://localhost:3000')).toBe(false);
    expect(safeUrl('http://localhost:3000')).toBe('');
  });

  it('rejects 127.0.0.1 loopback', () => {
    expect(isSafeUrl('http://127.0.0.1:3000')).toBe(false);
    expect(safeUrl('http://127.0.0.1:3000')).toBe('');
  });

  it('rejects 10.x.x.x private IPs', () => {
    expect(isSafeUrl('http://10.0.0.1')).toBe(false);
    expect(safeUrl('http://10.0.0.1')).toBe('');
    expect(isSafeUrl('http://10.255.255.255')).toBe(false);
  });

  it('rejects 172.16-31.x.x private IPs', () => {
    expect(isSafeUrl('http://172.16.0.1')).toBe(false);
    expect(isSafeUrl('http://172.31.255.255')).toBe(false);
  });

  it('rejects 192.168.x.x private IPs', () => {
    expect(isSafeUrl('http://192.168.1.1')).toBe(false);
    expect(safeUrl('http://192.168.1.1')).toBe('');
  });

  it('rejects 0.x.x.x IPs', () => {
    expect(isSafeUrl('http://0.1.2.3')).toBe(false);
  });

  it('rejects IPv6 loopback', () => {
    expect(isSafeUrl('http://[::1]:8080')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isSafeUrl('')).toBe(false);
    expect(safeUrl('')).toBe('');
  });

  it('rejects malformed strings', () => {
    expect(isSafeUrl('not-a-url')).toBe(false);
    expect(isSafeUrl('')).toBe(false);
    expect(safeUrl('not-a-url')).toBe('');
  });

  it('rejects whitespace-only strings', () => {
    expect(isSafeUrl('   ')).toBe(false);
    expect(safeUrl('   ')).toBe('');
  });

  it('trims whitespace from valid URLs', () => {
    expect(safeUrl('  https://www.sfmta.com/  ')).toBe(
      'https://www.sfmta.com/',
    );
  });
});

/* ═══════════════════════════════════════════════════════════════
   Price Status Derivation
   ═══════════════════════════════════════════════════════════════ */

describe('derivePriceStatus', () => {
  it('returns unknown for null/undefined/empty', () => {
    expect(derivePriceStatus(null)).toBe('unknown');
    expect(derivePriceStatus(undefined)).toBe('unknown');
    expect(derivePriceStatus({})).toBe('unknown');
  });

  describe('known_free', () => {
    it('treats charge "free" as known_free', () => {
      expect(derivePriceStatus({ charge: 'free' })).toBe('known_free');
    });

    it('treats charge "no" (no charge) as known_free', () => {
      expect(derivePriceStatus({ charge: 'no' })).toBe('known_free');
    });

    it('treats charge "0" as known_free', () => {
      expect(derivePriceStatus({ charge: '0' })).toBe('known_free');
    });

    it('treats charge "$0" as known_free', () => {
      expect(derivePriceStatus({ charge: '$0' })).toBe('known_free');
    });

    it('treats charge "gratis" as known_free', () => {
      expect(derivePriceStatus({ charge: 'gratis' })).toBe('known_free');
    });

    it('treats fee "no" as known_free', () => {
      expect(derivePriceStatus({ fee: 'no' })).toBe('known_free');
    });

    it('is case-insensitive for free values', () => {
      expect(derivePriceStatus({ charge: 'Free' })).toBe('known_free');
      expect(derivePriceStatus({ charge: 'NO' })).toBe('known_free');
    });
  });

  describe('variable', () => {
    it('treats charge "variable" as variable', () => {
      expect(derivePriceStatus({ charge: 'variable' })).toBe('variable');
    });

    it('treats charge "varies" as variable', () => {
      expect(derivePriceStatus({ charge: 'varies' })).toBe('variable');
    });

    it('treats charge "dynamic" as variable', () => {
      expect(derivePriceStatus({ charge: 'dynamic' })).toBe('variable');
    });

    it('treats fee "variable" as variable', () => {
      expect(derivePriceStatus({ fee: 'variable' })).toBe('variable');
    });
  });

  describe('known_priced', () => {
    it('detects numeric base_hourly_rate', () => {
      expect(derivePriceStatus({ base_hourly_rate: 2 })).toBe('known_priced');
    });

    it('detects explicit charge string', () => {
      expect(derivePriceStatus({ charge: '$2/hr' })).toBe('known_priced');
    });

    it('detects known price_status', () => {
      expect(derivePriceStatus({ price_status: 'known' })).toBe('known_priced');
    });

    it('detects 0 base_hourly_rate as known (free rate is still a rate)', () => {
      expect(derivePriceStatus({ base_hourly_rate: 0 })).toBe('known_priced');
    });

    it('detects "no" fee as known_free (checked before known_priced)', () => {
      // "no" means no charge → free, checked first in precedence
      expect(derivePriceStatus({ charge: 'no' })).toBe('known_free');
    });
  });

  describe('paid_unknown', () => {
    it('treats fee "yes" as paid_unknown', () => {
      expect(derivePriceStatus({ fee: 'yes' })).toBe('paid_unknown');
    });

    it('treats fee boolean true as paid_unknown', () => {
      expect(derivePriceStatus({ fee: true })).toBe('paid_unknown');
    });
  });

  describe('known_unpriced', () => {
    it('treats confirmed existence without price as known_unpriced', () => {
      expect(
        derivePriceStatus({ existence_status: 'confirmed' }),
      ).toBe('known_unpriced');
    });

    it('treats probable existence without price as known_unpriced', () => {
      expect(
        derivePriceStatus({ existence_status: 'probable' }),
      ).toBe('known_unpriced');
    });
  });

  describe('stale', () => {
    it('returns stale when last_verified_at is too old', () => {
      const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
      expect(derivePriceStatus({ last_verified_at: old })).toBe('stale');
    });

    it('does not return stale for recent data', () => {
      const recent = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      expect(derivePriceStatus({ last_verified_at: recent })).toBe('unknown');
    });
  });

  describe('unknown_is_not_free', () => {
    it('does not treat unknown charge as free', () => {
      expect(derivePriceStatus({ charge: 'unknown' })).not.toBe('known_free');
      expect(derivePriceStatus({ charge: 'unknown' })).toBe('unknown');
    });

    it('does not treat N/A as free', () => {
      expect(derivePriceStatus({ charge: 'n/a' })).not.toBe('known_free');
      expect(derivePriceStatus({ charge: 'n/a' })).toBe('unknown');
    });

    it('does not treat empty charge as free', () => {
      expect(derivePriceStatus({ charge: '' })).not.toBe('known_free');
      expect(derivePriceStatus({ charge: '' })).toBe('unknown');
    });
  });
});

/* ═══════════════════════════════════════════════════════════════
   Rule Status Derivation
   ═══════════════════════════════════════════════════════════════ */

describe('deriveRuleStatus', () => {
  it('returns unknown for null/undefined/empty', () => {
    expect(deriveRuleStatus(null)).toBe('unknown');
    expect(deriveRuleStatus(undefined)).toBe('unknown');
    expect(deriveRuleStatus({})).toBe('unknown');
  });

  it('returns known when opening_hours is present', () => {
    expect(
      deriveRuleStatus({ opening_hours: 'Mo-Fr 09:00-18:00' }),
    ).toBe('known');
  });

  it('returns known when rules field is present', () => {
    expect(deriveRuleStatus({ rules: '2hr max' })).toBe('known');
  });

  it('returns known when restrictions field is present', () => {
    expect(deriveRuleStatus({ restrictions: 'permit only' })).toBe('known');
  });

  it('returns conflict when rule_status is conflict', () => {
    expect(deriveRuleStatus({ rule_status: 'conflict' })).toBe('conflict');
  });

  it('returns stale when data is too old', () => {
    const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
    expect(deriveRuleStatus({ last_verified_at: old })).toBe('stale');
  });

  it('returns partial with raw_properties', () => {
    expect(deriveRuleStatus({ raw_properties: { parking: 'lane' } })).toBe(
      'partial',
    );
  });

  it('returns partial with parking_type', () => {
    expect(deriveRuleStatus({ parking_type: 'street_side' })).toBe('partial');
  });
});

/* ═══════════════════════════════════════════════════════════════
   Enrichment Status Derivation
   ═══════════════════════════════════════════════════════════════ */

describe('deriveEnrichmentStatus', () => {
  const completeProps = {
    sourceUrl: 'https://example.com/source',
    paymentUrl: 'https://example.com/pay',
    charge: '$2/hr',
    opening_hours: '9-5',
    confidence: 0.9,
  };

  it('returns complete when all enrichment criteria are met', () => {
    expect(deriveEnrichmentStatus(completeProps)).toBe('complete');
    expect(needsEnrichment(completeProps)).toBe(false);
  });

  it('needs_review for null/undefined', () => {
    expect(deriveEnrichmentStatus(null)).toBe('needs_review');
    expect(deriveEnrichmentStatus(undefined)).toBe('needs_review');
    expect(needsEnrichment(null)).toBe(true);
  });

  it('returns needs_source_url when source URL is missing', () => {
    const props = { ...completeProps, sourceUrl: undefined };
    expect(deriveEnrichmentStatus(props)).toBe('needs_source_url');
    expect(needsEnrichment(props)).toBe(true);
  });

  it('recognizes source_url (snake_case) as alternative', () => {
    const props = { ...completeProps, sourceUrl: undefined, source_url: 'https://example.com/src' };
    expect(deriveEnrichmentStatus(props)).not.toBe('needs_source_url');
  });

  it('returns needs_price when price info is missing', () => {
    const props = {
      sourceUrl: 'https://example.com/source',
      confidence: 0.9,
    };
    expect(deriveEnrichmentStatus(props)).toBe('needs_price');
  });

  it('returns needs_payment_link when known-priced but no payment URL', () => {
    const props = {
      sourceUrl: 'https://example.com/source',
      charge: '$5/hr',
      opening_hours: '9-5',
      confidence: 0.9,
    };
    expect(deriveEnrichmentStatus(props)).toBe('needs_payment_link');
  });

  it('recognizes payment_url (snake_case) as alternative', () => {
    const props = {
      sourceUrl: 'https://example.com/source',
      payment_url: 'https://example.com/pay',
      charge: '$5/hr',
      opening_hours: '9-5',
      confidence: 0.9,
    };
    expect(deriveEnrichmentStatus(props)).toBe('complete');
  });

  it('treats explicit known_priced price_status as complete price evidence', () => {
    const props = {
      sourceUrl: 'https://example.com/source',
      paymentUrl: 'https://example.com/pay',
      price_status: 'known_priced',
      opening_hours: '9-5',
      confidence: 0.9,
    };
    expect(deriveEnrichmentStatus(props)).toBe('complete');
  });

  it('treats explicit known_free price_status as complete price evidence', () => {
    const props = {
      sourceUrl: 'https://example.com/source',
      paymentUrl: 'https://example.com/pay',
      price_status: 'known_free',
      opening_hours: '9-5',
      confidence: 0.9,
    };
    expect(deriveEnrichmentStatus(props)).toBe('complete');
  });

  it('returns needs_rules when rules/restrictions are missing', () => {
    const props = {
      sourceUrl: 'https://example.com/source',
      paymentUrl: 'https://example.com/pay',
      charge: '$5/hr',
      confidence: 0.9,
    };
    expect(deriveEnrichmentStatus(props)).toBe('needs_rules');
  });

  it('returns needs_review when confidence is below 0.7', () => {
    const props = {
      sourceUrl: 'https://example.com/source',
      paymentUrl: 'https://example.com/pay',
      charge: '$5/hr',
      opening_hours: '9-5',
      confidence: 0.5,
    };
    expect(deriveEnrichmentStatus(props)).toBe('needs_review');
  });

  it('returns conflict when enrichment_status is conflict', () => {
    const props = {
      ...completeProps,
      enrichment_status: 'conflict',
    };
    expect(deriveEnrichmentStatus(props)).toBe('conflict');
  });

  it('returns stale when data is too old', () => {
    const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
    const props = {
      ...completeProps,
      last_verified_at: old,
    };
    expect(deriveEnrichmentStatus(props)).toBe('stale');
  });

  it('checks sourceConfidence as fallback for confidence', () => {
    const props = {
      sourceUrl: 'https://example.com/source',
      paymentUrl: 'https://example.com/pay',
      charge: '$5/hr',
      opening_hours: '9-5',
      sourceConfidence: 0.5,
    };
    expect(deriveEnrichmentStatus(props)).toBe('needs_review');
  });

  describe('unsafe URL validation in enrichment', () => {
    it('returns needs_source_url when sourceUrl is javascript: URL', () => {
      const props = {
        sourceUrl: 'javascript:alert(1)',
        paymentUrl: 'https://example.com/pay',
        charge: '$5/hr',
        opening_hours: '9-5',
        confidence: 0.9,
      };
      expect(deriveEnrichmentStatus(props)).toBe('needs_source_url');
    });

    it('returns needs_source_url when source_url is localhost', () => {
      const props = {
        source_url: 'http://localhost:3000',
        paymentUrl: 'https://example.com/pay',
        charge: '$5/hr',
        opening_hours: '9-5',
        confidence: 0.9,
      };
      expect(deriveEnrichmentStatus(props)).toBe('needs_source_url');
    });

    it('returns needs_source_url when sourceUrl is a data: URL', () => {
      const props = {
        sourceUrl: 'data:text/html,<x>',
        paymentUrl: 'https://example.com/pay',
        charge: '$5/hr',
        opening_hours: '9-5',
        confidence: 0.9,
      };
      expect(deriveEnrichmentStatus(props)).toBe('needs_source_url');
    });

    it('returns needs_payment_link when paymentUrl is javascript: URL', () => {
      const props = {
        sourceUrl: 'https://example.com/source',
        paymentUrl: 'javascript:alert(1)',
        charge: '$5/hr',
        opening_hours: '9-5',
        confidence: 0.9,
      };
      expect(deriveEnrichmentStatus(props)).toBe('needs_payment_link');
    });

    it('returns needs_payment_link when payment_url is file: URL', () => {
      const props = {
        sourceUrl: 'https://example.com/source',
        payment_url: 'file:///C:/secrets',
        charge: '$5/hr',
        opening_hours: '9-5',
        confidence: 0.9,
      };
      expect(deriveEnrichmentStatus(props)).toBe('needs_payment_link');
    });

    it('returns needs_payment_link when payment_url is localhost', () => {
      const props = {
        sourceUrl: 'https://example.com/source',
        payment_url: 'http://127.0.0.1:3000/pay',
        charge: '$5/hr',
        opening_hours: '9-5',
        confidence: 0.9,
      };
      expect(deriveEnrichmentStatus(props)).toBe('needs_payment_link');
    });

    it('still accepts safe snake_case source_url and payment_url', () => {
      const props = {
        source_url: 'https://data.sfgov.org/resource/8vzz-qzz9.json',
        payment_url: 'https://pay.example.com/',
        charge: '$5/hr',
        opening_hours: '9-5',
        confidence: 0.9,
      };
      expect(deriveEnrichmentStatus(props)).toBe('complete');
    });
  });
});

/* ═══════════════════════════════════════════════════════════════
   Safe Metric Helpers
   ═══════════════════════════════════════════════════════════════ */

describe('safePercentage', () => {
  it('returns 50 for 5/10', () => {
    expect(safePercentage(5, 10)).toBe(50);
  });

  it('returns 0 for 0/10', () => {
    expect(safePercentage(0, 10)).toBe(0);
  });

  it('returns 100 for 10/10', () => {
    expect(safePercentage(10, 10)).toBe(100);
  });

  it('returns 33.3 for 1/3 with 1 decimal', () => {
    expect(safePercentage(1, 3, 1)).toBe(33.3);
  });

  it('returns 0 when denominator is 0', () => {
    expect(safePercentage(10, 0)).toBe(0);
  });

  it('returns 0 when numerator is NaN', () => {
    expect(safePercentage(NaN, 10)).toBe(0);
  });

  it('returns 0 when denominator is NaN', () => {
    expect(safePercentage(10, NaN)).toBe(0);
  });

  it('returns 0 when numerator is Infinity', () => {
    expect(safePercentage(Infinity, 10)).toBe(0);
  });

  it('returns 0 when denominator is Infinity', () => {
    expect(safePercentage(10, Infinity)).toBe(0);
  });

  it('returns 0 when both are negative', () => {
    // This still works arithmetically, but should not crash
    const result = safePercentage(-5, -10);
    expect(Number.isFinite(result)).toBe(true);
  });
});

describe('safeRatio', () => {
  it('returns 0.5 for 5/10', () => {
    expect(safeRatio(5, 10)).toBe(0.5);
  });

  it('returns 0 when denominator is 0', () => {
    expect(safeRatio(10, 0)).toBe(0);
  });

  it('returns 0 when numerator is NaN', () => {
    expect(safeRatio(NaN, 10)).toBe(0);
  });

  it('returns 0 when denominator is NaN', () => {
    expect(safeRatio(10, NaN)).toBe(0);
  });

  it('returns 0 when either value is Infinity', () => {
    expect(safeRatio(Infinity, 10)).toBe(0);
    expect(safeRatio(10, Infinity)).toBe(0);
  });
});

/* ═══════════════════════════════════════════════════════════════
   Record Completeness Metrics
   ═══════════════════════════════════════════════════════════════ */

describe('computeRecordCompleteness', () => {
  it('computes metrics from a mixed set of canonical feature properties', () => {
    const features = [
      {
        price_status: 'known_priced',
        source_url: 'https://example.com/src',
        payment_url: 'https://example.com/pay',
        booking_url: '',
        evidence_url: 'https://example.com/evidence',
        rule_status: 'known',
        enrichment_status: 'complete',
      },
      {
        price_status: 'known_free',
        source_url: 'https://example.com/free',
        payment_url: '',
        booking_url: 'https://example.com/book',
        evidence_url: '',
        rule_status: 'known',
        enrichment_status: 'complete',
      },
      {
        price_status: 'unknown',
        source_url: '',
        payment_url: '',
        booking_url: '',
        evidence_url: '',
        rule_status: 'unknown',
        enrichment_status: 'needs_source_url',
      },
    ];

    const result = computeRecordCompleteness(features);

    expect(result).toMatchObject({
      totalKnownRecords: 3,
      priceKnownRecords: 2,
      priceUnknownRecords: 1,
      knownFreeRecords: 1,
      sourceLinkedRecords: 2,
      paymentLinkedRecords: 1,
      bookingLinkedRecords: 1,
      paymentOrBookingLinkedRecords: 2,
      evidenceLinkedRecords: 1,
      staleRecords: 0,
      needsReviewRecords: 0,
      conflictRecords: 0,
    });
  });

  it('reports stale, needsReview, and conflict records', () => {
    const features = [
      {
        price_status: 'stale',
        source_url: '',
        payment_url: '',
        enrichment_status: 'stale',
        rule_status: 'unknown',
      },
      {
        price_status: 'unknown',
        enrichment_status: 'needs_review',
        rule_status: 'unknown',
      },
      {
        price_status: 'known_priced',
        source_url: 'https://example.com/conflict',
        payment_url: 'https://example.com/pay',
        enrichment_status: 'conflict',
        rule_status: 'unknown',
      },
    ];

    const result = computeRecordCompleteness(features);

    expect(result).toMatchObject({
      totalKnownRecords: 3,
      staleRecords: 1,
      needsReviewRecords: 1,
      conflictRecords: 1,
    });
  });

  it('returns zero metrics for an empty array', () => {
    const result = computeRecordCompleteness([]);

    expect(result).toMatchObject({
      totalKnownRecords: 0,
      priceKnownRecords: 0,
      priceUnknownRecords: 0,
      knownFreeRecords: 0,
      sourceLinkedRecords: 0,
      paymentLinkedRecords: 0,
      bookingLinkedRecords: 0,
      paymentOrBookingLinkedRecords: 0,
      evidenceLinkedRecords: 0,
      staleRecords: 0,
      needsReviewRecords: 0,
      conflictRecords: 0,
    });
  });

  it('does not treat unknown price as known_free', () => {
    const features = [
      { price_status: 'unknown', enrichment_status: 'needs_price' },
      { price_status: 'paid_unknown', enrichment_status: 'needs_payment_link' },
      { price_status: 'known_unpriced', enrichment_status: 'needs_price' },
      { price_status: 'variable', enrichment_status: 'needs_rules' },
      { price_status: 'not_applicable', enrichment_status: 'complete' },
    ];

    const result = computeRecordCompleteness(features);

    expect(result.priceKnownRecords).toBe(0);
    expect(result.knownFreeRecords).toBe(0);
    expect(result.priceUnknownRecords).toBe(5);
  });

  it('does not count missing or empty URLs as linked', () => {
    const features = [
      {
        source_url: '',
        payment_url: '',
        booking_url: undefined,
        evidence_url: null,
        price_status: 'known_priced',
        enrichment_status: 'needs_source_url',
      },
      {
        source_url: 'https://example.com/src',
        payment_url: '',
        booking_url: '',
        evidence_url: '   ',
        price_status: 'known_free',
        enrichment_status: 'needs_payment_link',
      },
    ];

    const result = computeRecordCompleteness(features);

    expect(result.sourceLinkedRecords).toBe(1);
    expect(result.paymentLinkedRecords).toBe(0);
    expect(result.bookingLinkedRecords).toBe(0);
    expect(result.paymentOrBookingLinkedRecords).toBe(0);
    // Whitespace-only evidence_url should not count as linked
    expect(result.evidenceLinkedRecords).toBe(0);
  });

  it('handles undefined/null property values gracefully', () => {
    const features = [
      { price_status: undefined, enrichment_status: undefined },
      { price_status: null, enrichment_status: null },
      {},
    ];

    const result = computeRecordCompleteness(features);

    expect(result.totalKnownRecords).toBe(3);
    expect(result.priceKnownRecords).toBe(0);
    expect(result.sourceLinkedRecords).toBe(0);
    expect(result.paymentLinkedRecords).toBe(0);
    expect(result.bookingLinkedRecords).toBe(0);
    expect(result.staleRecords).toBe(0);
    expect(result.needsReviewRecords).toBe(0);
    expect(result.conflictRecords).toBe(0);
  });
});

/* ═══════════════════════════════════════════════════════════════
   Stats / record-completeness API shape tests.
   Tests the composition of computeStats + computeRecordCompleteness
   as used by GET /api/stats.
   ═══════════════════════════════════════════════════════════════ */

import { describe, expect, it } from 'vitest';
import { computeStats, buildParkingIndex, type GeoJSONCollection } from '@/lib/data-loader';
import { computeRecordCompleteness, type RecordCompleteness } from '@/lib/data-quality';

function collection(features: GeoJSONCollection['features']): GeoJSONCollection {
  return { type: 'FeatureCollection', features };
}

describe('GET /api/stats shape', () => {
  it('preserves legacy keys and adds recordCompleteness when index is used', () => {
    const facilities = collection([
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-80.13, 25.8] },
        properties: {
          source_name: 'OSM',
          source_id: 'osm:node:1',
          price_status: 'known_priced',
          charge: '$2/hr',
          opening_hours: 'Mo-Fr 09:00-18:00',
          source_url: 'https://example.com/source',
          payment_url: 'https://example.com/pay',
          confidence: 0.9,
        },
      },
    ]);
    const segments = collection([
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [[-80.13, 25.8], [-80.131, 25.801]],
        },
        properties: {
          source_name: 'OSM',
          source_id: 'osm:way:1',
          confidence: 0.8,
        },
      },
    ]);
    const zones = collection([]);

    const stats = computeStats(facilities, segments, zones, 'miami');
    const index = buildParkingIndex('miami', { facilities, segments, zones });
    const recordCompleteness = computeRecordCompleteness(
      index.features.map((f) => f.properties),
    );

    // Legacy keys preserved
    expect(stats).toMatchObject({
      cityId: 'miami',
      totalFacilities: 1,
      pricedFacilities: 1,
      curbSegments: 1,
      zones: 0,
      coveragePercent: 100,
    });
    expect(typeof (stats as Record<string, unknown>).lastUpdated).toBe('string');

    // New recordCompleteness shape
    const rc = recordCompleteness as RecordCompleteness;
    expect(rc.totalKnownRecords).toBe(2);
    expect(rc.priceKnownRecords).toBe(1);
    expect(rc.priceUnknownRecords).toBe(1);
    expect(typeof rc.sourceLinkedRecords).toBe('number');
    expect(typeof rc.paymentLinkedRecords).toBe('number');
    expect(typeof rc.bookingLinkedRecords).toBe('number');
    expect(typeof rc.paymentOrBookingLinkedRecords).toBe('number');
    expect(typeof rc.evidenceLinkedRecords).toBe('number');
    expect(typeof rc.staleRecords).toBe('number');
    expect(typeof rc.needsReviewRecords).toBe('number');
    expect(typeof rc.conflictRecords).toBe('number');
  });

  it('computes recordCompleteness correctly with no known prices', () => {
    // Feature with safe URLs and opening_hours but no price and low confidence
    const facilities = collection([
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-80.13, 25.8] },
        properties: {
          source_name: 'OSM',
          source_id: 'osm:node:no-price',
          source_url: 'https://example.com/source', // needed to get past source_url check
          payment_url: 'https://example.com/pay',
          opening_hours: 'Mo-Fr 09:00-18:00', // needed to get past rules check
          // No charge/fee → enrichment will be 'needs_price' (before confidence check)
          confidence: 0.5,
        },
      },
    ]);

    const index = buildParkingIndex('miami', {
      facilities,
      segments: collection([]),
      zones: collection([]),
    });
    const rc = computeRecordCompleteness(index.features.map((f) => f.properties));

    expect(rc.totalKnownRecords).toBe(1);
    // No charge or fee → derived price_status is 'known_unpriced' (existence confirmed)
    expect(rc.priceKnownRecords).toBe(0);
    expect(rc.priceUnknownRecords).toBe(1);
    expect(rc.knownFreeRecords).toBe(0);
    // Enrichment checks price before confidence → 'needs_price' not 'needs_review'
    expect(rc.needsReviewRecords).toBe(0);
  });

  it('coveragePercent is 0 for empty facilities', () => {
    const stats = computeStats(
      collection([]),
      collection([]),
      collection([]),
      'miami',
    );
    expect(stats).toMatchObject({
      totalFacilities: 0,
      pricedFacilities: 0,
      curbSegments: 0,
      zones: 0,
      coveragePercent: 0,
    });
    expect(typeof (stats as Record<string, unknown>).lastUpdated).toBe('string');
  });

  it('recordCompleteness metrics are consistent across metrics', () => {
    const features = [
      {
        price_status: 'known_priced',
        source_url: 'https://example.com/a',
        payment_url: '',
        booking_url: '',
        evidence_url: '',
        rule_status: 'known',
        enrichment_status: 'complete',
      },
      {
        price_status: 'known_free',
        source_url: '',
        payment_url: '',
        booking_url: 'https://example.com/book',
        evidence_url: '',
        rule_status: 'unknown',
        enrichment_status: 'needs_source_url',
      },
      {
        price_status: 'unknown',
        source_url: '',
        payment_url: '',
        booking_url: '',
        evidence_url: '',
        rule_status: 'unknown',
        enrichment_status: 'needs_price',
      },
    ];

    const rc = computeRecordCompleteness(features);

    // Consistency invariants
    expect(rc.totalKnownRecords).toBe(
      rc.priceKnownRecords + rc.priceUnknownRecords,
    );
    expect(rc.knownFreeRecords).toBeLessThanOrEqual(rc.priceKnownRecords);
    expect(rc.sourceLinkedRecords).toBeLessThanOrEqual(rc.totalKnownRecords);
    expect(rc.paymentLinkedRecords).toBeLessThanOrEqual(rc.totalKnownRecords);
    expect(rc.bookingLinkedRecords).toBeLessThanOrEqual(rc.totalKnownRecords);
    expect(rc.paymentOrBookingLinkedRecords).toBeLessThanOrEqual(rc.totalKnownRecords);
    expect(rc.evidenceLinkedRecords).toBeLessThanOrEqual(rc.totalKnownRecords);
    expect(rc.staleRecords).toBeLessThanOrEqual(rc.totalKnownRecords);
    expect(rc.needsReviewRecords).toBeLessThanOrEqual(rc.totalKnownRecords);
    expect(rc.conflictRecords).toBeLessThanOrEqual(rc.totalKnownRecords);

    // Specific counts for this dataset
    expect(rc.priceKnownRecords).toBe(2);
    expect(rc.priceUnknownRecords).toBe(1);
    expect(rc.knownFreeRecords).toBe(1);
    expect(rc.paymentLinkedRecords).toBe(0);
    expect(rc.bookingLinkedRecords).toBe(1);
    expect(rc.paymentOrBookingLinkedRecords).toBe(1);
  });

  it('uses canonical price_status for legacy priced facility stats', () => {
    const facilities = collection([
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-80.13, 25.8] },
        properties: { price_status: 'known_priced', charge: 'N/A' },
      },
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-80.14, 25.81] },
        properties: { price_status: 'known_free' },
      },
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-80.15, 25.82] },
        properties: { price_status: 'known_unpriced', charge: '$4/hr' },
      },
    ]);

    const stats = computeStats(facilities, collection([]), collection([]), 'miami');

    expect(stats.pricedFacilities).toBe(2);
    expect(stats.coveragePercent).toBe(67);
  });
});

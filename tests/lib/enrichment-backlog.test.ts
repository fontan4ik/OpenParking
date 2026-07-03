import { describe, expect, it } from 'vitest';
import { computeDerivedEnrichmentBacklog } from '@/lib/enrichment-backlog';

function groupCount(
  report: ReturnType<typeof computeDerivedEnrichmentBacklog>,
  groupName: keyof ReturnType<typeof computeDerivedEnrichmentBacklog>['groups'],
  key: string,
) {
  return report.groups[groupName].find((group) => group.key === key)?.count ?? 0;
}

describe('computeDerivedEnrichmentBacklog', () => {
  it('labels the output as a derived non-persisted report', () => {
    const report = computeDerivedEnrichmentBacklog([
      {
        parkingusa_id: 'parkingusa:facility:source:1',
        parkingusa_layer: 'facility',
        city: 'Miami',
        source_name: 'Official Source',
        source_id: 'facility:1',
        source_url: 'https://example.com/source',
        api_url: 'https://example.com/api',
        payment_url: 'https://example.com/pay',
        evidence_url: 'https://example.com/evidence',
        price_status: 'known_priced',
        rule_status: 'known',
        enrichment_status: 'complete',
        needs_enrichment: false,
        confidence: 0.95,
      },
    ]);

    expect(report).toMatchObject({
      kind: 'derived_enrichment_backlog_report',
      label: 'Derived enrichment backlog/report',
      derived: true,
      persisted: false,
      totalRecords: 1,
      backlogRecords: 0,
      completeRecords: 1,
      backlogPercent: 0,
      completePercent: 100,
    });
    expect(report.scopeNote).toContain('Calculated from current canonical records at request time');
    expect(report.scopeNote).toContain('does not persist tasks');
  });

  it('groups missing source URLs and keeps bounded public examples', () => {
    const report = computeDerivedEnrichmentBacklog([
      {
        parkingusa_id: 'parkingusa:facility:test:missing-source',
        parkingusa_layer: 'facility',
        city: 'Miami',
        state: 'FL',
        source_name: 'OSM',
        source_id: 'osm:node:1',
        name: 'Lot missing source',
        source_url: '',
        payment_url: 'https://example.com/pay',
        price_status: 'known_priced',
        rule_status: 'known',
        enrichment_status: 'needs_source_url',
        needs_enrichment: true,
        confidence: 0.8,
      },
      {
        parkingusa_id: 'parkingusa:facility:test:missing-source-2',
        parkingusa_layer: 'facility',
        city: 'Miami',
        source_name: 'OSM',
        source_id: 'osm:node:2',
        source_url: 'javascript:alert(1)',
        payment_url: 'https://example.com/pay',
        price_status: 'known_priced',
        rule_status: 'known',
        enrichment_status: 'needs_source_url',
        needs_enrichment: true,
        confidence: 0.8,
      },
    ], { maxExamplesPerGroup: 1 });

    const missingSource = report.groups.missing_url_category.find(
      (group) => group.key === 'missing_source_url',
    );

    expect(missingSource?.count).toBe(2);
    expect(missingSource?.percentOfTotal).toBe(100);
    expect(missingSource?.examples).toHaveLength(1);
    expect(missingSource?.examples[0]).toMatchObject({
      parkingusa_id: 'parkingusa:facility:test:missing-source',
      source_name: 'OSM',
      source_id: 'osm:node:1',
      layer: 'facility',
      city: 'Miami',
      state: 'FL',
      name: 'Lot missing source',
      source_url: '',
      enrichment_status: 'needs_source_url',
    });
  });

  it('groups missing payment URL categories separately from booking links', () => {
    const report = computeDerivedEnrichmentBacklog([
      {
        parkingusa_layer: 'facility',
        source_name: 'Operator',
        source_id: 'operator:1',
        source_url: 'https://example.com/source',
        payment_url: '',
        booking_url: 'https://example.com/book',
        price_status: 'known_priced',
        rule_status: 'known',
        enrichment_status: 'needs_payment_link',
        needs_enrichment: true,
      },
      {
        parkingusa_layer: 'parking_zone',
        source_name: 'Operator',
        source_id: 'operator:2',
        source_url: 'https://example.com/source',
        payment_url: '',
        booking_url: '',
        price_status: 'known_priced',
        rule_status: 'known',
        enrichment_status: 'needs_payment_link',
        needs_enrichment: true,
      },
    ]);

    expect(groupCount(report, 'missing_url_category', 'missing_payment_url')).toBe(2);
    expect(groupCount(report, 'missing_url_category', 'missing_booking_url')).toBe(1);
    expect(groupCount(report, 'missing_url_category', 'missing_payment_or_booking_url')).toBe(1);
    expect(groupCount(report, 'price_status', 'known_priced')).toBe(2);
    expect(groupCount(report, 'layer', 'facility')).toBe(1);
    expect(groupCount(report, 'layer', 'parking_zone')).toBe(1);
  });

  it('groups stale records by stale status from dates or explicit statuses', () => {
    const report = computeDerivedEnrichmentBacklog([
      {
        parkingusa_layer: 'facility',
        source_name: 'Old Feed',
        source_id: 'old:1',
        price_status: 'known_unpriced',
        rule_status: 'partial',
        enrichment_status: 'needs_price',
        last_verified_at: '2020-01-01T00:00:00.000Z',
      },
      {
        parkingusa_layer: 'curb_segment',
        source_name: 'Status Feed',
        source_id: 'stale:1',
        price_status: 'stale',
        rule_status: 'unknown',
        enrichment_status: 'stale',
      },
      {
        parkingusa_layer: 'facility',
        source_name: 'Current Feed',
        source_id: 'current:1',
        price_status: 'known_free',
        rule_status: 'known',
        enrichment_status: 'complete',
      },
    ]);

    expect(groupCount(report, 'stale_status', 'stale')).toBe(2);
    expect(groupCount(report, 'stale_status', 'current_or_unknown')).toBe(1);
    expect(groupCount(report, 'enrichment_status', 'stale')).toBe(1);
  });

  it('groups conflict/review status and confidence bands', () => {
    const report = computeDerivedEnrichmentBacklog([
      {
        parkingusa_layer: 'facility',
        source_name: 'Conflict Feed',
        source_id: 'conflict:1',
        price_status: 'known_priced',
        rule_status: 'conflict',
        enrichment_status: 'conflict',
        confidence: 0.9,
      },
      {
        parkingusa_layer: 'facility',
        source_name: 'Review Feed',
        source_id: 'review:1',
        price_status: 'known_unpriced',
        rule_status: 'unknown',
        enrichment_status: 'needs_review',
        confidence: 0.62,
      },
      {
        parkingusa_layer: 'facility',
        source_name: 'Low Feed',
        source_id: 'low:1',
        price_status: 'unknown',
        rule_status: 'unknown',
        enrichment_status: 'needs_price',
        confidence: 0.4,
      },
      {
        parkingusa_layer: 'facility',
        source_name: 'Unknown Confidence Feed',
        source_id: 'unknown-confidence:1',
        price_status: 'known_free',
        rule_status: 'known',
        enrichment_status: 'complete',
      },
    ]);

    expect(groupCount(report, 'conflict_review_status', 'conflict')).toBe(1);
    expect(groupCount(report, 'conflict_review_status', 'needs_review')).toBe(1);
    expect(groupCount(report, 'conflict_review_status', 'no_conflict_or_review')).toBe(2);
    expect(groupCount(report, 'confidence_band', 'high')).toBe(1);
    expect(groupCount(report, 'confidence_band', 'medium')).toBe(1);
    expect(groupCount(report, 'confidence_band', 'low')).toBe(1);
    expect(groupCount(report, 'confidence_band', 'unknown')).toBe(1);
  });

  it('returns safe zero counts and percentages for an empty dataset', () => {
    const report = computeDerivedEnrichmentBacklog([]);

    expect(report).toMatchObject({
      totalRecords: 0,
      backlogRecords: 0,
      completeRecords: 0,
      backlogPercent: 0,
      completePercent: 0,
    });
    expect(Number.isNaN(report.backlogPercent)).toBe(false);
    expect(Number.isNaN(report.completePercent)).toBe(false);

    for (const groups of Object.values(report.groups)) {
      expect(groups).toEqual([]);
    }
  });
});

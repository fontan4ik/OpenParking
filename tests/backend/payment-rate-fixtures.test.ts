import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const fixturePath = path.join(process.cwd(), 'data/research/payment-rate-model-fixtures-dev51.json');
const report = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
  quality_contract: { required_provenance_fields: string[] };
  fixtures: Array<Record<string, any>>;
};

const REQUIRED = [
  'source_name',
  'source_id',
  'source_url',
  'api_url',
  'payment_url',
  'booking_url',
  'raw_properties',
  'confidence',
  'last_verified_at',
  'data_as_of',
];

describe('DEV-51 payment/rate fixture proposal', () => {
  it('keeps the required provenance contract on every fixture', () => {
    expect(report.quality_contract.required_provenance_fields).toEqual(REQUIRED);
    expect(report.fixtures.length).toBeGreaterThanOrEqual(3);

    for (const fixture of report.fixtures) {
      for (const field of REQUIRED) {
        expect(fixture).toHaveProperty(field);
      }
      expect(fixture.source_name).toEqual(expect.any(String));
      expect(fixture.source_id).toEqual(expect.any(String));
      expect(fixture.raw_properties && typeof fixture.raw_properties).toBe('object');
      expect(typeof fixture.confidence).toBe('number');
      expect(fixture.confidence).toBeGreaterThanOrEqual(0);
      expect(fixture.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('models payment zones without promoting unverified checkout URLs', () => {
    const zoneFixture = report.fixtures.find((fixture) => fixture.fixture_id === 'dev51:south-beach:paybyphone-zone:40208');
    expect(zoneFixture).toBeDefined();
    expect(zoneFixture?.zone_location_id).toBe('40208');
    expect(zoneFixture?.payment_url).toBeNull();
    expect(zoneFixture?.booking_url).toBeNull();
    expect(zoneFixture?.payment_methods).toEqual(expect.arrayContaining(['app', 'web', 'text', 'call']));
    expect(zoneFixture?.confidence).toBeLessThan(0.75);
  });

  it('models structured garage tariff brackets and event rates for Miami Beach G1', () => {
    const g1 = report.fixtures.find((fixture) => fixture.fixture_id === 'dev51:miami-beach:g1:parkmobile:88001');
    expect(g1).toBeDefined();
    expect(g1?.payment_options?.[0]).toMatchObject({
      provider: 'parkmobile',
      zone_location_id: '88001',
      payment_url: null,
    });

    const rules = g1?.rate_plans?.[0]?.rules ?? [];
    expect(rules.map((rule: any) => rule.rule_kind)).toEqual(expect.arrayContaining([
      'hourly_bracket',
      'hourly_bracket_with_base',
      'flat_daily',
      'event',
    ]));
    expect(rules).toContainEqual(expect.objectContaining({ amount_cents: 2000, unit: 'day' }));
    expect(rules).toContainEqual(expect.objectContaining({ amount_cents: 1500, unit: 'vehicle' }));
  });

  it('keeps dynamic Dock/ParkMobile evidence as pending observation with legal review risk', () => {
    const dock = report.fixtures.find((fixture) => fixture.fixture_id === 'dev51:nyc:dock-1540-broadway:dynamic-tariff');
    expect(dock).toBeDefined();
    expect(dock?.legal_risk).toBe('medium_terms_review');
    expect(dock?.payment_url).toBeNull();
    expect(dock?.booking_url).toBeNull();
    expect(dock?.rate_plans?.[0]?.price_status).toBe('variable');
    expect(dock?.upsert_key_proposal).toMatchObject({
      model: 'SourceObservation',
      entityType: 'rate_quote_observation',
    });
  });
});

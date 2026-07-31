import { describe, expect, it } from 'vitest';
import { canonicalFeature, curbPriceLabelFromMeterRates } from '@/lib/data-loader';

describe('curbPriceLabelFromMeterRates', () => {
  it('parses standard $4/hr rate', () => {
    expect(curbPriceLabelFromMeterRates({ METER_RATES: '$4/hr' })).toBe('$4/hr');
  });

  it('parses rate without dollar sign', () => {
    expect(curbPriceLabelFromMeterRates({ METER_RATES: '4/hr' })).toBe('$4/hr');
  });

  it('parses decimal rate', () => {
    expect(curbPriceLabelFromMeterRates({ meter_rates: '$2.50/hr' })).toBe('$2.50/hr');
  });

  it('reads the official Miami rate from the provenance payload', () => {
    expect(
      curbPriceLabelFromMeterRates({
        charge: '',
        price_status: 'not_applicable',
        raw_properties: { METER_RATES: '$4/hr' },
      }),
    ).toBe('$4/hr');
  });

  it('treats raw METER_RATES as authoritative over normalized duplicates', () => {
    const cases: ReadonlyArray<{
      readonly name: string;
      readonly properties: Record<string, unknown>;
      readonly expected: string;
    }> = [
      {
        name: 'valid raw rate over malformed top-level rate',
        properties: { METER_RATES: '$4/hr0', raw_properties: { METER_RATES: '$4/hr' } },
        expected: '$4/hr',
      },
      {
        name: 'malformed raw rate over valid top-level rate',
        properties: { METER_RATES: '$4/hr', raw_properties: { METER_RATES: '$4/hr0' } },
        expected: '',
      },
      {
        name: 'valid top-level rate when raw rate is missing',
        properties: { METER_RATES: '$4/hr' },
        expected: '$4/hr',
      },
    ];

    for (const testCase of cases) {
      expect(curbPriceLabelFromMeterRates(testCase.properties), testCase.name).toBe(testCase.expected);
    }

    const unknownStatus = canonicalFeature(
      {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[-80.1, 25.7], [-80.09, 25.7]] },
        properties: {
          charge: '$6/hr',
          METER_RATES: '$4/hr',
          price_status: 'paid_unknown',
          raw_properties: { METER_RATES: '$4/hr' },
        },
      },
      'curb_segment',
    );

    expect(unknownStatus.properties).not.toHaveProperty('curb_price_label');
    expect(unknownStatus.properties.price_status).toBe('paid_unknown');
    expect(unknownStatus.properties.charge).toBe('$6/hr');
  });

  it('returns empty for zero-rate', () => {
    expect(curbPriceLabelFromMeterRates({ METER_RATES: '0' })).toBe('');
  });

  it('returns empty for missing METER_RATES', () => {
    expect(curbPriceLabelFromMeterRates({})).toBe('');
  });

  it('returns empty for null METER_RATES', () => {
    expect(curbPriceLabelFromMeterRates({ METER_RATES: null })).toBe('');
  });

  it('returns empty for non-numeric text', () => {
    expect(curbPriceLabelFromMeterRates({ METER_RATES: 'free' })).toBe('');
  });

  it('returns empty for unrecognized format', () => {
    expect(curbPriceLabelFromMeterRates({ METER_RATES: 'expensive' })).toBe('');
  });

  it('returns empty for empty string', () => {
    expect(curbPriceLabelFromMeterRates({ METER_RATES: '' })).toBe('');
  });

  it('returns empty for non-string type', () => {
    expect(curbPriceLabelFromMeterRates({ METER_RATES: 4 })).toBe('');
  });

  it('keeps unrelated charge text out of the label', () => {
    expect(curbPriceLabelFromMeterRates({ charge: '$4/hr' })).toBe('');
  });

  it('attaches labels only to known-priced curb segments', () => {
    const knownCurb = canonicalFeature(
      {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[-80.1, 25.7], [-80.09, 25.7]] },
        properties: {
          source_id: 'miami-beach:arcgis:spaces:1',
          source_name: 'City of Miami Beach Parking GIS',
          price_status: 'known_priced',
          raw_properties: { METER_RATES: '$4/hr' },
        },
      },
      'curb_segment',
    );
    const unknownCurb = canonicalFeature(
      {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[-80.1, 25.7], [-80.09, 25.7]] },
        properties: {
          source_id: 'miami-beach:arcgis:spaces:2',
          source_name: 'City of Miami Beach Parking GIS',
          price_status: 'paid_unknown',
          raw_properties: { METER_RATES: '$4/hr' },
        },
      },
      'curb_segment',
    );

    expect(knownCurb.properties.curb_price_label).toBe('$4/hr');
    expect(unknownCurb.properties.curb_price_label).toBe('');
  });

  it('rejects malformed rates and regulated statuses', () => {
    const malformed = canonicalFeature(
      {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[-80.1, 25.7], [-80.09, 25.7]] },
        properties: {
          source_id: 'miami-beach:arcgis:spaces:3',
          price_status: 'known_priced',
          raw_properties: { METER_RATES: '$4/hr0' },
        },
      },
      'curb_segment',
    );
    const regulated = canonicalFeature(
      {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[-80.1, 25.7], [-80.09, 25.7]] },
        properties: {
          source_id: 'miami-beach:arcgis:spaces:4',
          price_status: 'not_applicable',
          raw_properties: { METER_RATES: '$4/hr' },
        },
      },
      'curb_segment',
    );

    expect(malformed.properties.curb_price_label).toBe('');
    expect(regulated.properties.curb_price_label).toBe('');
  });

  it('gates the public label property to Miami generated curb records', () => {
    const facility = canonicalFeature(
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-122.4, 37.78] },
        properties: {
          source_id: 'datasf:meter:1',
          price_status: 'known_priced',
          raw_properties: { METER_RATES: '$4/hr' },
        },
      },
      'facility',
    );
    const zone = canonicalFeature(
      {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[[-80.1, 25.7], [-80.09, 25.7], [-80.09, 25.71], [-80.1, 25.7]]] },
        properties: {
          source_id: 'sf:zone:1',
          price_status: 'known_priced',
          raw_properties: { METER_RATES: '$4/hr' },
        },
      },
      'parking_zone',
    );
    const sfCurb = canonicalFeature(
      {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[-122.4, 37.78], [-122.39, 37.78]] },
        properties: {
          source_id: 'datasf:blockface:1',
          price_status: 'known_priced',
          raw_properties: { METER_RATES: '$4/hr' },
        },
      },
      'curb_segment',
    );
    const miamiCurb = canonicalFeature(
      {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[-80.1, 25.7], [-80.09, 25.7]] },
        properties: {
          source_id: 'miami-beach:arcgis:spaces:1',
          price_status: 'known_priced',
          raw_properties: { METER_RATES: '$4/hr' },
        },
      },
      'curb_segment',
    );

    expect(facility.properties).not.toHaveProperty('curb_price_label');
    expect(zone.properties).not.toHaveProperty('curb_price_label');
    expect(sfCurb.properties).not.toHaveProperty('curb_price_label');
    expect(miamiCurb.properties.curb_price_label).toBe('$4/hr');
  });

  it('does not label a known-priced curb segment without explicit Miami provenance', () => {
    const genericCurb = canonicalFeature(
      {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[-80.1, 25.7], [-80.09, 25.7]] },
        properties: {
          price_status: 'known_priced',
          METER_RATES: '$4/hr',
        },
      },
      'curb_segment',
    );

    expect(genericCurb.properties).not.toHaveProperty('curb_price_label');
    expect(genericCurb.properties.price_status).toBe('known_priced');
  });
});

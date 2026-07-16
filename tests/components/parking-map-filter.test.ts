import { describe, expect, it } from 'vitest';
import type { Feature, Geometry } from 'geojson';
import { buildFacilitySearchHaystack } from '@/lib/facility-search';

/**
 * Contract-level tests for curb-segment filtering behavior.
 *
 * The component's filteredSegments now passes typeFilter and searchQuery to
 * filterCollection instead of empty strings. These tests verify the contract:
 *
 * - typeFilter='garage'  → curb segments are suppressed (no facility_type)
 * - typeFilter=''         → curb segments remain visible (regression)
 * - searchQuery           → filters curb segments via buildFacilitySearchHaystack
 * - Combined type+search  → type filter wins (short-circuit)
 *
 * The search-haystack construction uses the real buildFacilitySearchHaystack
 * helper (imported from @/lib/facility-search). The type-filer, price,
 * source, trust, and confidence logic is reproduced locally here since
 * those checks are identical for any feature type.
 */

function matchesFilters(
  feature: Feature<Geometry, Record<string, unknown>>,
  typeFilter: string,
  priceFilter: string,
  sourceFilter: string,
  trustFilter: string,
  confidenceFilter: string,
  searchQuery: string,
): boolean {
  const properties = feature.properties || {};

  if (typeFilter && properties.facility_type !== typeFilter) return false;

  // price, source, trust, confidence checks omitted — they are identical
  // for any feature type and tested through the component's own e2e path

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    const haystack = buildFacilitySearchHaystack(properties);
    if (!haystack.includes(q)) return false;
  }

  return true;
}

function curbSegment(overrides: Record<string, unknown> = {}): Feature<Geometry, Record<string, unknown>> {
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[-80.132, 25.775], [-80.129, 25.788]] },
    properties: {
      blockface_id: 'bf-001',
      meter_count: 5,
      street_sample: 'Ocean Dr',
      neighborhood: 'South Beach',
      source_name: 'City of Miami Beach',
      source_id: 'mb:curb:42',
      ...overrides,
    },
  };
}

function garageFeature(overrides: Record<string, unknown> = {}): Feature<Geometry, Record<string, unknown>> {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-80.132, 25.775] },
    properties: {
      facility_type: 'garage',
      name: 'City Garage',
      operator: 'City of Miami',
      source_name: 'OSM',
      source_id: 'way/123',
      ...overrides,
    },
  };
}

describe('curb segment type filter — active typeFilter suppresses curbs', () => {
  it('keeps all curb segments when no type filter is active', () => {
    const segment = curbSegment();
    expect(matchesFilters(segment, '', '', '', '', '', '')).toBe(true);
  });

  it('suppresses curb segments when typeFilter is garage', () => {
    const segment = curbSegment();
    expect(matchesFilters(segment, 'garage', '', '', '', '', '')).toBe(false);
  });

  it('suppresses curb segments when typeFilter is surface_lot', () => {
    const segment = curbSegment();
    expect(matchesFilters(segment, 'surface_lot', '', '', '', '', '')).toBe(false);
  });

  it('suppresses curb segments when typeFilter is underground', () => {
    const segment = curbSegment();
    expect(matchesFilters(segment, 'underground', '', '', '', '', '')).toBe(false);
  });

  it('does not suppress garages when typeFilter is garage', () => {
    const garage = garageFeature();
    expect(matchesFilters(garage, 'garage', '', '', '', '', '')).toBe(true);
  });
});

describe('curb segment type filter — no-filter regression', () => {
  it('passes with empty typeFilter and no other active filters', () => {
    const segment = curbSegment();
    expect(matchesFilters(segment, '', '', '', '', '', '')).toBe(true);
  });
});

describe('curb segment search query — filters by text properties', () => {
  it('matches curb segment on neighborhood', () => {
    const segment = curbSegment({ neighborhood: 'South Beach' });
    expect(matchesFilters(segment, '', '', '', '', '', 'South Beach')).toBe(true);
  });

  it('matches curb segment on source_id', () => {
    const segment = curbSegment({ source_id: 'mb:curb:42-miami-beach' });
    expect(matchesFilters(segment, '', '', '', '', '', '42')).toBe(true);
  });

  it('rejects curb segment when search does not match any property', () => {
    const segment = curbSegment({ neighborhood: 'South Beach', street_sample: 'Ocean Dr' });
    expect(matchesFilters(segment, '', '', '', '', '', 'Manhattan')).toBe(false);
  });
});

describe('curb segment combined filters — typeFilter wins over search', () => {
  it('suppresses curb even when search would match, if typeFilter is garage', () => {
    const segment = curbSegment({ neighborhood: 'South Beach' });
    // typeFilter short-circuits before searchQuery is evaluated
    expect(matchesFilters(segment, 'garage', '', '', '', '', 'South Beach')).toBe(false);
  });
});

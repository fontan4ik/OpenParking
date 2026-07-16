import { describe, expect, it } from 'vitest';
import { buildFacilitySearchHaystack } from '@/lib/facility-search';

/* ═══════════════════════════════════════════════════════════════
   Unit: buildFacilitySearchHaystack
   ═══════════════════════════════════════════════════════════════ */

describe('buildFacilitySearchHaystack', () => {
  /* ───── Bilingual type keywords ───── */

  it('includes "garage" alias when facility_type is garage (English)', () => {
    // Given a garage facility with minimal properties
    const properties = { facility_type: 'garage' };

    // When building the search haystack
    const haystack = buildFacilitySearchHaystack(properties);

    // Then it contains the canonical English alias
    expect(haystack.includes('garage')).toBe(true);
  });

  it('includes "гараж" alias when facility_type is garage (Russian)', () => {
    // Given a garage facility
    const properties = { facility_type: 'garage' };

    // When building the search haystack
    const haystack = buildFacilitySearchHaystack(properties);

    // Then it contains the Russian alias
    expect(haystack.includes('гараж')).toBe(true);
  });

  it('includes "surface lot" and "площадка" aliases for surface_lot', () => {
    // Given a surface_lot facility
    const properties = { facility_type: 'surface_lot' };

    // When building the search haystack
    const haystack = buildFacilitySearchHaystack(properties);

    // Then both English and Russian aliases are present
    expect(haystack.includes('surface lot')).toBe(true);
    expect(haystack.includes('площадка')).toBe(true);
  });

  it('includes "паркомат" and "meter" aliases for street_meter', () => {
    // Given a street_meter facility
    const properties = { facility_type: 'street_meter' };

    // When building the search haystack
    const haystack = buildFacilitySearchHaystack(properties);

    // Then both language aliases are present
    expect(haystack.includes('паркомат')).toBe(true);
    expect(haystack.includes('meter')).toBe(true);
  });

  it('includes "valet" alias for valet type', () => {
    // Given a valet facility
    const properties = { facility_type: 'valet' };

    // When building the search haystack
    const haystack = buildFacilitySearchHaystack(properties);

    // Then the valet keyword is present
    expect(haystack.includes('valet')).toBe(true);
  });

  it('includes "парковка" alias for parking type', () => {
    // Given a generic parking facility
    const properties = { facility_type: 'parking' };

    // When building the search haystack
    const haystack = buildFacilitySearchHaystack(properties);

    // Then both English and Russian are present
    expect(haystack.includes('parking')).toBe(true);
    expect(haystack.includes('парковка')).toBe(true);
  });

  /* ───── No false positives between types ───── */

  it('does NOT include garage aliases when facility_type is surface_lot', () => {
    // Given a surface_lot facility
    const properties = { facility_type: 'surface_lot' };

    // When building the search haystack
    const haystack = buildFacilitySearchHaystack(properties);

    // Then unrelated type aliases are absent
    expect(haystack.includes('garage')).toBe(false);
    expect(haystack.includes('гараж')).toBe(false);
  });

  it('does NOT include surface_lot aliases when facility_type is valet', () => {
    // Given a valet facility
    const properties = { facility_type: 'valet' };

    // When building the search haystack
    const haystack = buildFacilitySearchHaystack(properties);

    // Then unrelated type aliases are absent
    expect(haystack.includes('surface lot')).toBe(false);
    expect(haystack.includes('площадка')).toBe(false);
  });

  /* ───── Substring matching via partial terms ───── */

  it('enables substring matching of "lot" against surface_lot via alias', () => {
    // Given a surface_lot facility
    const properties = { facility_type: 'surface_lot' };

    // When building the search haystack
    const haystack = buildFacilitySearchHaystack(properties);

    // Then "lot" appears as part of "surface lot" for substring matches
    expect(haystack.includes('lot')).toBe(true);
  });

  it('enables substring matching of "парк" against паркомат', () => {
    // Given a street_meter facility
    const properties = { facility_type: 'street_meter' };

    // When building the search haystack
    const haystack = buildFacilitySearchHaystack(properties);

    // Then "парк" appears as part of "паркомат"
    expect(haystack.includes('парк')).toBe(true);
  });

  /* ───── Existing text-search fields preserved ───── */

  it('includes name, operator, source_id, street, and neighborhood', () => {
    // Given a facility with all text fields populated
    const properties = {
      facility_type: 'garage',
      name: 'Central Garage',
      operator: 'CityPark',
      source_id: 'src:123',
      street: 'Main St',
      neighborhood: 'Downtown',
    };

    // When building the search haystack
    const haystack = buildFacilitySearchHaystack(properties);

    // Then every field is lowercased and present
    expect(haystack.includes('central garage')).toBe(true);
    expect(haystack.includes('citypark')).toBe(true);
    expect(haystack.includes('src:123')).toBe(true);
    expect(haystack.includes('main st')).toBe(true);
    expect(haystack.includes('downtown')).toBe(true);
  });

  it('preserves name-only search across type aliases', () => {
    // Given a garage with a descriptive name
    const properties = {
      facility_type: 'garage',
      name: 'Downtown Parking Garage',
    };

    // When building the search haystack
    const haystack = buildFacilitySearchHaystack(properties);

    // Then the name tokens and type aliases coexist
    expect(haystack.includes('downtown')).toBe(true);
    expect(haystack.includes('parking')).toBe(true);
    expect(haystack.includes('garage')).toBe(true);
    expect(haystack.includes('гараж')).toBe(true);
  });

  /* ───── Case and whitespace normalisation ───── */

  it('lowercases the entire haystack', () => {
    // Given a facility with mixed-case fields
    const properties = {
      facility_type: 'Garage',
      name: 'Central PARKING',
    };

    // When building the search haystack
    const haystack = buildFacilitySearchHaystack(properties);

    // Then everything is lowercase
    expect(haystack).toBe(haystack.toLowerCase());
    expect(haystack.includes('central parking')).toBe(true);
    expect(haystack.includes('garage')).toBe(true);
  });

  it('collapses multiple whitespace runs into single spaces', () => {
    // Given properties with sparse whitespace
    const properties = {
      facility_type: '   garage   ',
      name: '  Lot  A  ',
      street: 'Elm  St',
    };

    // When building the search haystack
    const haystack = buildFacilitySearchHaystack(properties);

    // Then whitespace is normalised
    expect(haystack.includes('garage')).toBe(true);
    expect(haystack.includes('lot a')).toBe(true);
    expect(haystack.includes('elm st')).toBe(true);
    // And no double spaces remain
    expect(haystack).not.toMatch(/\s{2,}/);
  });

  /* ───── Edge cases ───── */

  it('handles empty properties without error', () => {
    // Given completely empty properties
    const properties = {};

    // When building the search haystack
    const haystack = buildFacilitySearchHaystack(properties);

    // Then it returns an empty-ish string
    expect(typeof haystack).toBe('string');
    expect(haystack.length).toBeGreaterThanOrEqual(0);
  });

  it('handles missing facility_type by falling back to empty string alias', () => {
    // Given properties without facility_type
    const properties = { name: 'Test Lot' };

    // When building the search haystack
    const haystack = buildFacilitySearchHaystack(properties);

    // Then the name is still searchable
    expect(haystack.includes('test lot')).toBe(true);
  });

  it('preserves non-canonical or extended facility_type values', () => {
    // Given a facility with a non-canonical type (e.g. curb_segment)
    const properties = { facility_type: 'curb_segment' };

    // When building the search haystack
    const haystack = buildFacilitySearchHaystack(properties);

    // Then the raw type string is still included
    expect(haystack.includes('curb_segment')).toBe(true);
  });

  /* ───── Full round-trip: simulate q search matching ───── */

  it('matches English "garage" query for garage-type facility', () => {
    // Given a garage with no name/operator help
    const properties = { facility_type: 'garage' };
    const q = 'garage';

    // When building haystack and checking includes
    const haystack = buildFacilitySearchHaystack(properties);

    // Then the query matches
    expect(haystack.includes(q)).toBe(true);
  });

  it('matches Russian "гараж" query for garage-type facility', () => {
    // Given a garage with no name/operator help
    const properties = { facility_type: 'garage' };
    const q = 'гараж';

    // When building haystack and checking includes
    const haystack = buildFacilitySearchHaystack(properties);

    // Then the Russian query matches
    expect(haystack.includes(q)).toBe(true);
  });

  it('matches Russian "площадка" query for surface_lot facility', () => {
    // Given a surface_lot with no name/operator help
    const properties = { facility_type: 'surface_lot' };
    const q = 'площадка';

    // When building haystack and checking includes
    const haystack = buildFacilitySearchHaystack(properties);

    // Then the Russian query matches
    expect(haystack.includes(q)).toBe(true);
  });

  it('matches Russian "паркомат" query for street_meter facility', () => {
    // Given a street_meter with no name/operator help
    const properties = { facility_type: 'street_meter' };
    const q = 'паркомат';

    // When building haystack and checking includes
    const haystack = buildFacilitySearchHaystack(properties);

    // Then the Russian query matches
    expect(haystack.includes(q)).toBe(true);
  });

  it('does NOT match Russian "гараж" query for surface_lot facility', () => {
    // Given a surface_lot facility (not a garage)
    const properties = { facility_type: 'surface_lot' };
    const q = 'гараж';

    // When building haystack and checking includes
    const haystack = buildFacilitySearchHaystack(properties);

    // Then the Russian query does NOT match
    expect(haystack.includes(q)).toBe(false);
  });

  it('still matches existing name+operator text search', () => {
    // Given a surface_lot with a descriptive name
    const properties = {
      facility_type: 'surface_lot',
      name: 'Miami Beach Parking Lot',
      operator: 'City of Miami Beach',
    };
    const q = 'miami beach';

    // When building haystack and checking includes
    const haystack = buildFacilitySearchHaystack(properties);

    // Then the existing text search still works
    expect(haystack.includes(q)).toBe(true);
  });
});

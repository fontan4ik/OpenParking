import { describe, expect, test } from 'vitest';
import { normalizeStreetParkingTags, tagsObjectToStringArray } from '@/lib/street-parking';

describe('ParkingUSA street parking wrapper', () => {
  test('normalizes old parking:lane tags from OSM tag objects', () => {
    const result = normalizeStreetParkingTags({
      'parking:lane:left': 'parallel',
      'parking:condition:left': 'ticket',
    });

    expect(result.inputTags).toContain('parking:lane:left=parallel');
    expect(result.normalizedTags).toContain('parking:left:orientation=parallel');
    expect(result.normalizedTags).toContain('parking:left:fee=yes');
    expect(result.confidence).toBeGreaterThan(0);
  });

  test('ignores empty values when converting tag objects', () => {
    expect(
      tagsObjectToStringArray({
        amenity: 'parking',
        fee: '',
        capacity: null,
        source: undefined,
      })
    ).toEqual(['amenity=parking']);
  });
});

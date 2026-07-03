import { describe, expect, it } from 'vitest';
import { hasKnownPrice, isKnownPriceValue, priceTextOrFallback } from '@/lib/price-utils';

describe('price utils', () => {
  it('treats NA-style price sentinel strings as unknown', () => {
    for (const value of ['N/A', 'n/a', 'NA', 'unknown', '', '  ', 'not available']) {
      expect(isKnownPriceValue(value)).toBe(false);
      expect(priceTextOrFallback(value, 'Price N/A')).toBe('Price N/A');
      expect(hasKnownPrice({ charge: value })).toBe(false);
    }
  });

  it('keeps real price strings, free parking markers, and numeric rates as known', () => {
    expect(isKnownPriceValue('$2/hr')).toBe(true);
    expect(isKnownPriceValue('no')).toBe(true);
    expect(hasKnownPrice({ charge: '$2/hr' })).toBe(true);
    expect(hasKnownPrice({ charge: 'no' })).toBe(true);
    expect(hasKnownPrice({ base_hourly_rate: 0 })).toBe(true);
  });

  it('does not let stale known status override an explicit NA charge', () => {
    expect(hasKnownPrice({ price_status: 'known', charge: 'N/A' })).toBe(false);
  });
});

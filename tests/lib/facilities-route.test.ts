import { describe, expect, it } from 'vitest';
import { matchesPriceFilter } from '@/lib/data-quality';

describe('/api/facilities price filter', () => {
  it('uses canonical price_status values for price=known', () => {
    expect(matchesPriceFilter({ price_status: 'known_priced', charge: 'N/A' }, 'known')).toBe(true);
    expect(matchesPriceFilter({ price_status: 'known_free' }, 'known')).toBe(true);
    expect(matchesPriceFilter({ price_status: 'known_unpriced', charge: '$4/hr' }, 'known')).toBe(false);
    expect(matchesPriceFilter({ price_status: 'paid_unknown' }, 'known')).toBe(false);
    expect(matchesPriceFilter({ price_status: 'unknown' }, 'known')).toBe(false);
  });

  it('treats price=unknown as the inverse canonical filter', () => {
    expect(matchesPriceFilter({ price_status: 'known_priced' }, 'unknown')).toBe(false);
    expect(matchesPriceFilter({ price_status: 'known_free' }, 'unknown')).toBe(false);
    expect(matchesPriceFilter({ price_status: 'known_unpriced' }, 'unknown')).toBe(true);
    expect(matchesPriceFilter({ price_status: 'variable' }, 'unknown')).toBe(true);
  });
});

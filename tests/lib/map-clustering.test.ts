import { describe, expect, it } from 'vitest';
import {
  FACILITY_CLUSTER_SOURCE_OPTIONS,
  getFacilityClusterId,
} from '@/lib/map-clustering';

describe('facility map clustering', () => {
  it('uses a compact cluster radius until neighborhood zoom', () => {
    expect(FACILITY_CLUSTER_SOURCE_OPTIONS).toEqual({
      cluster: true,
      clusterMaxZoom: 14,
      clusterRadius: 56,
    });
  });

  it('returns the numeric cluster id for a rendered cluster', () => {
    expect(getFacilityClusterId({ cluster: true, cluster_id: 24, point_count: 18 })).toBe(24);
  });

  it('rejects an ordinary facility or malformed cluster', () => {
    expect(getFacilityClusterId({ source_id: 'parking:1' })).toBeNull();
    expect(getFacilityClusterId({ cluster: true, cluster_id: '24' })).toBeNull();
    expect(getFacilityClusterId(null)).toBeNull();
  });
});

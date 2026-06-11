import { describe, expect, test } from 'vitest';
import {
  estimateCurbCapacity,
  estimateZoneCapacity,
  lineLengthM,
  polygonAreaM2,
} from '@/lib/heuristics/parking-capacity';

describe('parking capacity heuristics', () => {
  test('uses tagged OSM capacity before geometry estimates', () => {
    const result = estimateZoneCapacity({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-122.4, 37.7] },
      properties: { source_id: 'osm:way:1', capacity: '42' },
    });

    expect(result).toMatchObject({
      estimatedCapacity: 42,
      confidence: 0.85,
      method: 'osm_tagged_capacity',
      reviewRequired: false,
    });
  });

  test('estimates surface lot capacity from polygon area', () => {
    const geometry = {
      type: 'Polygon',
      coordinates: [
        [
          [-122.4000, 37.7000],
          [-122.3990, 37.7000],
          [-122.3990, 37.7005],
          [-122.4000, 37.7005],
          [-122.4000, 37.7000],
        ],
      ],
    };

    const area = polygonAreaM2(geometry);
    const result = estimateZoneCapacity({
      type: 'Feature',
      geometry,
      properties: { source_id: 'osm:way:2', facility_type: 'surface' },
    });

    expect(area).toBeGreaterThan(4_000);
    expect(result?.estimatedCapacity).toBeGreaterThan(100);
    expect(result?.reviewRequired).toBe(true);
  });

  test('uses DataSF meter count before curb length estimates', () => {
    const result = estimateCurbCapacity({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [-122.4, 37.7],
          [-122.399, 37.7],
        ],
      },
      properties: { source_id: 'datasf:blockface:1', meter_count: 7 },
    });

    expect(result).toMatchObject({
      estimatedCapacity: 7,
      confidence: 0.75,
      method: 'datasf_meter_count',
      reviewRequired: false,
    });
  });

  test('measures curb length for unmetered fallback estimates', () => {
    const geometry = {
      type: 'LineString',
      coordinates: [
        [-122.4, 37.7],
        [-122.399, 37.7],
      ],
    };

    expect(lineLengthM(geometry)).toBeGreaterThan(80);
  });
});

import { describe, expect, it } from 'vitest';
import {
  alignCurbLineAlongRoad,
  alignCurbLineToNearestRoad,
  assessCurbGeometryQuality,
  withCurbGeometryQuality,
  type RoadLine,
} from '@/lib/parking-geometry-quality';
import type { GeoJSONFeature } from '@/lib/data-loader';

function line(coordinates: [number, number][]): GeoJSONFeature {
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates },
    properties: {
      source_id: 'parking-space-row:test',
      confidence: 0.9,
      offer_confidence: 0.9,
      display_confidence: 0.9,
    },
  };
}

describe('alignCurbLineAlongRoad', () => {
  it('follows a multi-vertex road and produces >2 coordinates that pass geometry quality', () => {
    const road: RoadLine = {
      name: 'Collins Avenue',
      coordinates: [
        [-80.130, 25.780],
        [-80.130, 25.781],
        [-80.130, 25.782],
      ],
    };
    const feature = line([
      [-80.12996, 25.7805],
      [-80.12996, 25.7815],
    ]);
    const aligned = alignCurbLineAlongRoad(feature, { roads: [road] });
    const coords = aligned.geometry.coordinates as [number, number][];

    expect(coords.length).toBeGreaterThan(2);
    expect(aligned.properties.geometry_alignment_method).toBe(
      'road_centerline_following_polyline'
    );

    const result = assessCurbGeometryQuality(aligned, { roads: [road] });
    expect(result.status).toBe('accepted');

    const qualityChecked = withCurbGeometryQuality(aligned, { roads: [road] });
    expect(qualityChecked?.properties.geometry_quality_status).toBe('accepted');
    expect(qualityChecked?.geometry.coordinates).toHaveLength(3);
  });

  it('produces a straight 2-point line for a 2-vertex road', () => {
    const road: RoadLine = {
      name: 'Straight Street',
      coordinates: [
        [-80.130, 25.780],
        [-80.130, 25.782],
      ],
    };
    const feature = line([
      [-80.12996, 25.7805],
      [-80.12996, 25.7815],
    ]);
    const aligned = alignCurbLineAlongRoad(feature, { roads: [road] });
    const coords = aligned.geometry.coordinates as [number, number][];

    expect(coords).toHaveLength(2);
  });

  it('falls back to straight line and yields needs_field_review when road is far', () => {
    const road: RoadLine = {
      coordinates: [
        [-80.130, 25.780],
        [-80.130, 25.782],
      ],
    };
    const feature = line([
      [-80.12975, 25.7805],
      [-80.12975, 25.7815],
    ]);
    const aligned = alignCurbLineAlongRoad(feature, { roads: [road] });
    const coords = aligned.geometry.coordinates as [number, number][];

    expect(coords).toHaveLength(2);

    const result = assessCurbGeometryQuality(aligned, { roads: [road] });
    expect(result.status).toBe('needs_field_review');
    expect(result.reasons).toContain('too_far_from_road');
  });
});

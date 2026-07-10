import { describe, expect, it } from 'vitest';
import {
  alignCurbLineToNearestRoad,
  assessCurbGeometryQuality,
  withCurbGeometryQuality,
  type PolygonArea,
  type RoadLine,
} from '@/lib/parking-geometry-quality';
import type { GeoJSONFeature } from '@/lib/data-loader';

const road: RoadLine = {
  sourceId: 'osm:way:test-road',
  coordinates: [
    [-80.1300, 25.7800],
    [-80.1300, 25.7820],
  ],
};

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

function area(ring: [number, number][]): PolygonArea {
  return {
    bbox: [
      Math.min(...ring.map((point) => point[0])),
      Math.min(...ring.map((point) => point[1])),
      Math.max(...ring.map((point) => point[0])),
      Math.max(...ring.map((point) => point[1])),
    ],
    rings: [ring],
    sourceId: 'area:test',
  };
}

describe('parking geometry quality', () => {
  it('makes a curb segment exactly straight and parallel to the nearest road', () => {
    const feature = line([
      [-80.13, 25.78],
      [-80.1299, 25.7805],
      [-80.1297, 25.781],
    ]);
    const aligned = alignCurbLineToNearestRoad(feature, {
      roads: [{ coordinates: [[-80.1302, 25.78], [-80.1302, 25.782]] }],
    });

    expect(aligned.geometry.type).toBe('LineString');
    expect(aligned.geometry.coordinates).toHaveLength(2);
    const coordinates = aligned.geometry.coordinates as [number, number][];
    expect(Math.abs(coordinates[0][0] - coordinates[1][0])).toBeLessThan(1e-10);
    expect(aligned.properties.geometry_alignment_method).toBe('nearest_road_segment_exact_parallel');
  });

  it('uses one shared axis for straight sections of the same named street', () => {
    const roads: RoadLine[] = [
      { name: 'Washington Avenue', coordinates: [[-80.13, 25.777], [-80.13, 25.778]] },
      { name: 'Washington Avenue', coordinates: [[-80.13, 25.778], [-80.12999, 25.779]] },
    ];
    const first = alignCurbLineToNearestRoad(line([[-80.12996, 25.7771], [-80.12996, 25.7778]]), { roads });
    const second = alignCurbLineToNearestRoad(line([[-80.12995, 25.7782], [-80.12995, 25.7789]]), { roads });
    const firstCoordinates = first.geometry.coordinates as [number, number][];
    const secondCoordinates = second.geometry.coordinates as [number, number][];
    const angle = (coordinates: [number, number][]) =>
      Math.atan2(
        (coordinates[1][1] - coordinates[0][1]) * 110_540,
        (coordinates[1][0] - coordinates[0][0]) * 100_000,
      );

    expect(Math.abs(angle(firstCoordinates) - angle(secondCoordinates))).toBeLessThan(2e-6);
    const referenceLat = 25.778;
    const midpoint = (coordinates: [number, number][]) => ({
      x: ((coordinates[0][0] + coordinates[1][0]) / 2) * 111_320 * Math.cos((referenceLat * Math.PI) / 180),
      y: ((coordinates[0][1] + coordinates[1][1]) / 2) * 110_540,
    });
    const firstMidpoint = midpoint(firstCoordinates);
    const secondMidpoint = midpoint(secondCoordinates);
    const sharedAngle = angle(firstCoordinates);
    const crossAxisOffset =
      (secondMidpoint.x - firstMidpoint.x) * -Math.sin(sharedAngle) +
      (secondMidpoint.y - firstMidpoint.y) * Math.cos(sharedAngle);
    expect(Math.abs(crossAxisOffset)).toBeLessThan(0.1);
    expect(first.properties.geometry_alignment_method).toBe('named_street_shared_axis');
    expect(second.properties.geometry_alignment_method).toBe('named_street_shared_axis');
  });

  it('does not let a distant same-name road section pull a curb away from its source points', () => {
    const feature = line([[-80.1328, 25.7758], [-80.1327, 25.7762]]);
    const aligned = alignCurbLineToNearestRoad(feature, {
      roads: [
        { name: 'Collins Avenue', coordinates: [[-80.1329, 25.7755], [-80.1327, 25.7765]] },
        { name: 'Collins Avenue', coordinates: [[-80.129, 25.79], [-80.126, 25.795]] },
      ],
    });
    const coordinates = aligned.geometry.coordinates as [number, number][];
    const originalMidpoint = [-80.13275, 25.776] as const;
    const alignedMidpoint = [
      (coordinates[0][0] + coordinates[1][0]) / 2,
      (coordinates[0][1] + coordinates[1][1]) / 2,
    ];
    const movedMeters = Math.hypot(
      (alignedMidpoint[0] - originalMidpoint[0]) * 100_000,
      (alignedMidpoint[1] - originalMidpoint[1]) * 110_540,
    );

    expect(movedMeters).toBeLessThan(15);
  });
  it('accepts straight curb lines that are parallel and offset from a road', () => {
    const result = assessCurbGeometryQuality(
      line([
        [-80.12997, 25.7802],
        [-80.12997, 25.7818],
      ]),
      { roads: [road] },
    );

    expect(result).toMatchObject({
      status: 'accepted',
      reasons: [],
      nearestRoadSourceId: 'osm:way:test-road',
    });
    expect(result.nearestRoadDistanceMeters).toBeGreaterThan(1);
    expect(result.nearestRoadAngleDeltaDegrees).toBeLessThan(2);
  });

  it('suppresses a curb line that crosses an intersecting street', () => {
    const feature = line([
      [-80.131, 25.7801],
      [-80.129, 25.7801],
    ]);
    const result = assessCurbGeometryQuality(feature, {
      roads: [
        { sourceId: 'parallel', coordinates: [[-80.131, 25.78], [-80.129, 25.78]] },
        { sourceId: 'cross-street', coordinates: [[-80.13, 25.779], [-80.13, 25.781]] },
      ],
    });

    expect(result.status).toBe('suppressed');
    expect(result.reasons).toContain('crosses_intersecting_road');
  });

  it('requires field review when a curb line is not parallel to the nearest road', () => {
    const result = assessCurbGeometryQuality(
      line([
        [-80.12995, 25.7802],
        [-80.12985, 25.7803],
      ]),
      { roads: [road] },
    );

    expect(result.status).toBe('needs_field_review');
    expect(result.reasons).toContain('not_parallel_to_road');
  });

  it('requires field review when road reference is missing instead of promoting generated rows', () => {
    const result = withCurbGeometryQuality(
      line([
        [-80.12997, 25.7802],
        [-80.12997, 25.7818],
      ]),
      { roads: [] },
    );

    expect(result?.properties).toMatchObject({
      geometry_quality_status: 'needs_field_review',
      geometry_quality_reasons: ['missing_road_reference'],
      ordinary_parking_status: 'unknown_pending_snap_conflict_check',
      field_conflict_status: 'needs_field_review',
      confidence: 0.55,
    });
  });

  it('suppresses generated curb lines that enter a parking-area or building polygon', () => {
    const polygon = area([
      [-80.1301, 25.7805],
      [-80.1298, 25.7805],
      [-80.1298, 25.7815],
      [-80.1301, 25.7815],
    ]);
    const feature = line([
      [-80.12997, 25.7802],
      [-80.12997, 25.7818],
    ]);

    expect(withCurbGeometryQuality(feature, { roads: [road], parkingAreas: [polygon] })).toBeNull();
    expect(withCurbGeometryQuality(feature, { roads: [road], buildings: [polygon] })).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import type { Feature, Geometry } from 'geojson';
import { isReferenceParkingSegment, splitParkingSegments, type FeatureCollection } from '@/lib/map-segment-classification';

function line(properties: Record<string, unknown>): Feature<Geometry, Record<string, unknown>> {
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[-80.132, 25.775], [-80.129, 25.788]] },
    properties,
  };
}

describe('map segment classification', () => {
  it('keeps ordinary high-confidence curb offers in the default curb layer', () => {
    const feature = line({
      facility_type: 'curb_segment',
      ordinary_parking_status: 'ordinary_parking_offer',
      display_confidence: 0.82,
    });

    expect(isReferenceParkingSegment(feature)).toBe(false);
  });

  it('moves Miami Beach regulatory/residential lines to the reference layer', () => {
    const feature = line({
      source_name: 'City of Miami Beach Parking GIS',
      source_id: 'miami-beach:arcgis:zones:162',
      facility_type: 'curb_segment',
      ordinary_parking_status: 'not_ordinary_parking_offer',
      source_zone_type: 'residential_parking_zone',
      availability_semantics: 'regulatory_or_residential_rule_evidence_only',
      display_confidence: 0.35,
    });

    expect(isReferenceParkingSegment(feature)).toBe(true);
  });

  it('moves generated field-review curb rows to the reference layer', () => {
    const feature = line({
      source_id: 'parking-space-row:miami-beach:40208',
      ordinary_parking_status: 'unknown_pending_snap_conflict_check',
      field_conflict_status: 'needs_field_review',
      availability_semantics: 'official_space_evidence_not_verified_continuous_curb_offer',
      display_confidence: 0.55,
    });

    expect(isReferenceParkingSegment(feature)).toBe(true);
  });

  it('splits ordinary and reference segments for separate MapLibre sources', () => {
    const ordinary = line({ ordinary_parking_status: 'ordinary_parking_offer', display_confidence: 0.8 });
    const reference = line({ ordinary_parking_status: 'not_ordinary_parking_offer', display_confidence: 0.35 });
    const collection: FeatureCollection = { type: 'FeatureCollection', features: [ordinary, reference] };

    expect(splitParkingSegments(collection)).toEqual({
      ordinary: { type: 'FeatureCollection', features: [ordinary] },
      reference: { type: 'FeatureCollection', features: [reference] },
    });
  });
});

import type { Feature, Geometry } from 'geojson';

export interface FeatureCollection {
  type: 'FeatureCollection';
  features: Feature<Geometry, Record<string, unknown>>[];
}

const REFERENCE_ORDINARY_STATUSES = new Set([
  'not_ordinary_parking_offer',
  'payment_equipment_evidence_only',
  'unknown_pending_snap_conflict_check',
]);

const REFERENCE_AVAILABILITY_SEMANTICS = [
  'regulatory_or_residential_rule_evidence_only',
  'official_space_evidence_not_verified_continuous_curb_offer',
  'meter_or_payment_equipment_evidence_not_standalone_stall_offer',
];

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function numberValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isReferenceParkingSegment(feature: Feature<Geometry, Record<string, unknown>>) {
  const properties = feature.properties || {};
  const ordinaryStatus = stringValue(properties.ordinary_parking_status);
  const fieldConflictStatus = stringValue(properties.field_conflict_status);
  const availabilitySemantics = stringValue(properties.availability_semantics);
  const sourceZoneType = stringValue(properties.source_zone_type);
  const displayConfidence = numberValue(properties.display_confidence ?? properties.offer_confidence ?? properties.confidence);

  return (
    REFERENCE_ORDINARY_STATUSES.has(ordinaryStatus) ||
    fieldConflictStatus === 'needs_field_review' ||
    sourceZoneType === 'residential_parking_zone' ||
    REFERENCE_AVAILABILITY_SEMANTICS.includes(availabilitySemantics) ||
    (displayConfidence !== null && displayConfidence < 0.6)
  );
}

export function splitParkingSegments(data: FeatureCollection) {
  const ordinary: FeatureCollection = { type: 'FeatureCollection', features: [] };
  const reference: FeatureCollection = { type: 'FeatureCollection', features: [] };

  for (const feature of data.features) {
    if (isReferenceParkingSegment(feature)) {
      reference.features.push(feature);
    } else {
      ordinary.features.push(feature);
    }
  }

  return { ordinary, reference };
}

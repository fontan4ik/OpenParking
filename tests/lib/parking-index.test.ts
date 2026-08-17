import { describe, expect, it } from 'vitest';
import { buildParkingIndex, canonicalFeature, cityDbScope, curbSegmentWithLineGeometry, deriveParkingSpacePointLines, loadCityBoundary, loadCurbSegments, loadFacilities, loadAllLayers, loadZones, type GeoJSONCollection } from '@/lib/data-loader';
import {
  curbSegmentFeatureFromDbRow,
  facilityFeatureFromDbRow,
  parkingZoneFeatureFromDbRow,
  type CurbSegmentDbRow,
  type FacilityDbRow,
  type ParkingZoneDbRow,
} from '@/lib/db-loader';

function collection(features: GeoJSONCollection['features']): GeoJSONCollection {
  return { type: 'FeatureCollection', features };
}

function segmentLengthMeters(coordinates: unknown): number {
  if (!Array.isArray(coordinates)) return 0;
  if (coordinates.length > 0 && Array.isArray(coordinates[0]) && typeof coordinates[0][0] === 'number') {
    const positions = coordinates as [number, number][];
    return positions.slice(1).reduce((sum, point, index) => sum + haversineMeters(positions[index], point), 0);
  }
  if (coordinates.length > 0 && Array.isArray(coordinates[0])) {
    return Math.max(...coordinates.map(segmentLengthMeters));
  }
  return 0;
}

function haversineMeters(a: [number, number], b: [number, number]) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const radiusMeters = 6_371_000;
  const [lngA, latA] = a;
  const [lngB, latB] = b;
  const deltaLat = toRadians(latB - latA);
  const deltaLng = toRadians(lngB - lngA);
  const sinLat = Math.sin(deltaLat / 2);
  const sinLng = Math.sin(deltaLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRadians(latA)) * Math.cos(toRadians(latB)) * sinLng * sinLng;
  return 2 * radiusMeters * Math.asin(Math.min(1, Math.sqrt(h)));
}

function parkingSpacePoint(
  sourceId: string,
  coordinates: [number, number],
  parkmobileZone?: string,
): GeoJSONCollection['features'][number] {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates },
    properties: {
      source_id: sourceId,
      ...(parkmobileZone ? { parkmobile_zone: parkmobileZone } : {}),
    },
  };
}

describe('ParkingUSA Parking Index', () => {
  it('does not combine generated rows from different ParkMobile zones', () => {
    const rows = deriveParkingSpacePointLines([
      parkingSpacePoint('miami-beach:arcgis:spaces:1', [-80.13, 25.78], '88503'),
      parkingSpacePoint('miami-beach:arcgis:spaces:2', [-80.13, 25.78005], '88503'),
      parkingSpacePoint('miami-beach:arcgis:spaces:3', [-80.13, 25.7801], '88526'),
      parkingSpacePoint('miami-beach:arcgis:spaces:4', [-80.13, 25.78015], '88526'),
    ]);

    const generatedRows = rows.filter((feature) => String(feature.properties.source_id).startsWith('parking-space-row:'));

    expect(generatedRows).toHaveLength(2);
    expect(new Set(generatedRows.map((feature) => feature.properties.parkmobile_zone))).toEqual(new Set(['88503', '88526']));
    for (const row of generatedRows) {
      expect(row.geometry.type).toBe('LineString');
      expect(row.geometry.coordinates).toHaveLength(2);
    }
  });

  it('keeps unzoned legacy parking points in the same generated row', () => {
    const rows = deriveParkingSpacePointLines([
      parkingSpacePoint('legacy:space:1', [-80.13, 25.78]),
      parkingSpacePoint('legacy:space:2', [-80.13, 25.78005]),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].properties.source_id).toBe('parking-space-row:0-1');
    expect(rows[0].properties.official_point_fit_max_meters).toBe(0);
  });

  it('uses Miami plus Miami-Dade only for the Miami DB baseline scope', () => {
    expect(cityDbScope('miami')).toEqual(['Miami', 'Miami-Dade']);
    expect(cityDbScope('unknown-city')).toEqual([]);
    expect(cityDbScope('sf')).toEqual(['San Francisco']);
    expect(cityDbScope('nyc')).toEqual(['New York City', 'New York']);
  });

  it('keeps reconciled Miami Beach OSM basemap parking POIs as review candidates', async () => {
    const facilities = await loadFacilities('miami');
    const mussParkCandidates = facilities.features.filter((feature) =>
      ['osm:way:1425673751', 'osm:way:1425673752'].includes(String(feature.properties.source_id))
    );

    expect(mussParkCandidates).toHaveLength(2);
    for (const candidate of mussParkCandidates) {
      expect(candidate.properties).toMatchObject({
        existence_status: 'candidate',
        enrichment_status: 'needs_review',
        ordinary_parking_status: 'unknown_pending_access_rule_check',
        field_conflict_status: 'needs_field_review',
      });
      expect(candidate.properties.access).toBe('');
    }
  });

  it('does not promote parent features with parking=yes into parking facilities or zones', async () => {
    const [facilities, zones] = await Promise.all([loadFacilities('miami'), loadZones('miami')]);
    const incidentalIds = new Set([
      'osm:way:25480974', // Miami Beach Golf Club
      'osm:way:76684242', // Flamingo Park
      'osm:way:258238120', // hotel with parking available
    ]);

    expect(facilities.features.some((feature) => incidentalIds.has(String(feature.properties.source_id)))).toBe(false);
    expect(zones.features.some((feature) => incidentalIds.has(String(feature.properties.source_id)))).toBe(false);
  });

  it('loads the neutral Miami-Dade coverage boundary for the selected Miami scope', async () => {
    const boundary = await loadCityBoundary('miami');
    expect(boundary.features).toHaveLength(1);
    expect(boundary.features[0].geometry.type).toBe('Polygon');
    expect(boundary.metadata).toMatchObject({
      boundary_available: true,
      boundary_role: 'selected_city_coverage_outline',
    });
  });

  it('keeps unsupported city ids empty instead of silently reusing Miami fallback data', async () => {
    const layers = await loadAllLayers('unknown-city');
    const statsIndex = buildParkingIndex('unknown-city', layers);

    expect(layers.facilities.features).toHaveLength(0);
    expect(layers.segments.features).toHaveLength(0);
    expect(layers.zones.features).toHaveLength(0);
    expect(layers.facilities.metadata).toMatchObject({
      cityId: 'unknown-city',
      data_status: 'unsupported',
      supported: false,
    });
    expect(statsIndex.metadata).toMatchObject({
      cityId: 'unknown-city',
      baseline_scope: [],
      data_status: 'unsupported',
      count: 0,
      layers: { facilities: 0, curb_segments: 0, parking_zones: 0 },
    });
  });

  it('exposes the NYC 1540 Broadway garage tariff evidence fixture without verified checkout links', async () => {
    const facilities = await loadFacilities('nyc');
    const matches = facilities.features.filter((feature) => {
      const text = `${feature.properties.name ?? ''} ${feature.properties.street ?? ''} ${feature.properties.operator ?? ''} ${feature.properties.source_id ?? ''}`.toLowerCase();
      return text.includes('1540') || text.includes('dock');
    });

    expect(matches).toHaveLength(1);
    expect(matches[0].properties).toMatchObject({
      city: 'New York City',
      state: 'NY',
      facility_type: 'garage',
      price_status: 'paid_unknown',
      tariff_review_status: 'pending_review',
      hourly_rate_status: 'unknown',
      daily_rate_status: 'unknown',
      taxes_status: 'unknown',
      fees_status: 'unknown',
      oversize_fee_status: 'unknown',
      reentry_policy_status: 'unknown',
      payment_url: '',
      booking_url: '',
    });
    expect(String(matches[0].properties.payment_note)).toContain('not promoted');
  });

  it('builds a canonical mixed-geometry index with enrichment status metadata', () => {
    const index = buildParkingIndex('miami', {
      facilities: collection([
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-80.13, 25.8] },
          properties: {
            source_name: 'OpenStreetMap via Geofabrik/osm2pgsql',
            source_id: 'osm:node:1',
            fee: 'unknown',
            confidence: 0.55,
          },
        },
      ]),
      segments: collection([
        {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [[-80.13, 25.8], [-80.131, 25.801]] },
          properties: {
            source_name: 'OpenStreetMap via Geofabrik/osm2pgsql',
            source_id: 'osm:way:2',
            raw_properties: { parking: 'street_side' },
            confidence: 0.62,
          },
        },
      ]),
      zones: collection([
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [[[-80.13, 25.8], [-80.131, 25.8], [-80.131, 25.801], [-80.13, 25.8]]],
          },
          properties: {
            source_name: 'City of Miami Beach Parking GIS',
            source_id: 'zone:3',
            charge: '2.00 USD/hour',
            opening_hours: 'Mo-Fr 09:00-18:00',
            source_url: 'https://example.com/parking-zones',
            payment_url: 'https://example.com/pay',
            raw_properties: { upstream_layer: 'parking_zones' },
            confidence: 0.9,
          },
        },
      ]),
    });

    expect(index.metadata).toMatchObject({
      cityId: 'miami',
      source: 'ParkingUSA Parking Index',
      primary_baseline_source: 'OpenStreetMap via Geofabrik/osm2pgsql',
      baseline_scope: ['Miami', 'Miami-Dade'],
      count: 3,
      layers: { facilities: 1, curb_segments: 1, parking_zones: 1 },
      price_known_count: 1,
      price_unknown_count: 2,
      needs_enrichment_count: 2,
    });

    expect(index.features.map((feature) => feature.properties.parkingusa_layer)).toEqual([
      'facility',
      'curb_segment',
      'parking_zone',
    ]);
    expect(index.features[0].properties).toMatchObject({
      existence_status: 'confirmed',
      price_status: 'known_unpriced',
      rule_status: 'unknown',
      enrichment_status: 'needs_source_url',
      needs_enrichment: true,
      canonical_source: 'ParkingUSA Parking Index',
    });
    expect(index.features[1].properties).toMatchObject({
      price_status: 'known_unpriced',
      rule_status: 'partial',
      enrichment_status: 'needs_source_url',
    });
    expect(index.features[2].properties).toMatchObject({
      price_status: 'known_priced',
      rule_status: 'known',
      enrichment_status: 'complete',
      needs_enrichment: false,
    });
  });

  it('does not classify N/A charge values as known prices', () => {
    const index = buildParkingIndex('miami', {
      facilities: collection([
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-80.13, 25.8] },
          properties: {
            source_name: 'City of Miami Beach Parking GIS',
            source_id: 'arcgis:lot:na-price',
            charge: 'N/A',
            confidence: 0.9,
          },
        },
      ]),
      segments: collection([]),
      zones: collection([]),
    });

    expect(index.metadata).toMatchObject({
      price_known_count: 0,
      price_unknown_count: 1,
      needs_enrichment_count: 1,
    });
    expect(index.features[0].properties).toMatchObject({
      price_status: 'known_unpriced',
      needs_enrichment: true,
    });
  });

  it('treats Miami Beach ArcGIS Parking Zones 172/386 as residential rule polygons, not parking places', () => {
    const feature = canonicalFeature(
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[[-80.132, 25.775], [-80.129, 25.775], [-80.129, 25.788], [-80.132, 25.775]]],
        },
        properties: {
          source_name: 'City of Miami Beach Parking GIS',
          source_id: 'miami-beach:arcgis:zones:172',
          name: 'Parking Zones 172',
          facility_type: 'parking_zone',
          access: 'public',
          price_status: 'known_unpriced',
          raw_properties: {
            OBJECTID: 162,
            ZONE_: 5,
            ZONE_TYPE: 2,
            RESTRICTED_RES_TIME: 4,
          },
          source_url: 'https://www.miamibeachfl.gov/city-hall/parking/',
          confidence: 0.9,
        },
      },
      'parking_zone',
    );

    expect(feature.properties).toMatchObject({
      name: 'Miami Beach Residential Zone-5',
      facility_type: 'residential_parking_zone',
      access: 'regulated_residential_zone',
      price_status: 'not_applicable',
      rule_status: 'partial',
      enrichment_status: 'needs_rules',
      source_confidence: 0.9,
      offer_confidence: 0.35,
      display_confidence: 0.35,
      confidence: 0.35,
      ordinary_parking_status: 'not_ordinary_parking_offer',
      availability_semantics: 'regulatory_or_residential_rule_evidence_only',
      zone_name: 'Zone-5',
      zone_type: 'Metered Residential Zone',
      restricted_res_time: '1st Come 1st Served',
      restrictions: 'Metered Residential Zone; 1st Come 1st Served',
    });
  });

  it('does not expose Miami Beach residential/regulatory zones as normal curb segments', async () => {
    const segments = await loadCurbSegments('miami');
    const residentialZoneSegments = segments.features.filter((feature) => {
      const name = String(feature.properties.name ?? '');
      const sourceId = String(feature.properties.source_id ?? '');
      return (
        name.includes('Residential Zone') ||
        sourceId.startsWith('miami-beach:arcgis:zones:') ||
        feature.properties.source_zone_type === 'residential_parking_zone'
      );
    });

    expect(residentialZoneSegments).toEqual([]);
  }, 45_000);

  it('does not expose long generated Miami Beach parking-space rows as normal curb segments', async () => {
    const segments = await loadCurbSegments('miami');
    const longGeneratedRows = segments.features
      .filter((feature) => {
        const sourceId = String(feature.properties.source_id ?? '');
        return sourceId.startsWith('parking-space-row:') && segmentLengthMeters(feature.geometry?.coordinates) > 150;
      })
      .map((feature) => ({
        source_id: feature.properties.source_id,
        name: feature.properties.name,
        length_m: Math.round(segmentLengthMeters(feature.geometry?.coordinates)),
        ordinary_parking_status: feature.properties.ordinary_parking_status,
      }));

    expect(longGeneratedRows).toEqual([]);
  }, 45_000);

  it('suppresses the parking-area-interior space row from Miami curb output', async () => {
    const segments = await loadCurbSegments('miami');
    const generatedRows = segments.features.filter((feature) => {
      const sourceId = String(feature.properties.source_id ?? '');
      return sourceId.startsWith('parking-space-row:') || sourceId.includes(':spaces:');
    });
    const statusCounts = generatedRows.reduce<Record<string, number>>((counts, feature) => {
      const status = String(feature.properties.geometry_quality_status ?? 'missing');
      counts[status] = (counts[status] ?? 0) + 1;
      return counts;
    }, {});

    expect(statusCounts).toEqual({ accepted: 1825, needs_field_review: 81 });
    expect(generatedRows.some((feature) => feature.properties.source_id === 'miami-beach:arcgis:spaces:4855')).toBe(false);
  }, 45_000);

  it('keeps curb metadata counts aligned with post-quality-filter features', async () => {
    const [miami, sanFrancisco] = await Promise.all([
      loadCurbSegments('miami'),
      loadCurbSegments('sf'),
    ]);

    expect(miami.metadata?.count).toBe(miami.features.length);
    expect(miami.metadata?.count).toBe(1_906);
    expect(sanFrancisco.metadata?.count).toBe(sanFrancisco.features.length);
    expect(sanFrancisco.metadata?.count).toBe(2_889);
  }, 45_000);

  it('renders polygon parking-space curbs as a single road-side line instead of rectangle outlines', () => {
    const feature = curbSegmentWithLineGeometry({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-80.1300, 25.7800],
          [-80.1300, 25.7810],
          [-80.1302, 25.7810],
          [-80.1302, 25.7800],
          [-80.1300, 25.7800],
        ]],
      },
      properties: {
        source_name: 'City of Miami Beach Parking GIS',
        source_id: 'miami-beach:arcgis:spaces:1401',
      },
    });

    expect(feature.geometry.type).toBe('LineString');
    expect(feature.geometry.coordinates).toHaveLength(2);
    expect(feature.properties).toMatchObject({
      source_geometry_type: 'Polygon',
      geometry_provenance: 'Line derived from polygon parking-space geometry for curb display.',
    });
  });

  it('derives visible curb lines from official parking-space points', () => {
    const features = deriveParkingSpacePointLines([
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-80.1300, 25.7800] },
        properties: {
          source_name: 'City of Miami Beach Parking GIS',
          source_id: 'miami-beach:arcgis:spaces:429',
          name: 'Parking Spaces 429',
          confidence: 0.9,
          ParkMobile: '88501',
        },
      },
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-80.1300, 25.7801] },
        properties: {
          source_name: 'City of Miami Beach Parking GIS',
          source_id: 'miami-beach:arcgis:spaces:2',
          name: 'Parking Spaces 2',
          ParkMobile: '88501',
        },
      },
    ]);

    expect(features).toHaveLength(1);
    expect(features[0].geometry.type).toBe('LineString');
    expect(features[0].geometry.coordinates).toHaveLength(2);
    expect(features[0].properties).toMatchObject({
      facility_type: 'curb_segment',
      meter_count: 2,
      source_geometry_type: 'PointCluster',
      source_confidence: 0.9,
      offer_confidence: 0.55,
      display_confidence: 0.55,
      confidence: 0.55,
      field_conflict_status: 'needs_field_review',
      field_payment_zone_location_id: '40208',
      enrichment_status: 'needs_review',
      geometry_provenance: 'Curb line centered on grouped official parking-space points and road-oriented without replacing their lateral position; parking-area interior points are excluded before line generation.',
    });
  });

  it('keeps official 88526 curb rows visible when residential rule polygons overlap them', async () => {
    const segments = await loadCurbSegments('miami');
    const zoneRows = segments.features.filter(
      (feature) => String(feature.properties.parkmobile_zone ?? feature.properties.ParkMobile) === '88526',
    );

    expect(zoneRows.length).toBeGreaterThan(8);
    expect(zoneRows.every((feature) => feature.geometry.type === 'LineString')).toBe(true);
  }, 30_000);

  it('preserves SF fallback counts and omits Miami curb labels from ordinary output', async () => {
    const [facilities, segments, zones] = await Promise.all([
      loadFacilities('sf'),
      loadCurbSegments('sf'),
      loadZones('sf'),
    ]);

    expect(facilities.features).toHaveLength(33_511);
    expect(segments.features).toHaveLength(2_889);
    expect(zones.features).toHaveLength(403);

    for (const feature of [...facilities.features, ...segments.features, ...zones.features]) {
      expect(feature.properties).not.toHaveProperty('curb_price_label');
    }
  }, 45_000);

  it('preserves safe fallback URL fields and omits unsafe URL values', () => {
    const index = buildParkingIndex('sf', {
      facilities: collection([
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-122.4, 37.78] },
          properties: {
            source_name: 'SFMTA Parking Meters',
            source_id: 'meter:safe-url',
            charge: '$2/hr',
            opening_hours: 'Mo-Fr 09:00-18:00',
            source_url: 'https://www.sfmta.com/',
            api_url: 'https://data.sfgov.org/resource/8vzz-qzz9.json',
            payment_url: 'https://www.sfmta.com/getting-around/drive-park',
            booking_url: null,
            evidence_url: 'https://data.sfgov.org/Transportation/Parking-Meters/8vzz-qzz9',
            confidence: 0.95,
          },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-122.41, 37.79] },
          properties: {
            source_name: 'Unsafe Source',
            source_id: 'meter:unsafe-url',
            charge: '$3/hr',
            opening_hours: 'Mo-Fr 09:00-18:00',
            source_url: 'javascript:alert(1)',
            payment_url: 'http://localhost:3000/pay',
            confidence: 0.95,
          },
        },
      ]),
      segments: collection([]),
      zones: collection([]),
    });

    expect(index.features[0].properties).toMatchObject({
      source_url: 'https://www.sfmta.com/',
      api_url: 'https://data.sfgov.org/resource/8vzz-qzz9.json',
      payment_url: 'https://www.sfmta.com/getting-around/drive-park',
      booking_url: '',
      evidence_url: 'https://data.sfgov.org/Transportation/Parking-Meters/8vzz-qzz9',
      price_status: 'known_priced',
      rule_status: 'known',
      enrichment_status: 'complete',
      needs_enrichment: false,
    });
    expect(index.features[1].properties).toMatchObject({
      source_url: '',
      payment_url: '',
      enrichment_status: 'needs_source_url',
      needs_enrichment: true,
    });
    expect(index.features[1].properties.source_url).not.toBe('javascript:alert(1)');
    expect(index.features[1].properties.payment_url).not.toBe('http://localhost:3000/pay');
    expect(index.features[1].properties.booking_url).not.toBe('undefined');
  });

  it('normalizes legacy known existence_status to confirmed', () => {
    const index = buildParkingIndex('sf', {
      facilities: collection([
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-122.4, 37.78] },
          properties: {
            source_name: 'Legacy Feed',
            source_id: 'legacy:known-existence',
            existence_status: 'known',
            source_url: 'https://example.com/source',
            payment_url: 'https://example.com/pay',
            price_status: 'known_priced',
            opening_hours: '9-5',
            confidence: 0.9,
          },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-122.41, 37.79] },
          properties: {
            source_name: 'Legacy Feed',
            source_id: 'legacy:known-no-price',
            existence_status: 'known',
            source_url: 'https://example.com/source',
            opening_hours: '9-5',
            confidence: 0.9,
          },
        },
      ]),
      segments: collection([]),
      zones: collection([]),
    });

    expect(index.features[0].properties).toMatchObject({
      existence_status: 'confirmed',
      price_status: 'known_priced',
      enrichment_status: 'complete',
      needs_enrichment: false,
    });
    expect(index.features[1].properties).toMatchObject({
      existence_status: 'confirmed',
      price_status: 'known_unpriced',
      enrichment_status: 'needs_price',
      needs_enrichment: true,
    });
  });

  it('preserves safe camelCase fallback URL fields as snake_case public keys', () => {
    const index = buildParkingIndex('sf', {
      facilities: collection([
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-122.4, 37.78] },
          properties: {
            source_name: 'SFMTA Parking Meters',
            source_id: 'meter:camel-url',
            charge: '$2/hr',
            opening_hours: 'Mo-Fr 09:00-18:00',
            sourceUrl: 'https://www.sfmta.com/meters',
            apiUrl: 'https://data.sfgov.org/resource/8vzz-qzz9.json',
            paymentUrl: 'https://www.sfmta.com/pay',
            bookingUrl: 'https://www.sfmta.com/book',
            evidenceUrl: 'https://data.sfgov.org/dataset/parking',
            confidence: 0.95,
          },
        },
      ]),
      segments: collection([]),
      zones: collection([]),
    });

    expect(index.features[0].properties).toMatchObject({
      source_url: 'https://www.sfmta.com/meters',
      api_url: 'https://data.sfgov.org/resource/8vzz-qzz9.json',
      payment_url: 'https://www.sfmta.com/pay',
      booking_url: 'https://www.sfmta.com/book',
      evidence_url: 'https://data.sfgov.org/dataset/parking',
    });
  });

  it('adds official Miami Beach payment provider evidence without inventing checkout URLs', () => {
    const result = canonicalFeature(
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-80.134, 25.766] },
        properties: {
          source_name: 'City of Miami Beach Parking Facilities',
          source_id: 'miami-beach:wpgmza:139',
          city: 'Miami Beach',
          charge: '$2/hr',
          parkmobile_zone: '88602',
          payment_app_url: 'https://www2.paybyphone.com/park-in-miami-beach',
          source_url: 'https://www.miamibeachfl.gov/city-hall/parking/parking-garages-lot-locations/',
          evidence_url: 'https://www.miamibeachfl.gov/wp-json/wpgmza/v1/markers?map_id=17',
          confidence: 0.88,
        },
      },
      'facility',
    );

    expect(result.properties).toMatchObject({
      parkmobile_zone: '88602',
      payment_provider: 'ParkMobile / PayByPhone',
      payment_app_url: 'https://www.paybyphone.com/park-in-miami-beach',
      payment_url: '',
      price_status: 'known_priced',
    });
    expect(String(result.properties.payment_note)).toContain('does not infer a per-record checkout URL');
  });

  it('keeps raw_properties-only rules partial instead of known', () => {
    const index = buildParkingIndex('sf', {
      facilities: collection([]),
      segments: collection([
        {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [[-122.4, 37.78], [-122.41, 37.79]] },
          properties: {
            source_name: 'OSM',
            source_id: 'way:raw-rules',
            source_url: 'https://www.openstreetmap.org/way/1',
            raw_properties: { parking: 'street_side' },
            confidence: 0.9,
          },
        },
      ]),
      zones: collection([]),
    });

    expect(index.features[0].properties).toMatchObject({
      rule_status: 'partial',
    });
    expect(index.features[0].properties.rule_status).not.toBe('known');
  });

  it('matches DB-style mapped and fallback public contract keys for each layer', () => {
    const publicKeys = [
      'source_url',
      'api_url',
      'payment_url',
      'booking_url',
      'evidence_url',
      'existence_status',
      'price_status',
      'rule_status',
      'enrichment_status',
      'needs_enrichment',
      'city',
      'state',
    ];
    const facilityRow: FacilityDbRow = {
      sourceId: 'facility:1',
      sourceName: 'City Facility Feed',
      geojson: { type: 'Point', coordinates: [-122.4, 37.78] },
      rawProperties: { upstream: 'facility' },
      confidence: 0.91,
      lastVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
      dataAsOf: new Date('2026-01-02T00:00:00.000Z'),
      sourceUrl: 'https://example.com/facilities',
      apiUrl: 'https://example.com/api/facilities',
      paymentUrl: 'https://example.com/pay',
      bookingUrl: 'https://example.com/book',
      evidenceUrl: 'https://example.com/evidence',
      priceStatus: 'known_priced',
      ruleStatus: 'known',
      enrichmentStatus: 'complete',
      city: 'San Francisco',
      state: 'CA',
      name: 'Garage A',
      facilityType: 'garage',
      fee: 'yes',
      charge: '$4/hr',
      baseHourlyRate: 4,
      operator: 'City',
      access: 'public',
      capacity: '100',
      openingHours: '24/7',
      street: 'Market St',
      blockfaceId: '1000',
      neighborhood: 'Downtown',
      meterType: null,
      capColor: null,
    };
    const segmentRow: CurbSegmentDbRow = {
      sourceId: 'segment:1',
      sourceName: 'City Curb Feed',
      geojson: { type: 'LineString', coordinates: [[-122.4, 37.78], [-122.41, 37.79]] },
      rawProperties: { city: 'San Francisco', state: 'CA', source_url: 'https://example.com/curbs-raw' },
      confidence: 0.8,
      sourceUrl: null,
      apiUrl: 'https://example.com/api/curbs',
      paymentUrl: null,
      bookingUrl: null,
      evidenceUrl: 'https://example.com/curb-evidence',
      priceStatus: null,
      ruleStatus: null,
      enrichmentStatus: null,
      city: null,
      state: null,
      blockfaceId: '2000',
      meterCount: 12,
      streetSample: 'Mission St',
      neighborhood: 'Mission',
      baseHourlyRateMin: 1,
      baseHourlyRateMax: 3,
      charge: '$1-$3/hr',
    };
    const zoneRow: ParkingZoneDbRow = {
      sourceId: 'zone:1',
      sourceName: 'City Zone Feed',
      geojson: { type: 'Polygon', coordinates: [[[-122.4, 37.78], [-122.41, 37.78], [-122.41, 37.79], [-122.4, 37.78]]] },
      rawProperties: { upstream: 'zones' },
      confidence: 0.88,
      sourceUrl: 'https://example.com/zones',
      apiUrl: 'https://example.com/api/zones',
      paymentUrl: 'https://example.com/zone-pay',
      bookingUrl: null,
      evidenceUrl: 'https://example.com/zone-evidence',
      priceStatus: 'known_free',
      ruleStatus: 'known',
      enrichmentStatus: 'complete',
      city: 'San Francisco',
      state: 'CA',
      name: 'Zone A',
      facilityType: 'zone',
      operator: 'City',
      access: 'public',
      fee: 'free',
      charge: 'free',
      capacity: null,
      openingHours: '24/7',
      website: 'https://example.com/zones/info',
    };
    const dbFeatures = [
      facilityFeatureFromDbRow(facilityRow),
      curbSegmentFeatureFromDbRow(segmentRow),
      parkingZoneFeatureFromDbRow(zoneRow),
    ];
    const fallbackIndex = buildParkingIndex('sf', {
      facilities: collection([{ ...dbFeatures[0], properties: { ...dbFeatures[0].properties, source_id: 'fallback:facility' } }]),
      segments: collection([{ ...dbFeatures[1], properties: { ...dbFeatures[1].properties, source_id: 'fallback:segment' } }]),
      zones: collection([{ ...dbFeatures[2], properties: { ...dbFeatures[2].properties, source_id: 'fallback:zone' } }]),
    });

    for (const feature of [...dbFeatures, ...fallbackIndex.features]) {
      for (const key of publicKeys) {
        expect(feature.properties).toHaveProperty(key);
      }
    }
    expect(dbFeatures[1].properties).toMatchObject({
      existence_status: 'confirmed',
      city: 'San Francisco',
      state: 'CA',
      source_url: 'https://example.com/curbs-raw',
    });
    expect(dbFeatures[1].properties.source_url).not.toBe('undefined');
  });

  it('produces canonical features with all required public provenance and status keys for each layer type', () => {
    const publicKeys: string[] = [
      'source_url',
      'api_url',
      'payment_url',
      'booking_url',
      'evidence_url',
      'existence_status',
      'price_status',
      'rule_status',
      'enrichment_status',
      'needs_enrichment',
      'parkingusa_id',
      'parkingusa_layer',
      'canonical_source',
    ];

    const testCases: { layer: 'facility' | 'curb_segment' | 'parking_zone'; feature: GeoJSONCollection['features'][0] }[] = [
      {
        layer: 'facility',
        feature: {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-80.13, 25.8] },
          properties: {
            source_name: 'Test Facility Source',
            source_id: 'test:facility:1',
            charge: '$2/hr',
            opening_hours: 'Mo-Fr 09:00-18:00',
            source_url: 'https://example.com/facility-source',
            payment_url: 'https://example.com/facility-pay',
            confidence: 0.9,
          },
        },
      },
      {
        layer: 'curb_segment',
        feature: {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [[-80.13, 25.8], [-80.131, 25.801]] },
          properties: {
            source_name: 'Test Curb Source',
            source_id: 'test:curb:1',
            source_url: 'https://example.com/curb-source',
            confidence: 0.8,
          },
        },
      },
      {
        layer: 'parking_zone',
        feature: {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [[[-80.13, 25.8], [-80.131, 25.8], [-80.131, 25.801], [-80.13, 25.8]]] },
          properties: {
            source_name: 'Test Zone Source',
            source_id: 'test:zone:1',
            charge: 'free',
            source_url: 'https://example.com/zone-source',
            evidence_url: 'https://example.com/zone-evidence',
          },
        },
      },
    ];

    for (const { layer, feature } of testCases) {
      const result = canonicalFeature(feature, layer);

      for (const key of publicKeys) {
        expect(result.properties).toHaveProperty(key);
      }

      // Validate specific canonical values
      expect(result.properties).toMatchObject({
        parkingusa_layer: layer,
        canonical_source: 'ParkingUSA Parking Index',
      });

      // Source URL must be a string (safe or empty)
      expect(typeof result.properties.source_url).toBe('string');
      // price_status must be a valid string
      expect(typeof result.properties.price_status).toBe('string');
      // rule_status must be a valid string
      expect(typeof result.properties.rule_status).toBe('string');
      // enrichment_status must be a valid string
      expect(typeof result.properties.enrichment_status).toBe('string');
      // needs_enrichment must be a boolean
      expect(typeof result.properties.needs_enrichment).toBe('boolean');
      // existence_status must be a valid string
      expect(typeof result.properties.existence_status).toBe('string');
      // parkingusa_id must start with parkingusa: prefix
      expect(result.properties.parkingusa_id).toMatch(/^parkingusa:/);
    }
  });

  it('public canonical features from buildParkingIndex include expected provenance and status keys', () => {
    const layerKeys: string[] = [
      'source_url',
      'api_url',
      'payment_url',
      'booking_url',
      'evidence_url',
      'existence_status',
      'price_status',
      'rule_status',
      'enrichment_status',
      'needs_enrichment',
    ];

    const index = buildParkingIndex('miami', {
      facilities: collection([
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-80.13, 25.8] },
          properties: {
            source_name: 'Test',
            source_id: 'test:idx:facility',
            charge: '$3/hr',
            opening_hours: '9-5',
            source_url: 'https://example.com/src',
            payment_url: 'https://example.com/pay',
            confidence: 0.9,
          },
        },
      ]),
      segments: collection([
        {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [[-80.13, 25.8], [-80.131, 25.801]] },
          properties: {
            source_name: 'Test',
            source_id: 'test:idx:segment',
            source_url: 'https://example.com/seg',
            confidence: 0.8,
          },
        },
      ]),
      zones: collection([
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [[[-80.13, 25.8], [-80.131, 25.8], [-80.131, 25.801], [-80.13, 25.8]]] },
          properties: {
            source_name: 'Test',
            source_id: 'test:idx:zone',
            source_url: 'https://example.com/zone',
            evidence_url: 'https://example.com/zone-evidence',
            confidence: 0.85,
          },
        },
      ]),
    });

    for (const feature of index.features) {
      for (const key of layerKeys) {
        expect(feature.properties).toHaveProperty(key);
      }
      expect(typeof feature.properties.price_status).toBe('string');
      expect(typeof feature.properties.rule_status).toBe('string');
      expect(typeof feature.properties.enrichment_status).toBe('string');
      expect(typeof feature.properties.needs_enrichment).toBe('boolean');
      expect(typeof feature.properties.source_url).toBe('string');
    }

    // The known-priced facility should have price_status known_priced
    expect(index.features[0].properties.price_status).toBe('known_priced');
    // The segment without price and with confirmed status should be known_unpriced
    expect(index.features[1].properties.price_status).toBe('known_unpriced');
    // The zone with no price info but source_url should be known_unpriced
    expect(index.features[2].properties.price_status).toBe('known_unpriced');
    // zone has explicit evidence_url
    expect(index.features[2].properties.evidence_url).toBe('https://example.com/zone-evidence');
  });
});

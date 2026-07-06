import { describe, expect, it } from 'vitest';
import {
  arcgisQueryUrl,
  arcgisRecordId,
  buildArcgisSourceConfig,
  buildCkanSourceConfig,
  buildConnectorReport,
  buildSocrataSourceConfig,
  ckanRecordId,
  normalizeArcgisFeature,
  normalizeCkanPackageRecord,
  normalizeConnectorRecord,
  normalizeSocrataRecord,
  safePublicUrl,
  socrataPageUrl,
  socrataRecordId,
  stableHash,
} from '../../apps/backend/scripts/connector_foundation';
import {
  miamiBeachSouthBeachFieldObservations,
  normalizeMiamiBeachArcgisCanonical,
  type MiamiBeachArcgisLayerInput,
} from '../../apps/backend/scripts/miami_beach_arcgis_canonical';
import {
  buildPremiumReport,
  classifyPremiumLink,
  normalizePremiumMarket,
} from '../../apps/backend/scripts/run_premium_enrichment';

describe('connector foundation', () => {
  it('keeps dry-run insert/update counts at zero while reporting normalized records', () => {
    const source = buildSocrataSourceConfig({
      sourceName: 'DataSF Parking Meters',
      sourceUrl: 'https://data.sfgov.org/Transportation/Parking-Meters/8vzz-qzz9',
      apiUrl: 'https://data.sfgov.org/resource/8vzz-qzz9.json',
    });
    const record = normalizeSocrataRecord(source, { ':id': 'row-1', rate: '$2/hour' }, source.apiUrl!);
    const report = buildConnectorReport({
      connectorKey: 'socrata',
      dryRun: true,
      importRequested: false,
      source,
      records: [record],
      recordsSeen: 1,
      totalAvailable: 10,
      limit: 1,
      pagesFetched: 1,
    });

    expect(report.dry_run).toBe(true);
    expect(report.counts.records_inserted).toBe(0);
    expect(report.counts.records_updated).toBe(0);
    expect(report.counts.records_normalized).toBe(1);
  });

  it('normalizes provenance fields even when optional URLs are null', () => {
    const source = buildArcgisSourceConfig({
      sourceName: 'Official ArcGIS',
      sourceUrl: 'https://example.com/layer',
      apiUrl: 'https://example.com/FeatureServer/0/query',
    });
    const record = normalizeConnectorRecord({
      source: { ...source, paymentUrl: null, bookingUrl: null },
      sourceId: 'arcgis:test:objectid:1',
      apiUrl: source.apiUrl,
      evidenceUrl: null,
      priceStatus: 'unknown',
      ruleStatus: 'unknown',
      lastVerifiedAt: '2026-06-15T00:00:00.000Z',
      dataAsOf: null,
      rawProperties: { OBJECTID: 1 },
    });

    expect(record).toMatchObject({
      source_name: 'Official ArcGIS',
      source_id: 'arcgis:test:objectid:1',
      source_url: 'https://example.com/layer',
      api_url: 'https://example.com/FeatureServer/0/query',
      evidence_url: null,
      payment_url: null,
      booking_url: null,
      price_status: 'unknown',
      rule_status: 'unknown',
      data_as_of: null,
      raw_properties: { OBJECTID: 1 },
    });
  });

  it('sanitizes unsafe URLs before they enter connector records', () => {
    const source = buildCkanSourceConfig({
      sourceName: 'CKAN',
      sourceUrl: 'javascript:alert(1)',
      apiUrl: 'http://localhost/api/3/action/package_search',
    });
    const record = normalizeConnectorRecord({
      source,
      sourceId: 'ckan:test',
      apiUrl: source.apiUrl,
      evidenceUrl: 'file:///tmp/evidence.html',
      priceStatus: 'unknown',
      ruleStatus: 'unknown',
      lastVerifiedAt: null,
      dataAsOf: null,
      rawProperties: {},
    });

    expect(safePublicUrl('https://catalog.data.gov')).toBe('https://catalog.data.gov/');
    expect(record.source_url).toBeNull();
    expect(record.api_url).toBeNull();
    expect(record.evidence_url).toBeNull();
  });

  it('declares stable pagination and source id strategies for all connector types', () => {
    const socrata = buildSocrataSourceConfig({ sourceUrl: 'https://data.example/d', apiUrl: 'https://data.example/resource/abcd-1234.json' });
    const arcgis = buildArcgisSourceConfig({ sourceUrl: 'https://gis.example/FeatureServer/0', apiUrl: 'https://gis.example/FeatureServer/0/query' });
    const ckan = buildCkanSourceConfig({ sourceUrl: 'https://catalog.data.gov', apiUrl: 'https://catalog.data.gov/api/3/action/package_search?q=parking' });

    expect(socrata.paginationPath).toContain('$limit');
    expect(socrata.stableSourceIdStrategy).toContain(':id');
    expect(arcgis.paginationPath).toContain('resultOffset');
    expect(arcgis.stableSourceIdStrategy).toContain('OBJECTID');
    expect(ckan.paginationPath).toContain('package_search');
    expect(ckan.stableSourceIdStrategy).toContain('dataset name plus resource id');
    expect([socrata, arcgis, ckan].every((source) => source.idempotentUpsertKey.includes('sourceName, sourceId'))).toBe(true);
  });

  it('uses documented source-specific stable identifiers', () => {
    expect(socrataRecordId({ ':id': 'abc123' }, '8vzz-qzz9')).toBe('socrata:8vzz-qzz9:abc123');
    expect(arcgisRecordId({ OBJECTID: 42 }, 'miami-beach')).toBe('arcgis:miami-beach:objectid:42');
    expect(arcgisRecordId({ GlobalID: '{A}' }, 'miami-beach')).toBe('arcgis:miami-beach:globalid:{A}');
    expect(ckanRecordId({ name: 'parking-dataset' }, { id: 'resource-1' })).toBe('ckan:parking-dataset:resource-1');
  });

  it('builds bounded page URLs with stable ordering', () => {
    expect(decodeURIComponent(socrataPageUrl('https://data.example/resource/abcd-1234.json', 2, 4))).toContain('$order=:id');
    const arcgisUrl = arcgisQueryUrl('https://gis.example/FeatureServer/0/query', 2, 4, 'OBJECTID');
    expect(arcgisUrl).toContain('resultRecordCount=2');
    expect(arcgisUrl).toContain('resultOffset=4');
    expect(arcgisUrl).toContain('orderByFields=OBJECTID+ASC');
  });

  it('normalizes ArcGIS and CKAN fixture records with upsert keys', () => {
    const arcgisSource = buildArcgisSourceConfig({
      sourceName: 'City of Miami Beach Parking GIS',
      sourceUrl: 'https://gis.miamibeachfl.gov/public/rest/services/mb/Parking/FeatureServer',
      apiUrl: 'https://gis.miamibeachfl.gov/public/rest/services/mb/Parking/FeatureServer/1/query',
    });
    const arcgisRecord = normalizeArcgisFeature(arcgisSource, { attributes: { OBJECTID: 7, HOURLY_RATE: '$4/hour' } }, arcgisSource.apiUrl!);
    expect(arcgisRecord.source_id).toContain('objectid:7');
    expect(arcgisRecord.price_status).toBe('known_priced');
    expect(arcgisRecord.upsert_key.unique).toBe('sourceName_sourceId_entityType');

    const ckanSource = buildCkanSourceConfig({
      sourceName: 'Data.gov parking CKAN',
      sourceUrl: 'https://catalog.data.gov',
      apiUrl: 'https://catalog.data.gov/api/3/action/package_search?q=parking',
    });
    const ckanRecord = normalizeCkanPackageRecord(
      ckanSource,
      'https://catalog.data.gov',
      { name: 'parking', metadata_modified: '2026-06-01T00:00:00Z' },
      { id: 'resource-a', format: 'CSV' },
      ckanSource.apiUrl!,
    );
    expect(ckanRecord.source_id).toBe('ckan:parking:resource-a');
    expect(ckanRecord.data_as_of).toBe('2026-06-01T00:00:00.000Z');
    expect(ckanRecord.upsert_key.sourceName).toBe('Data.gov parking CKAN');
  });

  it('builds a Socrata dry-run probe record with required fields and zero mutation counts', () => {
    const sourceUrl = 'https://data.sfgov.org/Transportation/Parking-Meters/8vzz-qzz9';
    const apiUrl = 'https://data.sfgov.org/resource/8vzz-qzz9.json';
    const limit = 2;
    const offset = 0;
    const warning = 'Socrata source unavailable during dry-run: TypeError: fetch failed';
    const source = buildSocrataSourceConfig({
      sourceName: 'DataSF Parking Meters connector dry-run',
      sourceKey: 'datasf-parking-meters-socrata-connector',
      sourceUrl,
      apiUrl,
      metadataUrl: 'https://data.sfgov.org/api/views/8vzz-qzz9',
    });
    const pageUrl = socrataPageUrl(apiUrl, limit, offset);
    const record = normalizeConnectorRecord({
      source,
      sourceId: `socrata:connector-probe:${stableHash({ apiUrl, sourceUrl, offset, limit })}`,
      apiUrl: pageUrl,
      evidenceUrl: sourceUrl,
      priceStatus: 'unknown',
      ruleStatus: 'unknown',
      lastVerifiedAt: '2026-06-15T00:00:00.000Z',
      dataAsOf: null,
      rawProperties: {
        connector_probe: true,
        attempted_count_url: 'https://data.sfgov.org/resource/8vzz-qzz9.json?%24select=count%28*%29',
        attempted_page_url: pageUrl,
        warning,
      },
    });
    const report = buildConnectorReport({
      connectorKey: 'socrata',
      dryRun: true,
      importRequested: false,
      source,
      records: [record],
      recordsSeen: 1,
      totalAvailable: null,
      limit,
      pagesFetched: 1,
      warnings: ['Dry-run mode: no DB mutation; records_inserted and records_updated remain 0.', warning],
    });

    expect(record.source_id).toBe(`socrata:connector-probe:${stableHash({ apiUrl, sourceUrl, offset, limit })}`);
    expect(record).toMatchObject({
      source_name: 'DataSF Parking Meters connector dry-run',
      source_url: sourceUrl,
      api_url: pageUrl,
      evidence_url: sourceUrl,
      payment_url: null,
      booking_url: null,
      price_status: 'unknown',
      rule_status: 'unknown',
      data_as_of: null,
      raw_properties: {
        connector_probe: true,
        attempted_page_url: pageUrl,
        warning,
      },
    });
    expect(report.counts.records_inserted).toBe(0);
    expect(report.counts.records_updated).toBe(0);
    expect(report.counts.records_normalized).toBe(1);
    expect(report.warnings).toContain(warning);
  });

  it('routes Miami Beach ArcGIS layers into canonical facilities and zones while excluding spaces', () => {
    const source = buildArcgisSourceConfig({
      sourceName: 'City of Miami Beach Parking GIS',
      sourceKey: 'miami-beach-parking-arcgis',
      sourceUrl: 'https://www.miamibeachfl.gov/city-hall/parking/',
      apiUrl: 'https://gis.miamibeachfl.gov/public/rest/services/mb/Parking/FeatureServer/1/query',
      city: 'Miami Beach',
      state: 'FL',
    });
    const layers: MiamiBeachArcgisLayerInput[] = [
      {
        key: 'meters',
        name: 'Parking Meters',
        apiUrl: 'https://gis.miamibeachfl.gov/public/rest/services/mb/Parking/FeatureServer/1/query?f=geojson',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [-80.13, 25.79] },
            properties: { OBJECTID: 1, NUMBER: 'MB-1', ZONE: '88602', RATE: '$4/hour' },
          },
        ],
      },
      {
        key: 'spaces',
        name: 'Parking Spaces',
        apiUrl: 'https://gis.miamibeachfl.gov/public/rest/services/mb/Parking/FeatureServer/3/query?f=geojson',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [-80.14, 25.78] },
            properties: { OBJECTID: 2 },
          },
        ],
      },
      {
        key: 'lots',
        name: 'Parking Lots',
        apiUrl: 'https://gis.miamibeachfl.gov/public/rest/services/mb/Parking/FeatureServer/5/query?f=geojson',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [[[-80.1, 25.7], [-80.09, 25.7], [-80.09, 25.71], [-80.1, 25.7]]] },
            properties: { OBJECTID: 3, NAME: 'Lot A', HOURLY_RATE: '$2/hour', ParkMobile: '88603', SPACES: 40 },
          },
        ],
      },
      {
        key: 'zones',
        name: 'Parking Zones',
        apiUrl: 'https://gis.miamibeachfl.gov/public/rest/services/mb/Parking/FeatureServer/7/query?f=geojson',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [[[-80.2, 25.8], [-80.19, 25.8], [-80.19, 25.81], [-80.2, 25.8]]] },
            properties: { OBJECTID: 4, ZONE_: 5, ZONE_TYPE: 2, RESTRICTED_RES_TIME: 4 },
          },
          {
            type: 'Feature',
            geometry: null,
            properties: { OBJECTID: 5, PARKING_ZONE: 'Null Geometry Zone' },
          },
        ],
      },
    ];

    const canonical = normalizeMiamiBeachArcgisCanonical(source, layers, new Date('2026-06-15T00:00:00.000Z'));

    expect(canonical.inputFeaturesSeen).toBe(5);
    expect(canonical.canonicalRowsPlanned).toBe(4);
    expect(canonical.facilities).toHaveLength(2);
    expect(canonical.zones).toHaveLength(2);
    expect(canonical.observations).toHaveLength(2);
    expect(canonical.skipped).toEqual({
      nonCanonicalSpaces: 1,
      invalidFacilities: 0,
      nullGeometryZones: 1,
    });
    expect(canonical.facilities.map((facility) => facility.sourceId)).toEqual([
      'miami-beach:arcgis:meter:1',
      'miami-beach:arcgis:lot:3',
    ]);
    expect(canonical.zones.map((zone) => zone.sourceId)).toEqual([
      'miami-beach:arcgis:lots:3',
      'miami-beach:arcgis:zones:4',
    ]);
    expect(canonical.facilities[0]).toMatchObject({
      sourceName: 'City of Miami Beach Parking GIS',
      facilityType: 'street_meter',
      city: 'Miami Beach',
      state: 'FL',
      confidence: 0.5,
      sourceConfidence: 0.9,
      offerConfidence: 0.5,
      displayConfidence: 0.5,
      priceStatus: 'paid_unknown',
      ruleStatus: 'partial',
      dataAsOf: null,
      paymentUrl: null,
      bookingUrl: null,
    });
    expect(canonical.facilities[0].rawProperties).toMatchObject({
      parkmobile_zone: '88602',
      payment_provider: 'ParkMobile / PayByPhone',
      payment_url: '',
      booking_url: '',
      source_confidence: 0.9,
      offer_confidence: 0.5,
      display_confidence: 0.5,
      ordinary_parking_status: 'payment_equipment_evidence_only',
    });
    expect(canonical.zones[0]).toMatchObject({
      sourceName: 'City of Miami Beach Parking GIS',
      facilityType: 'surface_lot',
      priceStatus: 'known_priced',
      enrichmentStatus: 'needs_payment_link',
    });
    expect(canonical.zones[1]).toMatchObject({
      sourceName: 'City of Miami Beach Parking GIS',
      facilityType: 'residential_parking_zone',
      access: 'regulated_residential_zone',
      fee: 'not_applicable',
      charge: null,
      confidence: 0.35,
      sourceConfidence: 0.9,
      offerConfidence: 0.35,
      displayConfidence: 0.35,
      priceStatus: 'not_applicable',
      ruleStatus: 'partial',
      enrichmentStatus: 'needs_rules',
    });
    expect(canonical.zones[1].rawProperties).toMatchObject({
      zone_name: 'Zone-5',
      zone_type: 'Metered Residential Zone',
      restricted_res_time: '1st Come 1st Served',
      ordinary_parking_status: 'not_ordinary_parking_offer',
      availability_semantics: 'regulatory_or_residential_rule_evidence_only',
    });
    expect(canonical.observations.map((observation) => observation.sourceId)).toContain('dev-47:field-feedback:south-beach:zone-location-id:40208');
    expect(miamiBeachSouthBeachFieldObservations('City of Miami Beach Parking GIS', new Date('2026-07-03T00:00:00.000Z'))[0]).toMatchObject({
      entityType: 'field_conflict_observation',
      status: 'conflict_evidence',
      confidence: 0.75,
    });
  });

  it('classifies Premium operator links without promoting facility pages to payment URLs', () => {
    expect(classifyPremiumLink('https://www.premiumparking.com/city/miami/p021')).toBe('facility_page');
    expect(classifyPremiumLink('https://www.premiumparking.com/city/miami')).toBe('operator_search');
    expect(classifyPremiumLink('https://checkout.example.test/reserve/p021')).toBe('direct_checkout');
    expect(classifyPremiumLink('javascript:alert(1)')).toBe('unsafe_or_unknown');
  });

  it('normalizes Premium browser-captured venue data as SourceObservation candidates only', () => {
    const records = normalizePremiumMarket({
      id: 9,
      name: 'Miami',
      slug: 'miami',
      latitude: 25.7617,
      longitude: -80.1918,
      venues: [
        { id: 21, name: 'P021', address: '100 SE 2nd St', slug: 'p021', description: 'Daily parking' },
      ],
      venue_groups: [
        {
          id: 1,
          title: 'Downtown Miami',
          venues: [
            { id: 196, name: 'P196', address: '200 Biscayne Blvd', slug: 'p196' },
            { id: 21, name: 'P021 duplicate', address: '100 SE 2nd St', slug: 'p021' },
          ],
        },
      ],
    }, new Date('2026-06-17T00:00:00.000Z'));

    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      source_name: 'Premium Parking Miami public operator site',
      source_id: 'premium:miami:venue:p021',
      entity_type: 'operator_facility_observation',
      candidate_url: 'https://www.premiumparking.com/city/miami/p021',
      link_classification: 'facility_page',
      payment_url: null,
      booking_url: null,
      status: 'parser_observation',
    });

    const report = buildPremiumReport({ records, dryRun: true, importRequested: false, generatedAt: new Date('2026-06-17T00:00:00.000Z') });
    expect(report.counts.records_normalized).toBe(2);
    expect(report.counts.records_inserted).toBe(0);
    expect(report.source.legal_risk).toBe('medium_tos_review');
  });
});

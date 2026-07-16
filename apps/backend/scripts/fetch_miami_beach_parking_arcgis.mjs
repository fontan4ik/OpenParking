import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentSnapshotTimestamp } from './refresh_snapshot.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..', '..');

const SOURCE_URL = 'https://gis.miamibeachfl.gov/public/rest/services/mb/Parking/FeatureServer';
const SOURCE_PAGE = 'https://www.miamibeachfl.gov/city-hall/parking/';
const DATA_AS_OF = currentSnapshotTimestamp();
const SOURCE_NAME = 'City of Miami Beach Parking GIS';
const MIAMI_BEACH_PAYMENT_PROVIDER = 'ParkMobile / PayByPhone';
const MIAMI_BEACH_PAYMENT_APP_URL = 'https://www2.paybyphone.com/park-in-miami-beach';
const MIAMI_BEACH_PAYMENT_NOTE =
  'Official Miami Beach source lists ParkMobile zones and PayByPhone/ParkMobile app support; ParkingUSA does not infer a per-record checkout URL.';
const USER_AGENT = 'ParkingUSA ArcGIS parking import (local prototype)';
const PAGE_SIZE = 1000;
const MAX_PAGES = 100;
const MAX_FETCH_ATTEMPTS = 3;
const FETCH_RETRY_DELAY_MS = 1000;
const MIAMI_BEACH_RESIDENTIAL_ZONE_NAMES = {
  0: 'Unknown',
  1: 'Zone 1 South Pointe',
  2: 'Zone-2',
  3: 'Zone-3',
  4: 'Zone-4',
  5: 'Zone-5',
  6: 'Zone-6',
  7: 'Zone-7',
  8: 'Zone-8',
  9: 'Zone-9',
  10: 'Zone-10',
  11: 'Zone-11',
  12: 'Zone-12',
  13: 'Zone-13',
  14: 'Zone-14',
  15: 'Zone-15',
  16: 'Zone-16',
  17: 'Zone-17',
  18: 'Zone-19',
  19: 'Zone-20',
  20: 'Zone-21',
  21: 'Zone-22',
  22: 'Zone-23',
  23: 'Zone 1A Ocean Drive',
  24: 'Zone 2 & 3',
  25: 'Other',
};
const MIAMI_BEACH_RESIDENTIAL_ZONE_TYPES = {
  0: 'Unknown',
  1: 'Restricted Residential Zone',
  2: 'Metered Residential Zone',
  3: 'No Street Parking Available',
  4: 'Off-Street Residential Parking',
  5: '2hr Parking / RPP Permit Exempt',
  6: '1hr Parking / RPP Permit Exempt',
  7: '3hr Parking 9am-10pm / RPP 10pm-9am',
  8: 'Other',
  9: '3hr Parking / RPP Permit Exempt',
};
const MIAMI_BEACH_RESTRICTED_TIMES = {
  1: '6pm-7am Mon-Fri & 24hrs Sat-Sun/Holidays',
  2: '24 hrs Mon-Sun',
  3: '6pm-6am Mon-Fri & 24hrs Sat-Sun/Holidays',
  4: '1st Come 1st Served',
  5: '10pm-9am Mon-Sun 24hrs',
  6: 'Other',
  7: '11pm-6am Mon-Sun',
};

const LAYERS = [
  { id: 1, key: 'meters', name: 'Parking Meters', output: 'miami_beach_parking_arcgis_meters.geojson' },
  { id: 3, key: 'spaces', name: 'Parking Spaces', output: 'miami_beach_parking_arcgis_spaces.geojson' },
  { id: 5, key: 'lots', name: 'Parking Lots', output: 'miami_beach_parking_arcgis_lots.geojson' },
  { id: 7, key: 'zones', name: 'Parking Zones', output: 'miami_beach_parking_arcgis_zones.geojson' },
];

function queryUrl(layerId, offset = 0) {
  const url = new URL(`${SOURCE_URL}/${layerId}/query`);
  url.searchParams.set('where', '1=1');
  url.searchParams.set('outFields', '*');
  url.searchParams.set('f', 'geojson');
  url.searchParams.set('outSR', '4326');
  url.searchParams.set('resultRecordCount', String(PAGE_SIZE));
  url.searchParams.set('resultOffset', String(offset));
  return url.toString();
}

async function fetchGeoJsonPage(layer, offset) {
  const url = queryUrl(layer.id, offset);
  let response;
  let lastError;

  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt += 1) {
    try {
      response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/geo+json, application/json',
        },
      });
      break;
    } catch (error) {
      lastError = error;
      if (attempt === MAX_FETCH_ATTEMPTS) break;
      await new Promise((resolve) => setTimeout(resolve, FETCH_RETRY_DELAY_MS * attempt));
    }
  }

  if (!response) {
    throw new Error(`Miami Beach ArcGIS layer ${layer.id} request failed after ${MAX_FETCH_ATTEMPTS} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
  }

  if (!response.ok) {
    throw new Error(`Miami Beach ArcGIS layer ${layer.id} request failed: ${response.status} ${response.statusText}`);
  }

  const geojson = await response.json();
  if (geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
    throw new Error(`Miami Beach ArcGIS layer ${layer.id} did not return a FeatureCollection`);
  }

  return { url, geojson };
}

async function fetchGeoJson(layer) {
  const features = [];
  const pageUrls = [];
  let offset = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { url, geojson } = await fetchGeoJsonPage(layer, offset);
    const pageCount = geojson.features.length;
    pageUrls.push(url);
    features.push(...geojson.features);

    if (pageCount === 0 || pageCount < PAGE_SIZE) break;
    offset += pageCount;
  }

  if (pageUrls.length >= MAX_PAGES) {
    throw new Error(`Miami Beach ArcGIS layer ${layer.id} exceeded ${MAX_PAGES} pages; refusing to write partial data`);
  }

  return {
    url: queryUrl(layer.id),
    pageUrls,
    geojson: {
      type: 'FeatureCollection',
      features,
    },
  };
}

function text(value, fallback = '') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function residentialZoneSemantics(properties) {
  const zoneCode = number(properties.ZONE_);
  const zoneTypeCode = number(properties.ZONE_TYPE);
  const restrictedTimeCode = number(properties.RESTRICTED_RES_TIME);
  const zoneName = zoneCode === null ? '' : MIAMI_BEACH_RESIDENTIAL_ZONE_NAMES[zoneCode] ?? `Zone ${zoneCode}`;
  const zoneType = zoneTypeCode === null ? '' : MIAMI_BEACH_RESIDENTIAL_ZONE_TYPES[zoneTypeCode] ?? `Zone type ${zoneTypeCode}`;
  const restrictedTime = restrictedTimeCode === null ? '' : MIAMI_BEACH_RESTRICTED_TIMES[restrictedTimeCode] ?? `Restricted time ${restrictedTimeCode}`;
  return {
    zone_code: zoneCode,
    zone_name: zoneName,
    zone_type_code: zoneTypeCode,
    zone_type: zoneType,
    restricted_res_time_code: restrictedTimeCode,
    restricted_res_time: restrictedTime,
    restrictions: [zoneType, restrictedTime].filter(Boolean).join('; '),
  };
}

function firstRingCoordinates(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return geometry.coordinates?.[0] ?? [];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates?.[0]?.[0] ?? [];
  return [];
}

function centroid(geometry) {
  const ring = firstRingCoordinates(geometry).filter((coordinate) => {
    return Array.isArray(coordinate) && Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1]);
  });

  if (ring.length === 0) return null;

  const last = ring[ring.length - 1];
  const uniqueRing = ring.length > 1 && ring[0][0] === last[0] && ring[0][1] === last[1]
    ? ring.slice(0, -1)
    : ring;

  if (uniqueRing.length === 0) return null;

  const totals = uniqueRing.reduce(
    (acc, coordinate) => ({ lng: acc.lng + coordinate[0], lat: acc.lat + coordinate[1] }),
    { lng: 0, lat: 0 }
  );

  return [totals.lng / uniqueRing.length, totals.lat / uniqueRing.length];
}

function pointCoordinates(feature) {
  if (feature.geometry?.type !== 'Point') return null;
  const coordinates = feature.geometry.coordinates;
  if (!Array.isArray(coordinates) || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) {
    return null;
  }
  return coordinates;
}

function facilityType(properties) {
  const subtype = text(properties.SUBTYPE ?? properties.SubType).toLowerCase();
  if (subtype.includes('garage')) return 'garage';
  return 'surface_lot';
}

function lotPriceStatus(charge) {
  return hasUsefulValue(charge) ? 'known_priced' : 'known_unpriced';
}

function enrichmentStatusForPrice(priceStatus) {
  return priceStatus === 'known_priced' ? 'needs_payment_link' : 'needs_price';
}

function hasUsefulValue(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return Boolean(normalized) && !['n/a', 'na', 'none', 'unknown', 'null', '-'].includes(normalized);
}

function paymentEvidence(zone) {
  return hasUsefulValue(zone)
    ? {
        payment_provider: MIAMI_BEACH_PAYMENT_PROVIDER,
        payment_app_url: MIAMI_BEACH_PAYMENT_APP_URL,
        payment_note: MIAMI_BEACH_PAYMENT_NOTE,
      }
    : {
        payment_provider: '',
        payment_app_url: '',
        payment_note: '',
      };
}

function normalizeLotFeature(feature, apiUrl) {
  const properties = feature.properties ?? {};
  const objectId = properties.OBJECTID ?? feature.id ?? properties.ObjectId;
  const name = text(properties.NAME, `Miami Beach parking lot ${objectId}`);
  const charge = text(properties.HOURLY_RATE, 'unknown');
  const coordinates = centroid(feature.geometry);
  if (!coordinates) return null;
  const priceStatus = lotPriceStatus(charge);
  const parkmobileZone = hasUsefulValue(properties.ParkMobile) ? text(properties.ParkMobile) : '';

  return {
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates,
    },
    properties: {
      source_id: `miami-beach:arcgis:lot:${objectId}`,
      source_name: SOURCE_NAME,
      name,
      facility_type: facilityType(properties),
      street: text(properties.Address),
      city: 'Miami Beach',
      state: 'FL',
      operator: 'City of Miami Beach Parking Department',
      access: 'public',
      fee: charge === 'unknown' ? 'unknown' : 'yes',
      charge,
      event_rate: text(properties.EVENT_RATE),
      maximum_time: text(properties.MAX_TYME),
      capacity: number(properties.SPACES),
      parkmobile_zone: parkmobileZone,
      ...paymentEvidence(parkmobileZone),
      ev_charging: text(properties.EV_CS),
      amenities: text(properties.AMENITIES),
      confidence: 0.92,
      last_verified_source: SOURCE_NAME,
      source_url: SOURCE_PAGE,
      api_url: apiUrl,
      evidence_url: apiUrl,
      data_as_of: DATA_AS_OF,
      existence_status: 'confirmed',
      price_status: priceStatus,
      rule_status: 'partial',
      enrichment_status: enrichmentStatusForPrice(priceStatus),
      payment_url: '',
      booking_url: '',
      raw_properties: properties,
      geometry_provenance: 'Centroid derived from official Miami Beach ArcGIS Parking Lots polygon layer; original polygon preserved in data/miami_beach_parking_arcgis_lots.geojson and zones fallback.',
    },
  };
}

function normalizeMeterFeature(feature, apiUrl) {
  const properties = feature.properties ?? {};
  const objectId = properties.OBJECTID ?? feature.id ?? properties.ObjectId;
  const coordinates = pointCoordinates(feature);
  if (!coordinates) return null;

  const numberLabel = text(properties.NUMBER ?? properties.METER_ID ?? properties.SPACE_NUMBER, String(objectId));
  const zone = text(properties.ZONE ?? properties.ParkMobile ?? properties.PARKMOBILE);
  const parkmobileZone = hasUsefulValue(zone) ? zone : '';
  const status = text(properties.STATUS ?? properties.CONDITION);

  return {
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates,
    },
    properties: {
      source_id: `miami-beach:arcgis:meter:${objectId}`,
      source_name: SOURCE_NAME,
      name: `Miami Beach meter ${numberLabel}`,
      facility_type: 'street_meter',
      street: text(properties.ADDRESS ?? properties.Address),
      city: 'Miami Beach',
      state: 'FL',
      operator: 'City of Miami Beach Parking Department',
      access: 'public',
      fee: 'yes',
      charge: text(properties.METER_RATES ?? properties.RATE ?? properties.RATES, 'meter rates in source layer'),
      parking_zone: zone,
      parkmobile_zone: parkmobileZone,
      ...paymentEvidence(parkmobileZone),
      meter_number: numberLabel,
      meter_status: status,
      confidence: 0.9,
      last_verified_source: SOURCE_NAME,
      source_url: SOURCE_PAGE,
      api_url: apiUrl,
      evidence_url: apiUrl,
      data_as_of: DATA_AS_OF,
      existence_status: 'confirmed',
      price_status: 'paid_unknown',
      rule_status: 'partial',
      enrichment_status: 'needs_price',
      payment_url: '',
      booking_url: '',
      raw_properties: properties,
    },
  };
}

function normalizeZoneFeature(feature, layer, apiUrl) {
  const properties = feature.properties ?? {};
  const objectId = properties.OBJECTID ?? feature.id ?? properties.ObjectId;
  const isLot = layer.key === 'lots';
  const zoneSemantics = isLot ? {} : residentialZoneSemantics(properties);
  const zoneName = text(zoneSemantics.zone_name);
  const name = isLot
    ? text(properties.NAME ?? properties.PARKING_ZONE ?? properties.Zone, `${layer.name} ${objectId}`)
    : `Miami Beach Residential ${text(zoneName, `${layer.name} ${objectId}`)}`;
  const charge = text(properties.HOURLY_RATE, 'unknown');
  const priceStatus = isLot ? lotPriceStatus(charge) : 'not_applicable';
  const rawParkmobileZone = properties.ParkMobile ?? properties.PARKMOBILE ?? properties.ZONE;
  const parkmobileZone = hasUsefulValue(rawParkmobileZone) ? text(rawParkmobileZone) : '';

  return {
    ...feature,
    properties: {
      ...properties,
      source_id: `miami-beach:arcgis:${layer.key}:${objectId}`,
      source_name: SOURCE_NAME,
      name,
      facility_type: isLot ? facilityType(properties) : 'residential_parking_zone',
      city: 'Miami Beach',
      state: 'FL',
      operator: 'City of Miami Beach Parking Department',
      access: isLot ? 'public' : 'regulated_residential_zone',
      fee: isLot ? (charge === 'unknown' ? text(properties.FEE, 'unknown') : 'yes') : 'not_applicable',
      charge: isLot ? charge : '',
      capacity: number(properties.SPACES),
      parkmobile_zone: parkmobileZone,
      ...paymentEvidence(parkmobileZone),
      ...zoneSemantics,
      confidence: 0.9,
      last_verified_source: SOURCE_NAME,
      source_url: SOURCE_PAGE,
      api_url: apiUrl,
      evidence_url: apiUrl,
      data_as_of: DATA_AS_OF,
      existence_status: 'confirmed',
      price_status: priceStatus,
      rule_status: 'partial',
      enrichment_status: isLot ? enrichmentStatusForPrice(priceStatus) : 'needs_rules',
      payment_url: '',
      booking_url: '',
      raw_properties: properties,
    },
  };
}

function collection(metadata, features) {
  return {
    type: 'FeatureCollection',
    metadata: {
      ...metadata,
      generated_at: new Date().toISOString(),
      count: features.length,
    },
    features,
  };
}

async function writeJson(filePath, data) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

async function main() {
  const layerResults = [];

  for (const layer of LAYERS) {
    const { url, pageUrls, geojson } = await fetchGeoJson(layer);
    const normalizedFeatures = geojson.features.map((feature) => normalizeZoneFeature(feature, layer, url));
    const output = path.join(root, 'data', layer.output);
    const rawOutput = path.join(root, 'data', 'research', 'fetches', `miami-beach-arcgis-layer-${layer.id}-${layer.key}.geojson`);

    const normalizedCollection = collection(
      {
        city: 'miami_beach',
        source: `${SOURCE_NAME} ${layer.name}`,
        source_url: SOURCE_PAGE,
        api_url: url,
        page_urls: pageUrls,
        layer_id: layer.id,
        layer_name: layer.name,
      },
      normalizedFeatures
    );

    await writeJson(rawOutput, geojson);
    await writeJson(output, normalizedCollection);
    layerResults.push({ layer, url, pageUrls, geojson, normalizedCollection, output });
  }

  const lots = layerResults.find((result) => result.layer.key === 'lots');
  const meters = layerResults.find((result) => result.layer.key === 'meters');
  const lotFacilities = lots
    ? lots.geojson.features
        .map((feature) => normalizeLotFeature(feature, lots.url))
        .filter((feature) => feature !== null)
    : [];
  const meterFacilities = meters
    ? meters.geojson.features
        .map((feature) => normalizeMeterFeature(feature, meters.url))
        .filter((feature) => feature !== null)
    : [];

  const facilitiesCollection = collection(
    {
      city: 'miami_beach',
      source: `${SOURCE_NAME} parking lot centroids and street meters`,
      source_url: SOURCE_PAGE,
      api_urls: [lots?.url, meters?.url].filter((url) => typeof url === 'string'),
      notes: 'Official Miami Beach ArcGIS parking lot polygons converted to point centroids plus official parking meter points for the current facilities map layer. Original polygons and raw meter layers are preserved as separate fixtures.',
      lot_facilities_count: lotFacilities.length,
      meter_facilities_count: meterFacilities.length,
    },
    [...lotFacilities, ...meterFacilities]
  );

  const zoneLayerFeatures = layerResults
    .filter((result) => result.layer.key === 'lots' || result.layer.key === 'zones')
    .flatMap((result) => result.normalizedCollection.features);
  const zones = zoneLayerFeatures.filter((feature) => feature.geometry !== null);
  const skippedNullGeometryZones = zoneLayerFeatures.length - zones.length;
  const zonesCollection = collection(
    {
      city: 'miami_beach',
      source: `${SOURCE_NAME} lot and zone polygons`,
      source_url: SOURCE_PAGE,
      api_urls: layerResults
        .filter((result) => result.layer.key === 'lots' || result.layer.key === 'zones')
        .map((result) => result.url),
      notes: 'Official Miami Beach ArcGIS parking lots and parking zones used as polygon fallback for /api/geojson/zones?city=miami. Upstream records with null geometry are preserved in raw layer files but excluded from this renderable fallback.',
      skipped_null_geometry: skippedNullGeometryZones,
    },
    zones
  );

  await writeJson(path.join(root, 'data', 'miami_beach_parking_arcgis_facilities.geojson'), facilitiesCollection);
  await writeJson(path.join(root, 'data', 'miami_beach_parking_arcgis_lots_zones.geojson'), zonesCollection);

  const summary = {
    generated_at: new Date().toISOString(),
    source: SOURCE_NAME,
    layers: layerResults.map((result) => ({
      id: result.layer.id,
      key: result.layer.key,
      name: result.layer.name,
      count: result.normalizedCollection.features.length,
      pages: result.pageUrls.length,
      output: path.relative(root, result.output),
    })),
    lot_facilities_count: lotFacilities.length,
    meter_facilities_count: meterFacilities.length,
    facilities_count: facilitiesCollection.features.length,
    zones_count: zonesCollection.features.length,
    skipped_null_geometry_zones: skippedNullGeometryZones,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


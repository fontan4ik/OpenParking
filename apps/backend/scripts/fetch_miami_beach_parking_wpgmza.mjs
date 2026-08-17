import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentSnapshotTimestamp } from './refresh_snapshot.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..', '..');

const SOURCE_URL =
  'https://www.miamibeachfl.gov/city-hall/parking/parking-garages-lot-locations/';
const API_URL = 'https://www.miamibeachfl.gov/wp-json/wpgmza/v1/markers?map_id=17';
const PAYMENT_PROVIDER = 'ParkMobile / PayByPhone';
const PAYMENT_APP_URL = 'https://www.paybyphone.com/park-in-miami-beach';
const PAYMENT_NOTE =
  'Official Miami Beach source lists ParkMobile zones and PayByPhone/ParkMobile app support; ParkingUSA does not infer a per-record checkout URL.';
const DATA_AS_OF = currentSnapshotTimestamp();
const OUTPUT = path.join(root, 'data', 'miami_beach_parking_wpgmza.geojson');
const RAW_OUTPUT = path.join(root, 'data', 'research', 'fetches', 'miami-beach-wpgmza-map17-markers.json');
const DESCRIPTION_LABELS = [
  'Spaces',
  'Hourly Rate',
  'Event Rate',
  'Maximum Time',
  'Park Mobile',
  'Electric Vehicle Charging',
];

function stripHtml(value) {
  return String(value ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<hr\b[^>]*>/gi, '\n')
    .replace(/<\/span>\s*<span\b[^>]*>/gi, '')
    .replace(/<\/p>\s*<p\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#038;/gi, '&')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*:\s*/g, ': ')
    .replace(/\n\s+/g, '\n')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function escapedLabel(label) {
  return label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanFieldValue(value) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  const startsWithAnotherLabel = DESCRIPTION_LABELS.some((label) => {
    return new RegExp(`^${escapedLabel(label)}\\s*:`, 'i').test(normalized);
  });
  if (startsWithAnotherLabel) return '';

  const embeddedLabelIndex = DESCRIPTION_LABELS
    .map((label) => normalized.search(new RegExp(`\\s${escapedLabel(label)}(?:\\s*:|\\s+)`, 'i')))
    .filter((index) => index > 0)
    .sort((a, b) => a - b)[0];

  return embeddedLabelIndex ? normalized.slice(0, embeddedLabelIndex).trim() : normalized;
}

function descriptionFields(description) {
  const fields = {};
  const text = stripHtml(description);

  for (const label of DESCRIPTION_LABELS) {
    const escaped = escapedLabel(label);
    const nextLabels = DESCRIPTION_LABELS
      .filter((candidate) => candidate !== label)
      .map(escapedLabel)
      .join('|');
    const pattern = new RegExp(`${escaped}:\\s*([\\s\\S]*?)(?=\\s+(?:${nextLabels}):|$)`, 'i');
    const match = text.match(pattern);
    fields[label] = match ? cleanFieldValue(match[1]) : '';
  }

  return fields;
}

function numberOrNull(value) {
  const number = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(number) ? number : null;
}

function hasUsefulValue(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return Boolean(normalized) && !['n/a', 'na', 'none', 'unknown', 'null', '-'].includes(normalized);
}

function priceStatus(charge) {
  return hasUsefulValue(charge) ? 'known_priced' : 'known_unpriced';
}

function normalizeMarker(marker) {
  const title = String(marker.title ?? 'Parking').trim();
  const description = marker.description ?? '';
  const fields = descriptionFields(description);
  const subtype = /garage/i.test(title) ? 'garage' : 'surface_lot';
  const lat = numberOrNull(marker.lat);
  const lng = numberOrNull(marker.lng);
  const charge = fields['Hourly Rate'] || '';
  const status = priceStatus(charge);
  const parkmobileZone = hasUsefulValue(fields['Park Mobile']) ? fields['Park Mobile'] : '';

  return {
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [lng, lat],
    },
    properties: {
      source_id: `miami-beach:wpgmza:${marker.id}`,
      source_name: 'City of Miami Beach Parking Facilities',
      name: title,
      facility_type: subtype,
      street: marker.address || '',
      city: 'Miami Beach',
      state: 'FL',
      operator: 'City of Miami Beach Parking Department',
      access: 'public',
      fee: 'yes',
      charge: charge || 'unknown',
      event_rate: fields['Event Rate'],
      maximum_time: fields['Maximum Time'],
      capacity: fields.Spaces,
      parkmobile_zone: parkmobileZone,
      payment_provider: parkmobileZone ? PAYMENT_PROVIDER : '',
      payment_app_url: parkmobileZone ? PAYMENT_APP_URL : '',
      payment_note: parkmobileZone ? PAYMENT_NOTE : '',
      ev_charging: fields['Electric Vehicle Charging'],
      confidence: 0.88,
      last_verified_source: 'City of Miami Beach Parking Facilities',
      source_url: SOURCE_URL,
      api_url: API_URL,
      evidence_url: API_URL,
      data_as_of: DATA_AS_OF,
      existence_status: 'confirmed',
      price_status: status,
      rule_status: 'partial',
      enrichment_status: status === 'known_priced' ? 'needs_payment_link' : 'needs_price',
      payment_url: '',
      booking_url: '',
      raw_properties: marker,
    },
  };
}

async function main() {
  const response = await fetch(API_URL, {
    headers: {
      'User-Agent': 'ParkingUSA research import (local prototype)',
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Miami Beach WPGMZA request failed: ${response.status} ${response.statusText}`);
  }

  const allMarkers = await response.json();
  const markers = allMarkers.filter((marker) => String(marker.map_id) === '17');
  const features = markers
    .map(normalizeMarker)
    .filter((feature) => {
      const [lng, lat] = feature.geometry.coordinates;
      return Number.isFinite(lng) && Number.isFinite(lat);
    });

  const geojson = {
    type: 'FeatureCollection',
    metadata: {
      city: 'miami_beach',
      source: 'City of Miami Beach Parking Facilities WPGMZA markers',
      source_url: SOURCE_URL,
      api_url: API_URL,
      generated_at: new Date().toISOString(),
      count: features.length,
      notes:
        'Official City of Miami Beach parking garage/lot map markers. Used as Miami metro coverage seed, not City of Miami municipal inventory.',
    },
    features,
  };

  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await mkdir(path.dirname(RAW_OUTPUT), { recursive: true });
  await writeFile(RAW_OUTPUT, JSON.stringify(markers, null, 2), 'utf8');
  await writeFile(OUTPUT, JSON.stringify(geojson, null, 2), 'utf8');
  console.log(JSON.stringify(geojson.metadata, null, 2));
  console.log(OUTPUT);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

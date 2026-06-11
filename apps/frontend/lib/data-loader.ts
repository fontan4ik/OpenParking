/* ═══════════════════════════════════════════════════════════════
   ParkingUSA — GeoJSON Data Loader
   Reads existing GeoJSON files from /data directory.
   This is the file-based fallback before PostGIS is available.
   ═══════════════════════════════════════════════════════════════ */

import { promises as fs } from 'fs';
import path from 'path';
import {
  loadCurbSegmentsFromDb,
  loadFacilitiesFromDb,
  loadZonesFromDb,
} from '@/lib/db-loader';

export interface GeoJSONCollection {
  type: 'FeatureCollection';
  metadata?: Record<string, unknown>;
  features: GeoJSONFeature[];
}

export interface GeoJSONFeature {
  type: 'Feature';
  geometry: {
    type: string;
    coordinates: unknown;
  };
  properties: Record<string, unknown>;
}

const DATA_DIR_CANDIDATES = [
  path.join(process.cwd(), 'data'),
  path.resolve(process.cwd(), '..', '..', 'data'),
];

const cache = new Map<string, { data: GeoJSONCollection; loadedAt: number }>();
const CACHE_TTL = 60_000; // 1 minute

async function loadGeoJSON(filename: string): Promise<GeoJSONCollection> {
  const now = Date.now();
  const cached = cache.get(filename);
  if (cached && now - cached.loadedAt < CACHE_TTL) {
    return cached.data;
  }

  for (const dataDir of DATA_DIR_CANDIDATES) {
    const filePath = path.join(dataDir, filename);
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(raw) as GeoJSONCollection;
      cache.set(filename, { data, loadedAt: now });
      return data;
    } catch {
      // Try the next candidate. The frontend may run from repo root or apps/frontend.
    }
  }

  return { type: 'FeatureCollection', features: [] };
}

export async function loadFacilities(): Promise<GeoJSONCollection> {
  return (await loadFacilitiesFromDb()) ?? loadGeoJSON('sf_parking_datasf.geojson');
}

export async function loadCurbSegments(): Promise<GeoJSONCollection> {
  return (await loadCurbSegmentsFromDb()) ?? loadGeoJSON('sf_parking_curb_segments.geojson');
}

export async function loadZones(): Promise<GeoJSONCollection> {
  return (await loadZonesFromDb()) ?? loadGeoJSON('sf_parking_zones_osm.geojson');
}

export async function loadAllLayers() {
  const [facilities, segments, zones] = await Promise.all([
    loadFacilities(),
    loadCurbSegments(),
    loadZones(),
  ]);

  return { facilities, segments, zones };
}

export function computeStats(
  facilities: GeoJSONCollection,
  segments: GeoJSONCollection,
  zones: GeoJSONCollection
) {
  const totalFacilities = facilities.features.length;
  const pricedFacilities = facilities.features.filter((f) => {
    const p = f.properties;
    return (
      p.base_hourly_rate ||
      (p.charge && p.charge !== 'unknown') ||
      (p.raw_tags && (p.raw_tags as Record<string, string>).charge)
    );
  }).length;

  const coveragePercent =
    totalFacilities > 0 ? Math.round((pricedFacilities / totalFacilities) * 100) : 0;

  return {
    cityId: 'sf',
    totalFacilities,
    pricedFacilities,
    curbSegments: segments.features.length,
    zones: zones.features.length,
    coveragePercent,
    lastUpdated: (facilities.metadata?.generated_at_unix
      ? new Date((facilities.metadata.generated_at_unix as number) * 1000).toISOString()
      : new Date().toISOString()),
  };
}

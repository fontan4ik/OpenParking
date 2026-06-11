import { prisma, tryDatabase } from '@/lib/db';
import type { GeoJSONCollection, GeoJSONFeature } from '@/lib/data-loader';

function feature(geometry: unknown, properties: Record<string, unknown>): GeoJSONFeature {
  return {
    type: 'Feature',
    geometry: geometry as GeoJSONFeature['geometry'],
    properties,
  };
}

function collection(features: GeoJSONFeature[]): GeoJSONCollection {
  return {
    type: 'FeatureCollection',
    metadata: {
      source: 'PostGIS/Prisma',
      count: features.length,
    },
    features,
  };
}

export async function loadFacilitiesFromDb(): Promise<GeoJSONCollection | null> {
  return tryDatabase(async () => {
    const rows = await prisma.parkingFacility.findMany({
      take: 50_000,
      orderBy: [{ sourceId: 'asc' }],
    });

    return collection(
      rows.map((row) =>
        feature(row.geojson, {
          source_id: row.sourceId,
          source_name: row.sourceName,
          name: row.name,
          facility_type: row.facilityType,
          fee: row.fee,
          charge: row.charge,
          base_hourly_rate: row.baseHourlyRate,
          operator: row.operator,
          access: row.access,
          capacity: row.capacity,
          opening_hours: row.openingHours,
          street: row.street,
          blockface_id: row.blockfaceId,
          neighborhood: row.neighborhood,
          meter_type: row.meterType,
          cap_color: row.capColor,
          confidence: row.confidence,
          last_verified_source: row.sourceName,
          data_as_of: row.dataAsOf?.toISOString(),
          raw_properties: row.rawProperties,
        })
      )
    );
  });
}

export async function loadCurbSegmentsFromDb(): Promise<GeoJSONCollection | null> {
  return tryDatabase(async () => {
    const rows = await prisma.curbSegment.findMany({
      take: 50_000,
      orderBy: [{ sourceId: 'asc' }],
    });

    return collection(
      rows.map((row) =>
        feature(row.geojson, {
          source_id: row.sourceId,
          source_name: row.sourceName,
          blockface_id: row.blockfaceId,
          meter_count: row.meterCount,
          street_sample: row.streetSample,
          neighborhood: row.neighborhood,
          base_hourly_rate_min: row.baseHourlyRateMin,
          base_hourly_rate_max: row.baseHourlyRateMax,
          charge: row.charge,
          confidence: row.confidence,
          last_verified_source: row.sourceName,
          data_as_of: row.dataAsOf?.toISOString(),
          raw_properties: row.rawProperties,
        })
      )
    );
  });
}

export async function loadZonesFromDb(): Promise<GeoJSONCollection | null> {
  return tryDatabase(async () => {
    const rows = await prisma.parkingZone.findMany({
      take: 50_000,
      orderBy: [{ sourceId: 'asc' }],
    });

    return collection(
      rows.map((row) =>
        feature(row.geojson, {
          source_id: row.sourceId,
          source_name: row.sourceName,
          name: row.name,
          facility_type: row.facilityType,
          operator: row.operator,
          access: row.access,
          fee: row.fee,
          charge: row.charge,
          capacity: row.capacity,
          opening_hours: row.openingHours,
          website: row.website,
          confidence: row.confidence,
          last_verified_source: row.sourceName,
          data_as_of: row.dataAsOf?.toISOString(),
          raw_properties: row.rawProperties,
        })
      )
    );
  });
}

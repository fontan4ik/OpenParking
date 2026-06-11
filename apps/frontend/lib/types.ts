/* ═══════════════════════════════════════════════════════════════
   ParkingUSA — Types & Interfaces
   ═══════════════════════════════════════════════════════════════ */

export type FacilityType =
  | 'street_meter'
  | 'offstreet_meter'
  | 'garage'
  | 'multi-storey'
  | 'underground'
  | 'surface'
  | 'surface_lot'
  | 'lot'
  | 'valet'
  | 'airport'
  | 'event'
  | 'monthly'
  | 'private'
  | 'parking'
  | 'parking_entrance'
  | 'parking_area'
  | 'street_side'
  | 'unknown';

export type GeometryType = 'Point' | 'Polygon' | 'LineString' | 'MultiPolygon';

export type AccessType = 'public' | 'customers' | 'permit' | 'private' | 'unknown' | '';

export interface ParkingFacility {
  id: string;
  sourceId: string;
  name: string;
  facilityType: FacilityType | string;
  geometryType: GeometryType;
  lat: number;
  lng: number;
  polygonGeojson?: GeoJSON.Geometry | null;
  entranceLat?: number | null;
  entranceLng?: number | null;
  address?: string;
  city: string;
  state: string;
  zip?: string;
  operator?: string;
  owner?: string;
  phone?: string;
  website?: string;
  bookingUrl?: string;
  paymentProvider?: string;
  access?: AccessType;
  capacity?: number | string;
  heightClearance?: number | null;
  evCharging?: boolean;
  accessible?: boolean;
  covered?: boolean;
  overnight?: boolean;
  monthlyAvailable?: boolean;
  fee?: string;
  charge?: string;
  baseHourlyRate?: number | null;
  openingHours?: string;
  sourceConfidence: number;
  lastVerifiedSource?: string;
  dataAsOf?: string;
  neighborhood?: string;
  blockfaceId?: string;
  meterType?: string;
  capColor?: string;
  street?: string;
}

export interface CurbSegment {
  id: string;
  sourceId: string;
  blockfaceId: string;
  meterCount: number;
  streetSample: string;
  neighborhood: string;
  baseHourlyRateMin: number | null;
  baseHourlyRateMax: number | null;
  charge: string;
  confidence: number;
  coordinates: [number, number][];
}

export interface ParkingZone {
  id: string;
  sourceId: string;
  name: string;
  facilityType: string;
  operator: string;
  access: string;
  fee: string;
  charge: string;
  capacity: string;
  confidence: number;
  geometryNote?: string;
  coordinates: number[][][];
}

export interface CityConfig {
  id: string;
  name: string;
  state: string;
  center: [number, number]; // [lng, lat]
  zoom: number;
  bbox: [number, number, number, number]; // [south, west, north, east]
  dataSources: string[];
  color: string;
}

export interface CityStats {
  cityId: string;
  totalFacilities: number;
  pricedFacilities: number;
  curbSegments: number;
  zones: number;
  coveragePercent: number;
  lastUpdated: string;
}

export const CITIES: Record<string, CityConfig> = {
  sf: {
    id: 'sf',
    name: 'San Francisco',
    state: 'CA',
    center: [-122.4194, 37.7749],
    zoom: 12,
    bbox: [37.7047, -122.5270, 37.8324, -122.3482],
    dataSources: ['DataSF Meters', 'OSM', 'Rate Schedules'],
    color: '#f59e0b',
  },
  nyc: {
    id: 'nyc',
    name: 'New York City',
    state: 'NY',
    center: [-73.9857, 40.7484],
    zoom: 11,
    bbox: [40.4774, -74.2591, 40.9176, -73.7004],
    dataSources: ['NYC Open Data', 'OSM'],
    color: '#3b82f6',
  },
  la: {
    id: 'la',
    name: 'Los Angeles',
    state: 'CA',
    center: [-118.2437, 34.0522],
    zoom: 11,
    bbox: [33.7037, -118.6682, 34.3373, -118.1553],
    dataSources: ['LADOT', 'OSM'],
    color: '#ef4444',
  },
  seattle: {
    id: 'seattle',
    name: 'Seattle',
    state: 'WA',
    center: [-122.3321, 47.6062],
    zoom: 12,
    bbox: [47.4919, -122.4597, 47.7341, -122.2244],
    dataSources: ['Seattle Open Data', 'OSM'],
    color: '#10b981',
  },
  chicago: {
    id: 'chicago',
    name: 'Chicago',
    state: 'IL',
    center: [-87.6298, 41.8781],
    zoom: 11,
    bbox: [41.6445, -87.9401, 42.0230, -87.5237],
    dataSources: ['ParkChicago', 'OSM'],
    color: '#8b5cf6',
  },
};

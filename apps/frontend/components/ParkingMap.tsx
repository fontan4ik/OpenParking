'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, {
  type ExpressionSpecification,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from 'maplibre-gl';
import type { Feature, Geometry } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CITIES } from '@/lib/types';

type DisplayMode = 'all' | 'segments' | 'zones' | 'points' | 'both';

interface FeatureCollection {
  type: 'FeatureCollection';
  features: Feature<Geometry, Record<string, unknown>>[];
}

interface ParkingMapProps {
  activeCity: string;
  displayMode: DisplayMode;
  typeFilter: string;
  priceFilter: string;
  sourceFilter: string;
  confidenceFilter: string;
  searchQuery: string;
  onFacilitySelect: (feature: Feature<Geometry, Record<string, unknown>>) => void;
}

const EMPTY_COLLECTION: FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

const MAP_STYLE = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors',
    },
  },
  layers: [
    {
      id: 'osm',
      type: 'raster',
      source: 'osm',
      paint: {
        'raster-saturation': -0.82,
        'raster-brightness-min': 0.08,
        'raster-brightness-max': 0.44,
        'raster-contrast': 0.18,
      },
    },
  ],
} as maplibregl.StyleSpecification;

function getString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function getNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function hasKnownPrice(properties: GeoJSON.GeoJsonProperties) {
  if (!properties) return false;
  return Boolean(
    properties.base_hourly_rate ||
      (properties.charge && properties.charge !== 'unknown')
  );
}

function matchesFilters(
  feature: Feature<Geometry, Record<string, unknown>>,
  typeFilter: string,
  priceFilter: string,
  sourceFilter: string,
  confidenceFilter: string,
  searchQuery: string
) {
  const properties = feature.properties || {};

  if (typeFilter && properties.facility_type !== typeFilter) return false;

  if (priceFilter === 'known' && !hasKnownPrice(properties)) return false;
  if (priceFilter === 'unknown' && hasKnownPrice(properties)) return false;

  if (sourceFilter) {
    const source = properties.source_name || properties.last_verified_source;
    if (source !== sourceFilter) return false;
  }

  if (confidenceFilter) {
    const confidence = getNumber(properties.confidence) ?? 0.5;
    if (confidenceFilter === 'high' && confidence < 0.75) return false;
    if (confidenceFilter === 'medium' && (confidence < 0.5 || confidence >= 0.75)) return false;
    if (confidenceFilter === 'low' && confidence >= 0.5) return false;
    if (confidenceFilter === 'review' && confidence >= 0.7) return false;
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    const haystack = [
      properties.name,
      properties.operator,
      properties.source_id,
      properties.street,
      properties.neighborhood,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(q)) return false;
  }

  return true;
}

function filterCollection(
  data: FeatureCollection,
  typeFilter: string,
  priceFilter: string,
  sourceFilter: string,
  confidenceFilter: string,
  searchQuery: string
): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: data.features.filter((feature) =>
      matchesFilters(feature, typeFilter, priceFilter, sourceFilter, confidenceFilter, searchQuery)
    ),
  };
}

function htmlEscape(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function popupHtml(feature: GeoJSON.Feature) {
  const p = feature.properties || {};
  const name = htmlEscape(getString(p.name, 'Parking'));
  const type = htmlEscape(getString(p.facility_type, 'unknown'));
  const charge = htmlEscape(getString(p.charge, 'unknown') || 'unknown');
  const operator = htmlEscape(getString(p.operator, ''));
  const source = htmlEscape(getString(p.last_verified_source, ''));
  const dataAsOf = htmlEscape(getString(p.data_as_of, ''));
  const confidence = getNumber(p.confidence);

  return `
    <div class="popup-title">${name}</div>
    <div class="popup-price">${charge}</div>
    <div class="popup-row"><b>Type</b><span>${type}</span></div>
    ${operator ? `<div class="popup-row"><b>Operator</b><span>${operator}</span></div>` : ''}
    ${source ? `<div class="popup-row"><b>Source</b><span>${source}</span></div>` : ''}
    ${dataAsOf ? `<div class="popup-row"><b>Freshness</b><span>${dataAsOf.slice(0, 10)}</span></div>` : ''}
    ${
      confidence !== null
        ? `<div class="popup-row"><b>Confidence</b><span>${Math.round(confidence * 100)}%</span></div>`
        : ''
    }
  `;
}

function sourcePoint(feature: Feature<Geometry, Record<string, unknown>>, clickLngLat: maplibregl.LngLat) {
  if (feature.geometry.type === 'Point') {
    return feature.geometry.coordinates as [number, number];
  }

  return [clickLngLat.lng, clickLngLat.lat] as [number, number];
}

function setVisibility(map: maplibregl.Map, id: string, visible: boolean) {
  if (!map.getLayer(id)) return;
  map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
}

export default function ParkingMap({
  activeCity,
  displayMode,
  typeFilter,
  priceFilter,
  sourceFilter,
  confidenceFilter,
  searchQuery,
  onFacilitySelect,
}: ParkingMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [facilities, setFacilities] = useState<FeatureCollection>(EMPTY_COLLECTION);
  const [segments, setSegments] = useState<FeatureCollection>(EMPTY_COLLECTION);
  const [zones, setZones] = useState<FeatureCollection>(EMPTY_COLLECTION);
  const [isLoading, setIsLoading] = useState(true);

  const activeCityConfig = CITIES[activeCity] || CITIES.sf;
  const hasCityData = activeCity === 'sf';

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: CITIES.sf.center,
      zoom: CITIES.sf.zoom,
      minZoom: 9,
      maxZoom: 19,
      attributionControl: false,
    });

    map.addControl(
      new maplibregl.NavigationControl({ visualizePitch: true }),
      'bottom-right'
    );
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      'bottom-left'
    );

    map.on('load', () => {
      map.addSource('zones', { type: 'geojson', data: EMPTY_COLLECTION });
      map.addSource('segments', { type: 'geojson', data: EMPTY_COLLECTION });
      map.addSource('facilities', { type: 'geojson', data: EMPTY_COLLECTION });

      map.addLayer({
        id: 'zones-fill',
        type: 'fill',
        source: 'zones',
        paint: {
          'fill-color': [
            'match',
            ['get', 'facility_type'],
            'multi-storey',
            '#3b82f6',
            'garage',
            '#3b82f6',
            'underground',
            '#8b5cf6',
            'surface',
            '#10b981',
            'surface_lot',
            '#10b981',
            '#06b6d4',
          ],
          'fill-opacity': [
            'interpolate',
            ['linear'],
            ['coalesce', ['get', 'confidence'], 0.4],
            0.2,
            0.16,
            0.8,
            0.48,
          ] as ExpressionSpecification,
        },
      });

      map.addLayer({
        id: 'zones-outline',
        type: 'line',
        source: 'zones',
        paint: {
          'line-color': '#93c5fd',
          'line-width': 1.2,
          'line-opacity': 0.65,
        },
      });

      map.addLayer({
        id: 'segments-line',
        type: 'line',
        source: 'segments',
        paint: {
          'line-color': [
            'case',
            ['>', ['coalesce', ['get', 'base_hourly_rate_max'], 0], 4],
            '#ef4444',
            ['>', ['coalesce', ['get', 'base_hourly_rate_max'], 0], 2],
            '#f59e0b',
            ['>', ['coalesce', ['get', 'base_hourly_rate_max'], 0], 0],
            '#10b981',
            '#64748b',
          ],
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10,
            1,
            14,
            3,
            17,
            7,
          ],
          'line-opacity': 0.9,
        },
      });

      map.addLayer({
        id: 'facilities-circle',
        type: 'circle',
        source: 'facilities',
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10,
            2,
            14,
            4,
            17,
            7,
          ],
          'circle-color': [
            'match',
            ['get', 'facility_type'],
            'street_meter',
            '#f59e0b',
            'offstreet_meter',
            '#06b6d4',
            'garage',
            '#3b82f6',
            'surface_lot',
            '#10b981',
            '#94a3b8',
          ],
          'circle-stroke-color': '#0f172a',
          'circle-stroke-width': 1,
          'circle-opacity': 0.86,
        },
      });

      const clickableLayers = ['facilities-circle', 'zones-fill', 'segments-line'];
      clickableLayers.forEach((layerId) => {
        map.on('mouseenter', layerId, () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', layerId, () => {
          map.getCanvas().style.cursor = '';
        });
        map.on('click', layerId, (event: MapLayerMouseEvent) => {
          const feature = event.features?.[0] as Feature<Geometry, Record<string, unknown>> | undefined;
          if (!feature) return;

          onFacilitySelect(feature);
          const coords = sourcePoint(feature, event.lngLat);
          popupRef.current?.remove();
          popupRef.current = new maplibregl.Popup({
            closeButton: true,
            closeOnClick: true,
            maxWidth: '320px',
          })
            .setLngLat(coords)
            .setHTML(popupHtml(feature))
            .addTo(map);
        });
      });

      setIsReady(true);
    });

    mapRef.current = map;

    return () => {
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [onFacilitySelect]);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);

    Promise.all([
      fetch('/api/geojson/facilities', { signal: controller.signal }).then((r) => r.json()),
      fetch('/api/geojson/segments', { signal: controller.signal }).then((r) => r.json()),
      fetch('/api/geojson/zones', { signal: controller.signal }).then((r) => r.json()),
    ])
      .then(([facilityData, segmentData, zoneData]) => {
        setFacilities(facilityData);
        setSegments(segmentData);
        setZones(zoneData);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') console.error(error);
      })
      .finally(() => setIsLoading(false));

    return () => controller.abort();
  }, []);

  const filteredFacilities = useMemo(() => {
    if (!hasCityData) return EMPTY_COLLECTION;
    return filterCollection(facilities, typeFilter, priceFilter, sourceFilter, confidenceFilter, searchQuery);
  }, [confidenceFilter, facilities, hasCityData, priceFilter, searchQuery, sourceFilter, typeFilter]);

  const filteredZones = useMemo(() => {
    if (!hasCityData) return EMPTY_COLLECTION;
    return filterCollection(zones, typeFilter, priceFilter, sourceFilter, confidenceFilter, searchQuery);
  }, [confidenceFilter, hasCityData, priceFilter, searchQuery, sourceFilter, typeFilter, zones]);

  const visibleSegments = useMemo(() => {
    if (!hasCityData) return EMPTY_COLLECTION;
    return filterCollection(segments, '', '', sourceFilter, confidenceFilter, '');
  }, [confidenceFilter, hasCityData, segments, sourceFilter]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;

    (map.getSource('facilities') as GeoJSONSource).setData(filteredFacilities);
    (map.getSource('segments') as GeoJSONSource).setData(visibleSegments);
    (map.getSource('zones') as GeoJSONSource).setData(filteredZones);
  }, [filteredFacilities, filteredZones, isReady, visibleSegments]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;

    const showSegments = displayMode === 'all' || displayMode === 'segments' || displayMode === 'both';
    const showZones = displayMode === 'all' || displayMode === 'zones';
    const showPoints = displayMode === 'all' || displayMode === 'points' || displayMode === 'both';

    setVisibility(map, 'segments-line', showSegments);
    setVisibility(map, 'zones-fill', showZones);
    setVisibility(map, 'zones-outline', showZones);
    setVisibility(map, 'facilities-circle', showPoints);
  }, [displayMode, isReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({
      center: activeCityConfig.center,
      zoom: activeCityConfig.zoom,
      essential: true,
      duration: 900,
    });
    popupRef.current?.remove();
  }, [activeCityConfig.center, activeCityConfig.zoom]);

  return (
    <div ref={containerRef} className="parking-map">
      {(isLoading || !isReady) && (
        <div className="loading-overlay">
          <div className="loading-spinner" />
        </div>
      )}

      <div className="layer-toggles">
        <div className={`layer-toggle ${displayMode === 'all' || displayMode === 'segments' || displayMode === 'both' ? 'active' : ''}`}>
          <span className="layer-dot" style={{ background: 'var(--accent-emerald)' }} />
          {visibleSegments.features.length.toLocaleString('en-US')} curbs
        </div>
        <div className={`layer-toggle ${displayMode === 'all' || displayMode === 'zones' ? 'active' : ''}`}>
          <span className="layer-dot" style={{ background: 'var(--accent-blue)' }} />
          {filteredZones.features.length.toLocaleString('en-US')} zones
        </div>
        <div className={`layer-toggle ${displayMode === 'all' || displayMode === 'points' || displayMode === 'both' ? 'active' : ''}`}>
          <span className="layer-dot" style={{ background: 'var(--accent-amber)' }} />
          {filteredFacilities.features.length.toLocaleString('en-US')} meters
        </div>
      </div>

      {!hasCityData && (
        <div className="city-data-notice">
          <b>{activeCityConfig.name}</b>
          <span>Data connector planned. San Francisco layer is implemented now.</span>
        </div>
      )}
    </div>
  );
}

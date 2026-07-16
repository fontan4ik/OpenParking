'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, {
  type ExpressionSpecification,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from 'maplibre-gl';
import type { Feature, Geometry } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useLanguage } from '@/components/LanguageProvider';
import {
  driverConfidence,
  hasParkingConflict,
  matchesPriceFilter,
  matchesTrustFilter,
  needsParkingReview,
  safeUrl,
} from '@/lib/data-quality';
import { cityNameKey, type TranslationKey } from '@/lib/i18n';
import { buildFacilitySearchHaystack } from '@/lib/facility-search';
import { splitParkingSegments } from '@/lib/map-segment-classification';
import { priceTextOrFallback } from '@/lib/price-utils';
import type { RouteCoordinate } from '@/lib/routing';
import { CITIES } from '@/lib/types';

type DisplayMode = 'all' | 'segments' | 'zones' | 'points' | 'both';
type MapPickMode = 'none' | 'start' | 'destination';

interface FeatureCollection {
  type: 'FeatureCollection';
  features: Feature<Geometry, Record<string, unknown>>[];
}

interface ParkingMapProps {
  activeCity: string;
  theme?: 'light' | 'dark';
  displayMode: DisplayMode;
  typeFilter: string;
  priceFilter: string;
  sourceFilter: string;
  trustFilter: string;
  confidenceFilter: string;
  searchQuery: string;
  onFacilitySelect: (feature: Feature<Geometry, Record<string, unknown>>) => void;
  routeGeometry?: GeoJSON.LineString | null;
  userLocation?: RouteCoordinate | null;
  pickedStart?: RouteCoordinate | null;
  pickedDestination?: RouteCoordinate | null;
  droppedPin?: RouteCoordinate | null;
  mapPickMode?: MapPickMode;
  onMapPointPick?: (coordinate: RouteCoordinate) => void;
  onMapLongPress?: (coordinate: RouteCoordinate) => void;
  onMapInteractionStart?: () => void;
  onMapInteractionEnd?: () => void;
  onLayerCountsChange?: (counts: { curbs: number; reference: number; zones: number; places: number }) => void;
  onLayerStatusChange?: (status: Record<'facilities' | 'segments' | 'zones', LayerLoadStatus>) => void;
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
        'raster-saturation': 0.12,
        'raster-brightness-min': 0,
        'raster-brightness-max': 1,
        'raster-contrast': 0.02,
        'raster-hue-rotate': 0,
      },
    },
  ],
} as maplibregl.StyleSpecification;

type LayerLoadStatus = 'loading' | 'ready' | 'error';

function applyRasterTheme(map: maplibregl.Map, theme: 'light' | 'dark') {
  if (!map.getLayer('osm')) return;

  const paint =
    theme === 'dark'
      ? {
          'raster-saturation': -0.18,
          'raster-brightness-min': 0.01,
          'raster-brightness-max': 0.82,
          'raster-contrast': 0.08,
          'raster-hue-rotate': 0,
        }
      : {
          'raster-saturation': 0.12,
          'raster-brightness-min': 0,
          'raster-brightness-max': 1,
          'raster-contrast': 0.02,
          'raster-hue-rotate': 0,
        };

  Object.entries(paint).forEach(([property, value]) => {
    map.setPaintProperty('osm', property, value);
  });

  if (map.getLayer('city-boundary-casing') && map.getLayer('city-boundary-line')) {
    map.setPaintProperty('city-boundary-casing', 'line-color', theme === 'dark' ? '#111827' : '#ffffff');
    map.setPaintProperty('city-boundary-line', 'line-color', theme === 'dark' ? '#f8fafc' : '#1f2937');
  }
}

function localText(t: (key: TranslationKey) => string, en: string, ru: string) {
  return t('app.subtitle') === 'Все парковки Америки на одной карте' ? ru : en;
}

function statusColorExpression(): ExpressionSpecification {
  return [
    'case',
    ['==', ['get', 'enrichment_status'], 'conflict'],
    '#ef4444',
    ['==', ['get', 'price_status'], 'stale'],
    '#ef4444',
    ['==', ['get', 'rule_status'], 'stale'],
    '#ef4444',
    ['==', ['get', 'enrichment_status'], 'stale'],
    '#ef4444',
    ['==', ['get', 'price_status'], 'known_priced'],
    '#3b82f6',
    ['==', ['get', 'price_status'], 'known_free'],
    '#10b981',
    ['==', ['get', 'price_status'], 'known_unpriced'],
    '#64748b',
    ['==', ['get', 'price_status'], 'paid_unknown'],
    '#f59e0b',
    ['==', ['get', 'price_status'], 'variable'],
    '#f59e0b',
    ['==', ['get', 'enrichment_status'], 'needs_review'],
    '#f59e0b',
    '#94a3b8',
  ] as ExpressionSpecification;
}

function getString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function getNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function matchesFilters(
  feature: Feature<Geometry, Record<string, unknown>>,
  typeFilter: string,
  priceFilter: string,
  sourceFilter: string,
  trustFilter: string,
  confidenceFilter: string,
  searchQuery: string
) {
  const properties = feature.properties || {};

  if (typeFilter && properties.facility_type !== typeFilter) return false;

  if (!matchesPriceFilter(properties, priceFilter)) return false;

  if (sourceFilter) {
    const source = properties.source_name || properties.last_verified_source;
    if (source !== sourceFilter) return false;
  }

  if (!matchesTrustFilter(properties, trustFilter)) return false;

  if (confidenceFilter) {
    const confidence = driverConfidence(properties);
    if (confidenceFilter === 'high' && confidence < 0.75) return false;
    if (confidenceFilter === 'medium' && (confidence < 0.5 || confidence >= 0.75)) return false;
    if (confidenceFilter === 'low' && confidence >= 0.5) return false;
    if (confidenceFilter === 'review' && confidence >= 0.7) return false;
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    const haystack = buildFacilitySearchHaystack(properties);
    if (!haystack.includes(q)) return false;
  }

  return true;
}

function filterCollection(
  data: FeatureCollection,
  typeFilter: string,
  priceFilter: string,
  sourceFilter: string,
  trustFilter: string,
  confidenceFilter: string,
  searchQuery: string
): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: data.features.filter((feature) =>
      matchesFilters(feature, typeFilter, priceFilter, sourceFilter, trustFilter, confidenceFilter, searchQuery)
    ),
  };
}

function isRegulatoryZone(feature: Feature<Geometry, Record<string, unknown>>) {
  const properties = feature.properties || {};
  return (
    properties.facility_type === 'residential_parking_zone' ||
    properties.access === 'regulated_residential_zone' ||
    properties.price_status === 'not_applicable'
  );
}

function parkingAreaZonesOnly(data: FeatureCollection): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: data.features.filter((feature) => !isRegulatoryZone(feature)),
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

function linkHtml(label: string, rawUrl: unknown, unavailable: string) {
  const url = typeof rawUrl === 'string' ? safeUrl(rawUrl) : '';
  if (!url) return `<span class="popup-unavailable">${htmlEscape(unavailable)}</span>`;
  return `<a class="popup-link" href="${htmlEscape(url)}" target="_blank" rel="noopener noreferrer">${htmlEscape(label)}</a>`;
}

function priceDisplay(properties: Record<string, unknown>, t: (key: TranslationKey) => string) {
  const status = getString(properties.price_status, 'unknown');
  if (status === 'known_free') return { label: localText(t, 'Free', 'Бесплатно'), tone: 'free', status: localText(t, 'Known free', 'Точно бесплатно') };
  if (status === 'known_priced') return { label: priceTextOrFallback(properties.charge, t('price.known')), tone: 'priced', status: localText(t, 'Known priced', 'Цена известна') };
  if (status === 'paid_unknown') return { label: localText(t, 'Paid · amount unknown', 'Платно · сумма неизвестна'), tone: 'review', status: localText(t, 'Needs verification', 'Нужна проверка') };
  if (status === 'variable') return { label: localText(t, 'Variable price', 'Переменная цена'), tone: 'variable', status: localText(t, 'Variable', 'Переменная') };
  if (status === 'stale') return { label: localText(t, 'Price needs verification', 'Цена требует проверки'), tone: 'stale', status: localText(t, 'Stale', 'Устарело') };
  if (status === 'not_applicable') return { label: localText(t, 'Regulatory zone', 'Зона правил'), tone: 'unknown', status: localText(t, 'Not a parking place', 'Не отдельная парковка') };
  if (status === 'known_unpriced') return { label: localText(t, 'Price unknown', 'Цена неизвестна'), tone: 'unknown', status: localText(t, 'Known place · unpriced', 'Место известно · без цены') };
  return { label: localText(t, 'Price needs verification', 'Цена требует проверки'), tone: 'unknown', status: t('price.unknown') };
}

function readableRawLabel(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function typeDisplay(type: string, t: (key: TranslationKey) => string) {
  const normalizedType = type.toLowerCase();
  const labels: Record<string, string> = {
    yes: localText(t, 'Parking', 'Парковка'),
    parking_space: localText(t, 'Parking space', 'Парковочное место'),
    street_meter: t('types.street'),
    offstreet_meter: t('types.offstreet'),
    garage: t('types.garage'),
    parking_garage: t('types.garage'),
    'multi-storey': t('types.garage'),
    underground: t('types.underground'),
    rooftop: localText(t, 'Rooftop parking', 'Парковка на крыше'),
    surface: t('types.lot'),
    surface_lot: t('types.lot'),
    parking_lot: t('types.lot'),
    lot: t('types.lot'),
    parking: t('types.parking'),
    residential_parking_zone: localText(t, 'Residential parking zone', 'Резидентская зона правил'),
    parking_area: t('types.area'),
    parking_entrance: t('types.entry'),
    entrance: t('types.entry'),
    valet: t('types.valet'),
    street_side: t('types.street'),
    street: t('types.street'),
    airport: t('types.airport'),
    event: t('types.event'),
    monthly: t('types.monthly'),
    private: t('types.private'),
    unknown: t('types.unknown'),
  };
  return labels[normalizedType] || readableRawLabel(type);
}

function popupHtml(feature: GeoJSON.Feature, t: (key: TranslationKey) => string) {
  const p = feature.properties || {};
  const name = htmlEscape(getString(p.name, t('facility.parkingFallback')));
  const type = htmlEscape(typeDisplay(getString(p.facility_type, 'unknown'), t));
  const price = priceDisplay(p, t);
  const charge = htmlEscape(price.label);
  const operator = htmlEscape(getString(p.operator, ''));
  const source = htmlEscape(getString(p.source_name, '') || getString(p.last_verified_source, ''));
  const dataAsOf = htmlEscape(getString(p.data_as_of, ''));
  const parkmobileZone = htmlEscape(getString(p.parkmobile_zone, ''));
  const paymentProvider = htmlEscape(getString(p.payment_provider, ''));
  const zoneType = htmlEscape(getString(p.zone_type, ''));
  const restrictedTime = htmlEscape(getString(p.restricted_res_time, ''));
  const confidence = getNumber(p.confidence);

  return `
    <div class="popup-title">${name}</div>
    <div class="popup-price price-${price.tone}">${charge}</div>
    <div class="popup-status">${htmlEscape(price.status)}</div>
    <div class="popup-row"><b>${t('map.popup.type')}</b><span>${type}</span></div>
    ${operator ? `<div class="popup-row"><b>${t('map.popup.operator')}</b><span>${operator}</span></div>` : ''}
    ${source ? `<div class="popup-row"><b>${t('map.popup.source')}</b><span>${source}</span></div>` : ''}
    ${zoneType ? `<div class="popup-row"><b>${localText(t, 'Zone type', 'Тип зоны')}</b><span>${zoneType}</span></div>` : ''}
    ${restrictedTime ? `<div class="popup-row"><b>${localText(t, 'Rule', 'Правило')}</b><span>${restrictedTime}</span></div>` : ''}
    ${parkmobileZone ? `<div class="popup-row"><b>${localText(t, 'ParkMobile zone', 'Зона ParkMobile')}</b><span>${parkmobileZone}</span></div>` : ''}
    ${paymentProvider ? `<div class="popup-row"><b>${localText(t, 'Payment providers', 'Провайдеры оплаты')}</b><span>${paymentProvider}</span></div>` : ''}
    ${dataAsOf ? `<div class="popup-row"><b>${t('map.popup.freshness')}</b><span>${dataAsOf.slice(0, 10)}</span></div>` : ''}
    ${
      confidence !== null
        ? `<div class="popup-row"><b>${t('map.popup.confidence')}</b><span>${Math.round(confidence * 100)}%</span></div>`
        : ''
    }
    <div class="popup-row"><b>${localText(t, 'Source link', 'Ссылка источника')}</b>${linkHtml(localText(t, 'Open source', 'Открыть источник'), p.source_url, localText(t, 'Not available', 'Недоступно'))}</div>
    <div class="popup-row"><b>${localText(t, 'Payment link', 'Ссылка оплаты')}</b>${linkHtml(localText(t, 'Open payment', 'Открыть оплату'), p.payment_url, localText(t, 'Not available', 'Недоступно'))}</div>
    <div class="popup-row"><b>${localText(t, 'Payment app', 'Приложение оплаты')}</b>${linkHtml(localText(t, 'Open app info', 'Открыть оплату'), p.payment_app_url, localText(t, 'Not available', 'Недоступно'))}</div>
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

function pointCollection(point: RouteCoordinate | null): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return point
    ? {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [point.lon, point.lat] },
            properties: {},
          },
        ],
      }
    : { type: 'FeatureCollection', features: [] };
}

export default function ParkingMap({
  activeCity,
  theme = 'light',
  displayMode,
  typeFilter,
  priceFilter,
  sourceFilter,
  trustFilter,
  confidenceFilter,
  searchQuery,
  onFacilitySelect,
  routeGeometry = null,
  userLocation = null,
  pickedStart = null,
  pickedDestination = null,
  droppedPin = null,
  mapPickMode = 'none',
  onMapPointPick,
  onMapLongPress,
  onMapInteractionStart,
  onMapInteractionEnd,
  onLayerCountsChange,
  onLayerStatusChange,
}: ParkingMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [facilities, setFacilities] = useState<FeatureCollection>(EMPTY_COLLECTION);
  const [segments, setSegments] = useState<FeatureCollection>(EMPTY_COLLECTION);
  const [zones, setZones] = useState<FeatureCollection>(EMPTY_COLLECTION);
  const [cityBoundary, setCityBoundary] = useState<FeatureCollection>(EMPTY_COLLECTION);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [layerLoadStatus, setLayerLoadStatus] = useState<Record<'facilities' | 'segments' | 'zones', LayerLoadStatus>>({
    facilities: 'loading',
    segments: 'loading',
    zones: 'loading',
  });
  const { formatNumber, t } = useLanguage();
  const tRef = useRef(t);
  const mapPickModeRef = useRef<MapPickMode>(mapPickMode);
  const onMapPointPickRef = useRef(onMapPointPick);
  const onMapLongPressRef = useRef(onMapLongPress);
  const onFacilitySelectRef = useRef(onFacilitySelect);
  const onMapInteractionStartRef = useRef(onMapInteractionStart);
  const onMapInteractionEndRef = useRef(onMapInteractionEnd);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  useEffect(() => {
    mapPickModeRef.current = mapPickMode;
  }, [mapPickMode]);

  useEffect(() => {
    onMapPointPickRef.current = onMapPointPick;
  }, [onMapPointPick]);

  useEffect(() => {
    onMapLongPressRef.current = onMapLongPress;
  }, [onMapLongPress]);

  useEffect(() => {
    onFacilitySelectRef.current = onFacilitySelect;
  }, [onFacilitySelect]);

  useEffect(() => {
    onMapInteractionStartRef.current = onMapInteractionStart;
  }, [onMapInteractionStart]);

  useEffect(() => {
    onMapInteractionEndRef.current = onMapInteractionEnd;
  }, [onMapInteractionEnd]);

  const activeCityConfig = CITIES[activeCity] || CITIES.miami;
  const activeCityNameKey = cityNameKey(activeCityConfig.id);
  const activeCityName = activeCityNameKey ? t(activeCityNameKey) : activeCityConfig.name;
  const hasCityData = activeCity === 'sf' || activeCity === 'miami';

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: CITIES.miami.center,
      zoom: CITIES.miami.zoom,
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
      setLoadError('');
      map.addSource('zones', { type: 'geojson', data: EMPTY_COLLECTION });
      map.addSource('review-zones', { type: 'geojson', data: EMPTY_COLLECTION });
      map.addSource('city-boundary', { type: 'geojson', data: EMPTY_COLLECTION });
      map.addSource('segments', { type: 'geojson', data: EMPTY_COLLECTION });
      map.addSource('reference-segments', { type: 'geojson', data: EMPTY_COLLECTION });
      map.addSource('facilities', { type: 'geojson', data: EMPTY_COLLECTION });
      map.addSource('review-facilities', { type: 'geojson', data: EMPTY_COLLECTION });
      map.addSource('parkingusa-route-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addSource('parkingusa-user-location-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addSource('parkingusa-picked-start-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addSource('parkingusa-picked-destination-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addSource('parkingusa-dropped-pin-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'zones-fill',
        type: 'fill',
        source: 'zones',
        paint: {
          'fill-color': statusColorExpression(),
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
        id: 'segments-line-casing',
        type: 'line',
        source: 'segments',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#312bdc',
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10,
            2.8,
            14,
            6.2,
            17,
            12,
            19,
            17,
          ],
          'line-opacity': 0.9,
        },
      });

      map.addLayer({
        id: 'segments-line',
        type: 'line',
        source: 'segments',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#93c5fd',
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10,
            1.4,
            14,
            3.5,
            17,
            8,
            19,
            12,
          ],
          'line-opacity': 0.72,
        },
      });

      map.addLayer({
        id: 'segments-zone-label',
        type: 'symbol',
        source: 'segments',
        minzoom: 15,
        layout: {
          'symbol-placement': 'line-center',
          'symbol-spacing': 120,
          'text-field': [
            'coalesce',
            ['get', 'parkmobile_zone'],
            ['get', 'field_payment_zone_location_id'],
            '',
          ],
          'text-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            15,
            10,
            17,
            13,
            19,
            15,
          ],
          'text-font': ['Noto Sans Bold'],
          'text-allow-overlap': false,
          'text-ignore-placement': false,
          'text-keep-upright': true,
          visibility: 'visible',
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#312bdc',
          'text-halo-width': 5,
          'text-halo-blur': 0.2,
        },
      });

      map.addLayer({
        id: 'reference-segments-line',
        type: 'line',
        source: 'reference-segments',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
          visibility: 'none',
        },
        paint: {
          'line-color': '#f59e0b',
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10,
            0.8,
            14,
            1.4,
            17,
            2.2,
            19,
            3,
          ],
          'line-opacity': 0.46,
          'line-dasharray': [1.4, 1.8],
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
          'circle-color': statusColorExpression(),
          'circle-stroke-color': [
            'case',
            ['==', ['get', 'enrichment_status'], 'conflict'],
            '#ef4444',
            ['==', ['get', 'enrichment_status'], 'needs_review'],
            '#f59e0b',
            '#0f172a',
          ],
          'circle-stroke-width': [
            'case',
            ['any', ['==', ['get', 'enrichment_status'], 'conflict'], ['==', ['get', 'enrichment_status'], 'needs_review']],
            2,
            1,
          ],
          'circle-opacity': 0.86,
          'circle-blur': 0.05,
        },
      });

      map.addLayer({
        id: 'city-boundary-casing',
        type: 'line',
        source: 'city-boundary',
        paint: {
          'line-color': '#ffffff',
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            5,
            3,
            10,
            5,
            16,
            7,
          ],
          'line-opacity': 0.9,
          'line-blur': 0.3,
        },
      });

      map.addLayer({
        id: 'city-boundary-line',
        type: 'line',
        source: 'city-boundary',
        paint: {
          'line-color': '#1f2937',
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            5,
            1,
            10,
            1.5,
            16,
            2,
          ],
          'line-opacity': 0.88,
          'line-dasharray': [5, 2.5],
        },
      });

      map.addLayer({
        id: 'review-zones-fill',
        type: 'fill',
        source: 'review-zones',
        minzoom: 12,
        paint: {
          'fill-color': '#f59e0b',
          'fill-opacity': 0.16,
        },
      });

      map.addLayer({
        id: 'review-zones-outline',
        type: 'line',
        source: 'review-zones',
        minzoom: 12,
        paint: {
          'line-color': '#d97706',
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            12,
            1.2,
            16,
            2.2,
            19,
            3,
          ],
          'line-opacity': 0.92,
          'line-dasharray': [2, 1.5],
        },
      });

      map.addLayer({
        id: 'review-facilities-circle',
        type: 'circle',
        source: 'review-facilities',
        minzoom: 13,
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            13,
            4,
            16,
            7,
            19,
            10,
          ],
          'circle-color': '#f59e0b',
          'circle-opacity': 0.28,
          'circle-stroke-color': '#f59e0b',
          'circle-stroke-width': 2.4,
          'circle-stroke-opacity': 0.9,
        },
      });

      map.addLayer(
        {
          id: 'facilities-glow',
          type: 'circle',
          source: 'facilities',
          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              10,
              4,
              14,
              8,
              17,
              13,
            ],
            'circle-color': statusColorExpression(),
            'circle-opacity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              10,
              0.14,
              17,
              0.26,
            ],
            'circle-blur': 0.85,
          },
        },
        'facilities-circle'
      );

      map.addLayer({
        id: 'parkingusa-route-glow-layer',
        type: 'line',
        source: 'parkingusa-route-source',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#22d3ee',
          'line-width': 11,
          'line-opacity': 0.2,
          'line-blur': 4,
        },
      });

      map.addLayer({
        id: 'parkingusa-route-line-layer',
        type: 'line',
        source: 'parkingusa-route-source',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#38bdf8',
          'line-width': 5,
          'line-opacity': 0.92,
        },
      });

      applyRasterTheme(map, theme);

      map.addLayer({
        id: 'parkingusa-user-location-layer',
        type: 'circle',
        source: 'parkingusa-user-location-source',
        paint: {
          'circle-radius': 7,
          'circle-color': '#22d3ee',
          'circle-stroke-color': '#f8fafc',
          'circle-stroke-width': 2,
          'circle-opacity': 0.95,
        },
      });

      map.addLayer({
        id: 'parkingusa-picked-start-layer',
        type: 'circle',
        source: 'parkingusa-picked-start-source',
        paint: {
          'circle-radius': 8,
          'circle-color': '#10b981',
          'circle-stroke-color': '#ecfeff',
          'circle-stroke-width': 2,
          'circle-opacity': 0.96,
        },
      });

      map.addLayer({
        id: 'parkingusa-picked-destination-layer',
        type: 'circle',
        source: 'parkingusa-picked-destination-source',
        paint: {
          'circle-radius': 8,
          'circle-color': '#f59e0b',
          'circle-stroke-color': '#fff7ed',
          'circle-stroke-width': 2,
          'circle-opacity': 0.96,
        },
      });

      map.addLayer({
        id: 'parkingusa-dropped-pin-glow',
        type: 'circle',
        source: 'parkingusa-dropped-pin-source',
        paint: {
          'circle-radius': 16,
          'circle-color': '#ef4444',
          'circle-opacity': 0.3,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#ef4444',
        },
      });

      map.addLayer({
        id: 'parkingusa-dropped-pin-layer',
        type: 'circle',
        source: 'parkingusa-dropped-pin-source',
        paint: {
          'circle-radius': 8,
          'circle-color': '#ef4444',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
          'circle-opacity': 0.95,
        },
      });

      let longPressTimeout: NodeJS.Timeout | null = null;
      let startPoint: { x: number; y: number } | null = null;
      let longPressCoordinate: maplibregl.LngLat | null = null;

      const startLongPress = (point: { x: number; y: number }, lngLat: maplibregl.LngLat) => {
        cancelLongPress();
        startPoint = point;
        longPressCoordinate = lngLat;
        longPressTimeout = setTimeout(() => {
          if (longPressCoordinate) {
            onMapLongPressRef.current?.({ lat: longPressCoordinate.lat, lon: longPressCoordinate.lng });
          }
          cancelLongPress();
        }, 600);
      };

      const cancelLongPress = () => {
        if (longPressTimeout) {
          clearTimeout(longPressTimeout);
          longPressTimeout = null;
        }
        startPoint = null;
        longPressCoordinate = null;
      };

      map.on('mousedown', (e) => {
        if (e.originalEvent.button !== 0) return;
        startLongPress({ x: e.point.x, y: e.point.y }, e.lngLat);
      });

      map.on('mousemove', (e) => {
        if (startPoint) {
          const dx = e.point.x - startPoint.x;
          const dy = e.point.y - startPoint.y;
          if (Math.sqrt(dx * dx + dy * dy) > 8) {
            cancelLongPress();
          }
        }
      });

      map.on('mouseup', () => {
        cancelLongPress();
      });

      map.on('touchstart', (e) => {
        if (e.points.length === 1) {
          startLongPress({ x: e.point.x, y: e.point.y }, e.lngLat);
        } else {
          cancelLongPress();
        }
      });

      map.on('touchmove', (e) => {
        if (startPoint) {
          const dx = e.point.x - startPoint.x;
          const dy = e.point.y - startPoint.y;
          if (Math.sqrt(dx * dx + dy * dy) > 10) {
            cancelLongPress();
          }
        }
      });

      map.on('touchend', () => {
        cancelLongPress();
      });

      map.on('click', (event) => {
        if (mapPickModeRef.current === 'none') return;
        onMapPointPickRef.current?.({ lat: event.lngLat.lat, lon: event.lngLat.lng });
      });

      const clickableLayers = ['facilities-circle', 'review-facilities-circle', 'zones-fill', 'review-zones-fill', 'segments-line', 'reference-segments-line'];
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

          if (mapPickModeRef.current !== 'none') {
            return;
          }

          onFacilitySelectRef.current(feature);
          const coords = sourcePoint(feature, event.lngLat);
          popupRef.current?.remove();
          popupRef.current = new maplibregl.Popup({
            closeButton: true,
            closeOnClick: true,
            maxWidth: '320px',
          })
            .setLngLat(coords)
            .setHTML(popupHtml(feature, tRef.current))
            .addTo(map);
        });
      });

      setIsReady(true);
    });

    map.on('error', (event) => {
      if (event?.error?.message) console.warn(event.error.message);
    });

    map.on('dragstart', () => {
      onMapInteractionStartRef.current?.();
    });

    map.on('dragend', () => {
      onMapInteractionEndRef.current?.();
    });

    map.on('zoomstart', () => {
      onMapInteractionStartRef.current?.();
    });

    map.on('zoomend', () => {
      onMapInteractionEndRef.current?.();
    });

    mapRef.current = map;

    return () => {
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
      setIsReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;
    applyRasterTheme(map, theme);
  }, [isReady, theme]);

  useEffect(() => {
    if (isReady) return;
    const timeout = window.setTimeout(() => {
      setLoadError(localText(tRef.current, 'MapLibre canvas is still initializing.', 'MapLibre canvas все еще инициализируется.'));
    }, 8_000);
    return () => window.clearTimeout(timeout);
  }, [isReady]);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setLoadError('');
    setLayerLoadStatus({
      facilities: 'loading',
      segments: 'loading',
      zones: 'loading',
    });

    const fetchLayer = async (
      key: 'facilities' | 'segments' | 'zones',
      url: string,
      setter: (collection: FeatureCollection) => void
    ) => {
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`${key} failed with ${response.status}`);
        const data = (await response.json()) as FeatureCollection;
        setter(data);
        setLayerLoadStatus((current) => ({ ...current, [key]: 'ready' }));
        return true;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return true;
        console.error(error);
        setter(EMPTY_COLLECTION);
        setLayerLoadStatus((current) => ({ ...current, [key]: 'error' }));
        return false;
      }
    };

    const fetchBoundary = async () => {
      try {
        const response = await fetch(`/api/geojson/boundary?city=${activeCity}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`boundary failed with ${response.status}`);
        setCityBoundary((await response.json()) as FeatureCollection);
        return true;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return true;
        console.error(error);
        setCityBoundary(EMPTY_COLLECTION);
        return false;
      }
    };

    Promise.all([
      fetchLayer('facilities', `/api/geojson/facilities?city=${activeCity}`, setFacilities),
      fetchLayer('segments', `/api/geojson/segments?city=${activeCity}`, setSegments),
      fetchLayer('zones', `/api/geojson/zones?city=${activeCity}`, setZones),
      fetchBoundary(),
    ])
      .then((results) => {
        if (results.some((ok) => !ok)) {
          setLoadError(localText(tRef.current, 'Some map layers did not load.', 'Часть слоев карты не загрузилась.'));
        }
      })
      .finally(() => setIsLoading(false));

    return () => controller.abort();
  }, [activeCity, loadAttempt]);

  const filteredFacilities = useMemo(() => {
    if (!hasCityData) return EMPTY_COLLECTION;
    return filterCollection(facilities, typeFilter, priceFilter, sourceFilter, trustFilter, confidenceFilter, searchQuery);
  }, [confidenceFilter, facilities, hasCityData, priceFilter, searchQuery, sourceFilter, trustFilter, typeFilter]);

  const reviewReferenceFacilities = useMemo(() => {
    if (!hasCityData || trustFilter === 'all' || trustFilter === 'review' || trustFilter === 'conflict') {
      return EMPTY_COLLECTION;
    }
    const candidates = filterCollection(
      facilities,
      typeFilter,
      priceFilter,
      sourceFilter,
      'review',
      confidenceFilter,
      searchQuery
    );
    return {
      type: 'FeatureCollection' as const,
      features: candidates.features.filter((feature) => {
        const properties = feature.properties || {};
        return needsParkingReview(properties) && !hasParkingConflict(properties);
      }),
    };
  }, [confidenceFilter, facilities, hasCityData, priceFilter, searchQuery, sourceFilter, trustFilter, typeFilter]);

  const filteredZones = useMemo(() => {
    if (!hasCityData) return EMPTY_COLLECTION;
    return filterCollection(zones, typeFilter, priceFilter, sourceFilter, trustFilter, confidenceFilter, searchQuery);
  }, [confidenceFilter, hasCityData, priceFilter, searchQuery, sourceFilter, trustFilter, typeFilter, zones]);

  const reviewReferenceZones = useMemo(() => {
    if (!hasCityData || trustFilter === 'all' || trustFilter === 'review' || trustFilter === 'conflict') {
      return EMPTY_COLLECTION;
    }
    const candidates = filterCollection(
      zones,
      typeFilter,
      priceFilter,
      sourceFilter,
      'review',
      confidenceFilter,
      searchQuery
    );
    return {
      type: 'FeatureCollection' as const,
      features: candidates.features.filter((feature) => {
        const properties = feature.properties || {};
        return needsParkingReview(properties) && !hasParkingConflict(properties) && !isRegulatoryZone(feature);
      }),
    };
  }, [confidenceFilter, hasCityData, priceFilter, searchQuery, sourceFilter, trustFilter, typeFilter, zones]);

  const visibleZones = useMemo(() => {
    if (displayMode === 'zones') return filteredZones;
    return parkingAreaZonesOnly(filteredZones);
  }, [displayMode, filteredZones]);

  const filteredSegments = useMemo(() => {
    if (!hasCityData) return EMPTY_COLLECTION;
    return filterCollection(segments, typeFilter, '', sourceFilter, trustFilter, confidenceFilter, searchQuery);
  }, [confidenceFilter, hasCityData, searchQuery, segments, sourceFilter, trustFilter, typeFilter]);

  const splitSegments = useMemo(() => splitParkingSegments(filteredSegments), [filteredSegments]);
  const visibleSegments = splitSegments.ordinary;
  const layerStatusItems = [
    {
      key: 'facilities',
      label: localText(t, 'facilities', 'объекты'),
      stateLabel: layerLoadStatus.facilities === 'ready' ? localText(t, 'Ready', 'Готово') : layerLoadStatus.facilities === 'error' ? localText(t, 'Error', 'Ошибка') : localText(t, 'Loading', 'Загрузка'),
      status: layerLoadStatus.facilities,
      count: filteredFacilities.features.length,
    },
    {
      key: 'segments',
      label: localText(t, 'curbs', 'бордюры'),
      stateLabel: layerLoadStatus.segments === 'ready' ? localText(t, 'Ready', 'Готово') : layerLoadStatus.segments === 'error' ? localText(t, 'Error', 'Ошибка') : localText(t, 'Loading', 'Загрузка'),
      status: layerLoadStatus.segments,
      count: splitSegments.ordinary.features.length + splitSegments.reference.features.length,
    },
    {
      key: 'zones',
      label: localText(t, 'zones', 'зоны'),
      stateLabel: layerLoadStatus.zones === 'ready' ? localText(t, 'Ready', 'Готово') : layerLoadStatus.zones === 'error' ? localText(t, 'Error', 'Ошибка') : localText(t, 'Loading', 'Загрузка'),
      status: layerLoadStatus.zones,
      count: visibleZones.features.length,
    },
  ];

  useEffect(() => {
    onLayerCountsChange?.({
      curbs: splitSegments.ordinary.features.length,
      reference: splitSegments.reference.features.length,
      zones: visibleZones.features.length,
      places: filteredFacilities.features.length,
    });
  }, [
    filteredFacilities.features.length,
    onLayerCountsChange,
    splitSegments.ordinary.features.length,
    splitSegments.reference.features.length,
    visibleZones.features.length,
  ]);

  useEffect(() => {
    onLayerStatusChange?.(layerLoadStatus);
  }, [layerLoadStatus, onLayerStatusChange]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;

    const sourceUpdates = [
      ['facilities', filteredFacilities],
      ['review-facilities', reviewReferenceFacilities],
      ['segments', splitSegments.ordinary],
      ['reference-segments', splitSegments.reference],
      ['zones', visibleZones],
      ['review-zones', reviewReferenceZones],
      ['city-boundary', cityBoundary],
    ] as const;

    for (const [sourceId, data] of sourceUpdates) {
      const source = map.getSource(sourceId);
      if (source && 'setData' in source) {
        (source as GeoJSONSource).setData(data);
      }
    }
  }, [cityBoundary, filteredFacilities, isReady, reviewReferenceFacilities, reviewReferenceZones, splitSegments, visibleZones]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;

    const showSegments = displayMode === 'all' || displayMode === 'segments' || displayMode === 'both';
    const showReferenceSegments = showSegments && (displayMode === 'segments' || trustFilter === 'review' || trustFilter === 'conflict' || confidenceFilter === 'review');
    const showZones = displayMode === 'all' || displayMode === 'both' || displayMode === 'zones';
    const showPoints = displayMode === 'all' || displayMode === 'points' || displayMode === 'both';

    setVisibility(map, 'segments-line', showSegments);
    setVisibility(map, 'segments-line-casing', showSegments);
    setVisibility(map, 'segments-zone-label', showSegments);
    setVisibility(map, 'reference-segments-line', showReferenceSegments);
    setVisibility(map, 'zones-fill', showZones);
    setVisibility(map, 'zones-outline', showZones);
    setVisibility(map, 'review-zones-fill', showZones);
    setVisibility(map, 'review-zones-outline', showZones);
    setVisibility(map, 'facilities-circle', showPoints);
    setVisibility(map, 'facilities-glow', showPoints);
    setVisibility(map, 'review-facilities-circle', showPoints);
  }, [confidenceFilter, displayMode, isReady, trustFilter]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;
    const source = map.getSource('parkingusa-route-source') as GeoJSONSource | undefined;
    if (!source) return;

    source.setData(
      routeGeometry
        ? { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: routeGeometry, properties: {} }] }
        : { type: 'FeatureCollection', features: [] }
    );
  }, [isReady, routeGeometry]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;
    const source = map.getSource('parkingusa-user-location-source') as GeoJSONSource | undefined;
    if (!source) return;

    source.setData(
      userLocation
        ? {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [userLocation.lon, userLocation.lat] },
                properties: {},
              },
            ],
          }
        : { type: 'FeatureCollection', features: [] }
    );
  }, [isReady, userLocation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;
    const source = map.getSource('parkingusa-picked-start-source') as GeoJSONSource | undefined;
    if (!source) return;

    source.setData(pointCollection(pickedStart));
  }, [isReady, pickedStart]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;
    const source = map.getSource('parkingusa-picked-destination-source') as GeoJSONSource | undefined;
    if (!source) return;

    source.setData(pointCollection(pickedDestination));
  }, [isReady, pickedDestination]);

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

  const showLoadingState = isLoading || !isReady || Boolean(loadError);

  return (
    <div ref={containerRef} className="parking-map">
      {showLoadingState && (
        <div className="loading-overlay">
          <div className="map-skeleton" aria-hidden="true">
            <span className="map-skeleton-marker marker-a" />
            <span className="map-skeleton-marker marker-b" />
            <span className="map-skeleton-marker marker-c" />
            <span className="map-skeleton-marker marker-d" />
          </div>
          <div className="map-loading-card" role={loadError ? 'alert' : 'status'}>
            <div className="map-loading-progress" />
            <strong>
              {loadError || localText(t, `Loading ${activeCityName} parking layers...`, `Загружаем парковочные слои ${activeCityName}...`)}
            </strong>
            <span>
              {loadError
                ? localText(t, 'Retry the request. If the database is unavailable, the API will keep using file fallback data.', 'Повторите запрос. Если база недоступна, API продолжит использовать file fallback.')
                : localText(t, 'Loading GeoJSON layers and preparing the MapLibre canvas.', 'Загружаем GeoJSON-слои и готовим MapLibre canvas.')}
            </span>
            <div className="map-loading-layer-status" aria-label={localText(t, 'Layer loading status', 'Статус загрузки слоев')}>
              {layerStatusItems.map((item) => (
                <span key={item.key} data-status={item.status}>
                  <b>{formatNumber(item.count)}</b>
                  {item.label}
                  <em>{item.stateLabel}</em>
                </span>
              ))}
            </div>
            {loadError && (
              <button
                className="map-loading-retry"
                type="button"
                onClick={() => setLoadAttempt((attempt) => attempt + 1)}
              >
                {localText(t, 'Retry', 'Повторить')}
              </button>
            )}
          </div>
        </div>
      )}

      {!hasCityData && (
        <div className="city-data-notice">
          <b>{activeCityName}</b>
          <span>{t('map.connectorPlanned')}</span>
        </div>
      )}
      <div className="qa-map-status" data-testid="route-layer-status">
        {routeGeometry ? 'rendered' : 'empty'}
      </div>
      <div className="qa-map-status" data-testid="user-location-layer-status">
        {userLocation ? 'rendered' : 'empty'}
      </div>
      <div className="qa-map-status" data-testid="picked-start-layer-status">
        {pickedStart ? 'rendered' : 'empty'}
      </div>
      <div className="qa-map-status" data-testid="picked-destination-layer-status">
        {pickedDestination ? 'rendered' : 'empty'}
      </div>
      <div className="qa-map-status" data-testid="map-pick-mode-status">
        {mapPickMode}
      </div>
    </div>
  );
}

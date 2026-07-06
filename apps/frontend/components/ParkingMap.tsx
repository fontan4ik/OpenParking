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
import { safeUrl } from '@/lib/data-quality';
import { cityNameKey, type TranslationKey } from '@/lib/i18n';
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
  displayMode: DisplayMode;
  typeFilter: string;
  priceFilter: string;
  sourceFilter: string;
  confidenceFilter: string;
  searchQuery: string;
  onFacilitySelect: (feature: Feature<Geometry, Record<string, unknown>>) => void;
  routeGeometry?: GeoJSON.LineString | null;
  userLocation?: RouteCoordinate | null;
  pickedStart?: RouteCoordinate | null;
  pickedDestination?: RouteCoordinate | null;
  mapPickMode?: MapPickMode;
  onMapPointPick?: (coordinate: RouteCoordinate) => void;
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
        'raster-saturation': -0.35,
        'raster-brightness-min': 0.72,
        'raster-brightness-max': 1,
        'raster-contrast': -0.08,
      },
    },
  ],
} as maplibregl.StyleSpecification;

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
  confidenceFilter: string,
  searchQuery: string
) {
  const properties = feature.properties || {};

  if (typeFilter && properties.facility_type !== typeFilter) return false;

  const priceStatus = getString(properties.price_status, 'unknown');
  const hasCanonicalKnownPrice = priceStatus === 'known_priced' || priceStatus === 'known_free';
  if (priceFilter === 'known' && !hasCanonicalKnownPrice) return false;
  if (priceFilter === 'unknown' && hasCanonicalKnownPrice) return false;

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

function popupHtml(feature: GeoJSON.Feature, t: (key: TranslationKey) => string) {
  const p = feature.properties || {};
  const name = htmlEscape(getString(p.name, t('facility.parkingFallback')));
  const type = htmlEscape(getString(p.facility_type, t('types.unknown')));
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
  displayMode,
  typeFilter,
  priceFilter,
  sourceFilter,
  confidenceFilter,
  searchQuery,
  onFacilitySelect,
  routeGeometry = null,
  userLocation = null,
  pickedStart = null,
  pickedDestination = null,
  mapPickMode = 'none',
  onMapPointPick,
}: ParkingMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [facilities, setFacilities] = useState<FeatureCollection>(EMPTY_COLLECTION);
  const [segments, setSegments] = useState<FeatureCollection>(EMPTY_COLLECTION);
  const [zones, setZones] = useState<FeatureCollection>(EMPTY_COLLECTION);
  const [isLoading, setIsLoading] = useState(true);
  const { formatNumber, t } = useLanguage();
  const tRef = useRef(t);
  const mapPickModeRef = useRef<MapPickMode>(mapPickMode);
  const onMapPointPickRef = useRef(onMapPointPick);
  const onFacilitySelectRef = useRef(onFacilitySelect);

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
    onFacilitySelectRef.current = onFacilitySelect;
  }, [onFacilitySelect]);

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
      map.addSource('zones', { type: 'geojson', data: EMPTY_COLLECTION });
      map.addSource('segments', { type: 'geojson', data: EMPTY_COLLECTION });
      map.addSource('reference-segments', { type: 'geojson', data: EMPTY_COLLECTION });
      map.addSource('facilities', { type: 'geojson', data: EMPTY_COLLECTION });
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
          'line-color': '#e0f2fe',
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10,
            2,
            14,
            5,
            17,
            10,
            19,
            15,
          ],
          'line-opacity': 0.72,
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
          'line-color': '#38bdf8',
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10,
            1.4,
            14,
            3.5,
            17,
            7.5,
            19,
            11,
          ],
          'line-opacity': 0.98,
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

      map.on('click', (event) => {
        if (mapPickModeRef.current === 'none') return;
        onMapPointPickRef.current?.({ lat: event.lngLat.lat, lon: event.lngLat.lng });
      });

      const clickableLayers = ['facilities-circle', 'zones-fill', 'segments-line', 'reference-segments-line'];
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

    mapRef.current = map;

    return () => {
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
      setIsReady(false);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);

    Promise.all([
      fetch(`/api/geojson/facilities?city=${activeCity}`, { signal: controller.signal }).then((r) => r.json()),
      fetch(`/api/geojson/segments?city=${activeCity}`, { signal: controller.signal }).then((r) => r.json()),
      fetch(`/api/geojson/zones?city=${activeCity}`, { signal: controller.signal }).then((r) => r.json()),
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
  }, [activeCity]);

  const filteredFacilities = useMemo(() => {
    if (!hasCityData) return EMPTY_COLLECTION;
    return filterCollection(facilities, typeFilter, priceFilter, sourceFilter, confidenceFilter, searchQuery);
  }, [confidenceFilter, facilities, hasCityData, priceFilter, searchQuery, sourceFilter, typeFilter]);

  const filteredZones = useMemo(() => {
    if (!hasCityData) return EMPTY_COLLECTION;
    return filterCollection(zones, typeFilter, priceFilter, sourceFilter, confidenceFilter, searchQuery);
  }, [confidenceFilter, hasCityData, priceFilter, searchQuery, sourceFilter, typeFilter, zones]);

  const visibleZones = useMemo(() => {
    if (displayMode === 'zones') return filteredZones;
    return parkingAreaZonesOnly(filteredZones);
  }, [displayMode, filteredZones]);

  const filteredSegments = useMemo(() => {
    if (!hasCityData) return EMPTY_COLLECTION;
    return filterCollection(segments, '', '', sourceFilter, confidenceFilter, '');
  }, [confidenceFilter, hasCityData, segments, sourceFilter]);

  const splitSegments = useMemo(() => splitParkingSegments(filteredSegments), [filteredSegments]);
  const visibleSegments = splitSegments.ordinary;

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;

    (map.getSource('facilities') as GeoJSONSource).setData(filteredFacilities);
    (map.getSource('segments') as GeoJSONSource).setData(splitSegments.ordinary);
    (map.getSource('reference-segments') as GeoJSONSource).setData(splitSegments.reference);
    (map.getSource('zones') as GeoJSONSource).setData(visibleZones);
  }, [filteredFacilities, isReady, splitSegments, visibleZones]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;

    const showSegments = displayMode === 'all' || displayMode === 'segments' || displayMode === 'both';
    const showReferenceSegments = showSegments && (displayMode === 'segments' || confidenceFilter === 'review');
    const showZones = displayMode === 'all' || displayMode === 'both' || displayMode === 'zones';
    const showPoints = displayMode === 'all' || displayMode === 'points' || displayMode === 'both';

    setVisibility(map, 'segments-line', showSegments);
    setVisibility(map, 'segments-line-casing', showSegments);
    setVisibility(map, 'reference-segments-line', showReferenceSegments);
    setVisibility(map, 'zones-fill', showZones);
    setVisibility(map, 'zones-outline', showZones);
    setVisibility(map, 'facilities-circle', showPoints);
  }, [confidenceFilter, displayMode, isReady]);

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
          {formatNumber(splitSegments.ordinary.features.length)} {t('map.curbs')}
        </div>
        <div
          className={`layer-toggle layer-toggle-reference ${displayMode === 'segments' ? 'active' : 'muted'}`}
          title={localText(
            t,
            'Reference/low-confidence regulatory evidence is hidden in the default view and shown dashed only in curb-only mode.',
            'Справочные/низкоуверенные regulatory evidence скрыты в обычном виде и показываются пунктиром только в режиме бордюров.'
          )}
        >
          <span className="layer-dot layer-dot-dashed" style={{ background: 'var(--accent-amber)' }} />
          {formatNumber(splitSegments.reference.features.length)} {localText(t, 'reference/review', 'справочные/проверка')}
        </div>
        <div className={`layer-toggle ${displayMode === 'all' || displayMode === 'both' || displayMode === 'zones' ? 'active' : ''}`}>
          <span className="layer-dot" style={{ background: 'var(--accent-blue)' }} />
          {formatNumber(visibleZones.features.length)} {t('map.zones')}
        </div>
        <div className={`layer-toggle ${displayMode === 'all' || displayMode === 'points' || displayMode === 'both' ? 'active' : ''}`}>
          <span className="layer-dot" style={{ background: 'var(--accent-amber)' }} />
          {formatNumber(filteredFacilities.features.length)} {t('map.places')}
        </div>
      </div>

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

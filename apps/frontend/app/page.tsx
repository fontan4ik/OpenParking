'use client';

/* ═══════════════════════════════════════════════════════════════
   ParkingUSA — Main Page
   Full-screen map with sidebar, filters, facility list
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import type { Feature, Geometry } from 'geojson';
import { useLanguage } from '@/components/LanguageProvider';
import { LOCALE_LABELS, LOCALES, cityNameKey, type Locale } from '@/lib/i18n';
import { safeUrl } from '@/lib/data-quality';
import {
  formatRouteSummary,
  resolveParkingDestination,
  type RouteCoordinate,
  type RouteError,
  type RouteSuccessResponse,
} from '@/lib/routing';
import { CITIES, type CityStats } from '@/lib/types';

// Dynamic import MapLibre to avoid SSR issues
const ParkingMap = dynamic(() => import('@/components/ParkingMap'), {
  ssr: false,
  loading: () => (
    <div className="loading-overlay">
      <div className="loading-spinner" />
    </div>
  ),
});

type FacilityFeature = Feature<Geometry, Record<string, unknown>>;

type DisplayMode = 'all' | 'segments' | 'zones' | 'points' | 'both';
type ConfidenceFilter = '' | 'high' | 'medium' | 'low' | 'review';
type PriceTone = 'priced' | 'free' | 'unknown' | 'variable' | 'stale' | 'review';
type UserLocationStatus = 'idle' | 'requesting' | 'geolocated' | 'manual' | 'unavailable';
type RouteStatus = 'idle' | 'requesting' | 'success' | 'error';
type MapPickMode = 'none' | 'start' | 'destination';

interface PriceDisplay {
  label: string;
  tone: PriceTone;
  statusLabel: string;
}

interface LinkDisplay {
  label: string;
  url: string;
}

function routeMessage(error: RouteError | undefined, uiText: (en: string, ru: string) => string): string {
  if (!error) return uiText('Routing failed. Please try again.', 'Не удалось построить маршрут. Попробуйте снова.');
  if (error.code === 'INVALID_COORDINATES') return uiText('Enter a valid start location.', 'Введите корректную стартовую точку.');
  if (error.code === 'INVALID_GEOMETRY') return uiText('Selected parking geometry cannot be routed.', 'Геометрию выбранной парковки нельзя использовать для маршрута.');
  if (error.code === 'ROUTE_TOO_LONG') return uiText('Route is too long for this MVP. Use a closer start point.', 'Маршрут слишком длинный для MVP. Выберите стартовую точку ближе.');
  if (error.code === 'ROUTE_TIMEOUT') return uiText('Routing timed out. Try again later.', 'Время ожидания маршрута истекло. Попробуйте позже.');
  if (error.code === 'ROUTE_SERVICE_UNAVAILABLE') return uiText('Routing service is unavailable.', 'Сервис маршрутизации недоступен.');
  if (error.code === 'NO_ROUTE') return uiText('No route was found for these points.', 'Для этих точек маршрут не найден.');
  return uiText('Routing service returned an invalid route.', 'Сервис маршрутизации вернул некорректный маршрут.');
}


export default function HomePage() {
  const [activeCity, setActiveCity] = useState('miami');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('both');
  const [typeFilter, setTypeFilter] = useState('');
  const [priceFilter, setPriceFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState<CityStats | null>(null);
  const [facilities, setFacilities] = useState<FacilityFeature[]>([]);
  const [selectedFacility, setSelectedFacility] = useState<FacilityFeature | null>(null);
  const [suggestedPrice, setSuggestedPrice] = useState('');
  const [suggestedRules, setSuggestedRules] = useState('');
  const [suggestedPaymentUrl, setSuggestedPaymentUrl] = useState('');
  const [suggestedEvidenceUrl, setSuggestedEvidenceUrl] = useState('');
  const [suggestionComment, setSuggestionComment] = useState('');
  const [suggestionStatus, setSuggestionStatus] = useState<'idle' | 'submitting' | 'submitted' | 'error'>('idle');
  const [suggestionMessage, setSuggestionMessage] = useState('');
  const [routeStatus, setRouteStatus] = useState<RouteStatus>('idle');
  const [routeResult, setRouteResult] = useState<RouteSuccessResponse | null>(null);
  const [routeError, setRouteError] = useState('');
  const [userLocation, setUserLocation] = useState<RouteCoordinate | null>(null);
  const [userLocationStatus, setUserLocationStatus] = useState<UserLocationStatus>('idle');
  const [pickedStart, setPickedStart] = useState<RouteCoordinate | null>(null);
  const [pickedDestination, setPickedDestination] = useState<RouteCoordinate | null>(null);
  const [mapPickMode, setMapPickMode] = useState<MapPickMode>('none');
  const [showManualStart, setShowManualStart] = useState(false);
  const [manualStartLat, setManualStartLat] = useState('');
  const [manualStartLon, setManualStartLon] = useState('');
  const [facilityTypes, setFacilityTypes] = useState<string[]>([]);
  const [sourceNames, setSourceNames] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routeAbortRef = useRef<AbortController | null>(null);
  const { locale, setLocale, t, formatNumber, formatDate } = useLanguage();
  const uiText = useCallback((en: string, ru: string) => (locale === 'ru' ? ru : en), [locale]);
  const selectedDestinationResult = useMemo(
    () => (selectedFacility ? resolveParkingDestination(selectedFacility.geometry) : null),
    [selectedFacility]
  );

  // Load stats
  useEffect(() => {
    fetch(`/api/stats?city=${activeCity}`)
      .then((r) => r.json())
      .then(setStats)
      .catch(console.error);
  }, [activeCity]);

  // Load facilities for the list
  useEffect(() => {
    setIsLoading(true);
    const params = new URLSearchParams();
    if (typeFilter) params.set('type', typeFilter);
    if (priceFilter) params.set('price', priceFilter);
    if (sourceFilter) params.set('source', sourceFilter);
    if (confidenceFilter) params.set('confidence', confidenceFilter);
    if (searchQuery) params.set('q', searchQuery);
    params.set('city', activeCity);
    params.set('limit', '200');

    fetch(`/api/facilities?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setFacilities(data.features || []);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, [activeCity, confidenceFilter, priceFilter, searchQuery, sourceFilter, typeFilter]);

  // Load facility types for filter dropdown
  useEffect(() => {
    fetch(`/api/facilities?city=${activeCity}&limit=50000`)
      .then((r) => r.json())
      .then((data) => {
        const types = [
          ...new Set(
            (data.features || []).map(
              (f: FacilityFeature) => (f.properties.facility_type as string) || 'unknown'
            )
          ),
        ] as string[];
        setFacilityTypes(types.sort());
        const sources = [
          ...new Set(
            (data.features || [])
              .map((f: FacilityFeature) =>
                ((f.properties.source_name || f.properties.last_verified_source) as string) || ''
              )
              .filter(Boolean)
          ),
        ] as string[];
        setSourceNames(sources.sort());
      })
      .catch(console.error);
  }, [activeCity]);

  const handleSearch = useCallback((value: string) => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setSearchQuery(value);
    }, 300);
  }, []);

  const resetRouteState = useCallback(() => {
    routeAbortRef.current?.abort();
    routeAbortRef.current = null;
    setRouteStatus('idle');
    setRouteResult(null);
    setRouteError('');
    setUserLocation(null);
    setUserLocationStatus('idle');
    setPickedStart(null);
    setPickedDestination(null);
    setMapPickMode('none');
    setShowManualStart(false);
    setManualStartLat('');
    setManualStartLon('');
  }, []);

  const resetRouteResult = useCallback(() => {
    routeAbortRef.current?.abort();
    routeAbortRef.current = null;
    setRouteStatus('idle');
    setRouteResult(null);
    setRouteError('');
  }, []);

  const handleFacilityClick = useCallback((facility: FacilityFeature) => {
    setSelectedFacility(facility);
    resetRouteState();
    setSuggestedPrice('');
    setSuggestedRules('');
    setSuggestedPaymentUrl('');
    setSuggestedEvidenceUrl('');
    setSuggestionComment('');
    setSuggestionStatus('idle');
    setSuggestionMessage('');
  }, [resetRouteState]);

  const requestRouteBetween = useCallback(async (start: RouteCoordinate, destination: RouteCoordinate) => {
    routeAbortRef.current?.abort();
    const controller = new AbortController();
    routeAbortRef.current = controller;
    setRouteStatus('requesting');
    setRouteResult(null);
    setRouteError('');

    try {
      const response = await fetch('/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start, destination, costing: 'auto' }),
        signal: controller.signal,
      });
      const body = (await response.json().catch(() => ({}))) as Partial<RouteSuccessResponse> & { error?: RouteError };
      if (!response.ok || body.error) {
        setRouteStatus('error');
        setRouteError(routeMessage(body.error, uiText));
        return;
      }

      if (body.geometry?.type !== 'LineString' || typeof body.distanceMeters !== 'number' || typeof body.durationSeconds !== 'number') {
        setRouteStatus('error');
        setRouteError(uiText('Routing service returned an invalid route.', 'Сервис маршрутизации вернул некорректный маршрут.'));
        return;
      }

      setRouteResult(body as RouteSuccessResponse);
      setRouteStatus('success');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setRouteStatus('error');
      setRouteError(uiText('Routing service is unavailable. Try manual coordinates or try again later.', 'Сервис маршрутизации недоступен. Попробуйте ручные координаты или повторите позже.'));
    }
  }, [uiText]);

  const requestRoute = useCallback(async (start: RouteCoordinate) => {
    if (!selectedFacility) return;
    const destinationResult = resolveParkingDestination(selectedFacility.geometry, start);
    if (!destinationResult.ok) {
      setRouteStatus('error');
      setRouteResult(null);
      setRouteError(routeMessage(destinationResult.error, uiText));
      return;
    }

    setUserLocation(start);
    await requestRouteBetween(start, destinationResult.destination);
  }, [requestRouteBetween, selectedFacility, uiText]);

  const showMyLocation = useCallback(() => {
    setRouteError('');

    if (!navigator.geolocation) {
      setUserLocationStatus('unavailable');
      return;
    }

    setUserLocationStatus('requesting');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({ lat: position.coords.latitude, lon: position.coords.longitude });
        setUserLocationStatus('geolocated');
      },
      () => {
        setUserLocationStatus('unavailable');
      },
      { enableHighAccuracy: true, timeout: 8_000, maximumAge: 60_000 }
    );
  }, []);

  const handleMapPointPick = useCallback((coordinate: RouteCoordinate) => {
    resetRouteResult();
    if (mapPickMode === 'start') {
      setPickedStart(coordinate);
      setMapPickMode('none');
      return;
    }
    if (mapPickMode === 'destination') {
      setPickedDestination(coordinate);
      setMapPickMode('none');
    }
  }, [mapPickMode, resetRouteResult]);

  const requestPointToPointRoute = useCallback(() => {
    const start = pickedStart ?? userLocation;

    if (!start || !pickedDestination) {
      setRouteStatus('error');
      setRouteResult(null);
      setRouteError(uiText('Pick a start or show your location, then pick a destination point on the map.', 'Выберите старт или покажите свое местоположение, затем выберите финиш на карте.'));
      return;
    }

    setMapPickMode('none');
    void requestRouteBetween(start, pickedDestination);
  }, [pickedDestination, pickedStart, requestRouteBetween, uiText, userLocation]);

  const startNavigation = useCallback(() => {
    if (!selectedFacility) return;
    setRouteError('');
    setRouteResult(null);
    setShowManualStart(false);

    if (pickedStart) {
      setUserLocationStatus('manual');
      void requestRoute(pickedStart);
      return;
    }

    if (!navigator.geolocation) {
      setUserLocationStatus('unavailable');
      setShowManualStart(true);
      return;
    }

    setUserLocationStatus('requesting');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const start = { lat: position.coords.latitude, lon: position.coords.longitude };
        setUserLocationStatus('geolocated');
        void requestRoute(start);
      },
      () => {
        setUserLocationStatus('unavailable');
        setShowManualStart(true);
        setRouteStatus('idle');
      },
      { enableHighAccuracy: true, timeout: 8_000, maximumAge: 60_000 }
    );
  }, [pickedStart, requestRoute, selectedFacility]);

  const submitManualStart = useCallback(() => {
    const lat = Number(manualStartLat);
    const lon = Number(manualStartLon);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
      setRouteStatus('error');
      setRouteError(uiText('Enter a valid latitude and longitude.', 'Введите корректные широту и долготу.'));
      return;
    }
    setUserLocationStatus('manual');
    void requestRoute({ lat, lon });
  }, [manualStartLat, manualStartLon, requestRoute, uiText]);

  const submitSuggestion = useCallback(async () => {
    if (!selectedFacility) return;
    const p = selectedFacility.properties;
    const source = getText(p, 'source_name') || getText(p, 'last_verified_source');
    const sourceId = getText(p, 'source_id');

    if (!source || !sourceId) {
      setSuggestionStatus('error');
      setSuggestionMessage(t('suggestion.noStableSource'));
      return;
    }

    if (!suggestedPrice && !suggestedRules && !suggestedPaymentUrl && !suggestedEvidenceUrl && !suggestionComment) {
      setSuggestionStatus('error');
      setSuggestionMessage(t('suggestion.empty'));
      return;
    }

    setSuggestionStatus('submitting');
    setSuggestionMessage('');

    const response = await fetch('/api/observations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parking_source_name: source,
        parking_source_id: sourceId,
        facility_name: getText(p, 'name') || 'Parking',
        city: CITIES[activeCity]?.name ?? activeCity,
        state: CITIES[activeCity]?.state ?? '',
        suggested_price: suggestedPrice,
        suggested_rules: suggestedRules,
        payment_url: suggestedPaymentUrl,
        evidence_url: suggestedEvidenceUrl,
        comment: suggestionComment,
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setSuggestionStatus('error');
      setSuggestionMessage(typeof body.error === 'string' ? body.error : t('suggestion.error'));
      return;
    }

    setSuggestionStatus('submitted');
    setSuggestionMessage(t('suggestion.success'));
    setSuggestedPrice('');
    setSuggestedRules('');
    setSuggestedPaymentUrl('');
    setSuggestedEvidenceUrl('');
    setSuggestionComment('');
  }, [activeCity, selectedFacility, suggestedEvidenceUrl, suggestedPaymentUrl, suggestedPrice, suggestedRules, suggestionComment, t]);

  const getBadgeClass = (type: string) => {
    const normalizedType = type.toLowerCase();
    if (normalizedType.includes('garage') || normalizedType.includes('multi') || normalizedType.includes('underground')) return 'badge-garage';
    if (normalizedType.includes('surface') || normalizedType.includes('lot')) return 'badge-surface';
    if (normalizedType.includes('street') || normalizedType.includes('meter') || normalizedType.includes('entrance')) return 'badge-street';
    if (normalizedType.includes('valet')) return 'badge-valet';
    return 'badge-unknown';
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      street_meter: t('types.street'),
      offstreet_meter: t('types.offstreet'),
      garage: t('types.garage'),
      'multi-storey': t('types.garage'),
      underground: t('types.underground'),
      surface: t('types.lot'),
      surface_lot: t('types.lot'),
      lot: t('types.lot'),
      parking: t('types.parking'),
      residential_parking_zone: uiText('Residential parking zone', 'Резидентская зона правил'),
      parking_area: t('types.area'),
      parking_entrance: t('types.entry'),
      valet: t('types.valet'),
      street_side: t('types.street'),
      airport: t('types.airport'),
      event: t('types.event'),
      monthly: t('types.monthly'),
      private: t('types.private'),
      unknown: t('types.unknown'),
    };
    return labels[type] || type;
  };

  const getConfidenceClass = (conf: number) => {
    if (conf >= 0.7) return 'confidence-high';
    if (conf >= 0.5) return 'confidence-medium';
    return 'confidence-low';
  };

  const getConfidenceLabel = (conf: number) => {
    if (conf >= 0.75) return t('confidence.high');
    if (conf >= 0.5) return t('confidence.medium');
    return t('confidence.review');
  };

  const getSourceBadgeClass = (source: string) => {
    const normalizedSource = source.toLowerCase();
    if (normalizedSource.includes('openstreetmap') || normalizedSource.includes('osm')) return 'osm';
    if (
      normalizedSource.includes('datasf') ||
      normalizedSource.includes('city') ||
      normalizedSource.includes('ladot') ||
      normalizedSource.includes('nyc') ||
      normalizedSource.includes('miami')
    ) {
      return 'city';
    }
    return '';
  };

  const getLocalizedCityName = (cityId: string, fallback: string) => {
    const key = cityNameKey(cityId);
    return key ? t(key) : fallback;
  };

  const getText = (p: Record<string, unknown>, key: string, fallback = '') => {
    const value = p[key];
    return typeof value === 'string' ? value : fallback;
  };
  const getValue = (p: Record<string, unknown>, key: string) => {
    const value = p[key];
    return typeof value === 'string' || typeof value === 'number' ? value : null;
  };

  const getCompletenessPercent = (value: number | undefined, total: number | undefined) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
    if (typeof total !== 'number' || !Number.isFinite(total) || total <= 0) return '—';
    return `${Math.round((value / total) * 100)}%`;
  };

  const getSafeLink = (p: Record<string, unknown>, key: string, label: string): LinkDisplay | null => {
    const value = p[key];
    if (typeof value !== 'string') return null;
    const url = safeUrl(value);
    return url ? { label, url } : null;
  };

  const formatPickedPoint = (point: RouteCoordinate | null) => {
    if (!point) return uiText('Not picked', 'Не выбрано');
    return `${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}`;
  };

  const formatPointRouteStart = () => {
    if (pickedStart) return formatPickedPoint(pickedStart);
    if (userLocation) return uiText(`Current location: ${formatPickedPoint(userLocation)}`, `Мое местоположение: ${formatPickedPoint(userLocation)}`);
    return uiText('Not picked', 'Не выбрано');
  };

  const getPointRouteStartLabel = () => {
    if (pickedStart) return uiText('Map-picked start', 'Старт выбран на карте');
    if (userLocation) return uiText('Current location', 'Мое местоположение');
    return uiText('Pick start or show location', 'Выберите старт или покажите местоположение');
  };

  const getPointRouteReadiness = () => {
    if (!(pickedStart || userLocation) && !pickedDestination) {
      return uiText('Pick a start and destination to build a route.', 'Выберите старт и финиш, чтобы построить маршрут.');
    }
    if (!(pickedStart || userLocation)) {
      return uiText('Start is missing: pick start or show your location.', 'Не хватает старта: выберите старт или покажите местоположение.');
    }
    if (!pickedDestination) {
      return uiText('Destination is missing: pick a finish point on the map.', 'Не хватает финиша: выберите точку финиша на карте.');
    }
    return pickedStart
      ? uiText('Ready: map-picked start to map-picked destination.', 'Готово: выбранный старт к выбранному финишу.')
      : uiText('Ready: current location to map-picked destination.', 'Готово: текущее местоположение к выбранному финишу.');
  };

  const getPointRouteActionLabel = () => {
    if (routeStatus === 'requesting') return uiText('Finding route...', 'Строим маршрут...');
    if (pickedStart && pickedDestination) return uiText('Route picked points', 'Маршрут между точками');
    if (userLocation && pickedDestination) return uiText('Route from my location', 'Маршрут от меня');
    return uiText('Route when ready', 'Построить когда готово');
  };

  const getPriceDisplay = (p: Record<string, unknown>): PriceDisplay => {
    const status = getText(p, 'price_status', 'unknown');
    const charge = getText(p, 'charge');
    const baseHourlyRate = getValue(p, 'base_hourly_rate');
    const baseHourlyRateMax = getValue(p, 'base_hourly_rate_max');
    const fee = getText(p, 'fee');

    if (status === 'known_free') {
      return { label: uiText('Free', 'Бесплатно'), tone: 'free', statusLabel: uiText('Known free', 'Точно бесплатно') };
    }

    if (status === 'known_priced') {
      const label = charge || (baseHourlyRate !== null ? `$${baseHourlyRate}/hr` : '') || (baseHourlyRateMax !== null ? `Up to $${baseHourlyRateMax}/hr` : '') || t('price.known');
      return { label, tone: 'priced', statusLabel: uiText('Known priced', 'Цена известна') };
    }

    if (status === 'paid_unknown') {
      return { label: uiText('Paid · amount unknown', 'Платно · сумма неизвестна'), tone: 'review', statusLabel: uiText('Needs verification', 'Нужна проверка') };
    }

    if (status === 'variable') {
      return { label: uiText('Variable price', 'Переменная цена'), tone: 'variable', statusLabel: uiText('Variable', 'Переменная') };
    }

    if (status === 'stale') {
      return { label: uiText('Price needs verification', 'Цена требует проверки'), tone: 'stale', statusLabel: uiText('Stale', 'Устарело') };
    }

    if (status === 'not_applicable') {
      return { label: uiText('Regulatory zone', 'Зона правил'), tone: 'unknown', statusLabel: uiText('Not a parking place', 'Не отдельная парковка') };
    }

    if (status === 'known_unpriced') {
      return { label: uiText('Price unknown', 'Цена неизвестна'), tone: 'unknown', statusLabel: uiText('Known place · unpriced', 'Место известно · без цены') };
    }

    if (fee && fee.toLowerCase() === 'yes') {
      return { label: uiText('Paid · amount unknown', 'Платно · сумма неизвестна'), tone: 'review', statusLabel: uiText('Needs verification', 'Нужна проверка') };
    }

    return { label: uiText('Price needs verification', 'Цена требует проверки'), tone: 'unknown', statusLabel: t('price.unknown') };
  };

  const getStatusDisplay = (status: string, fallback: string) => {
    const labels: Record<string, string> = {
      complete: uiText('Complete', 'Заполнено'),
      needs_price: uiText('Needs price', 'Нужна цена'),
      needs_rules: uiText('Needs rules', 'Нужны правила'),
      needs_payment_link: uiText('Needs payment link', 'Нужна ссылка на оплату'),
      needs_source_url: uiText('Needs source link', 'Нужна ссылка на источник'),
      needs_review: uiText('Needs review', 'Нужна проверка'),
      conflict: uiText('Conflict', 'Конфликт'),
      stale: uiText('Stale', 'Устарело'),
      known: uiText('Known', 'Известно'),
      partial: uiText('Partial', 'Частично'),
      unknown: t('types.unknown'),
      not_applicable: uiText('Not applicable', 'Не применимо'),
    };
    return labels[status] || fallback || t('types.unknown');
  };

  return (
    <div className="app-layout">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo-row">
            <div className="sidebar-logo">
              <div className="sidebar-logo-icon">🅿️</div>
              <div>
                <h1>{t('app.title')}</h1>
                <div className="sidebar-subtitle">
                  {t('app.subtitle')}
                </div>
              </div>
            </div>
            <div className="language-switcher" aria-label={t('language.label')}>
              {LOCALES.map((option: Locale) => {
                const label = LOCALE_LABELS[option];
                return (
                  <button
                    key={option}
                    type="button"
                    className={`language-option ${locale === option ? 'active' : ''}`}
                    onClick={() => setLocale(option)}
                    aria-label={`${t('language.switchTo')} ${label.nativeName}`}
                    aria-pressed={locale === option}
                  >
                    <span className="language-flag" aria-hidden="true">{label.flag}</span>
                    <span>{label.short}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value accent-blue animate-in">
              {stats ? formatNumber(stats.totalFacilities) : '—'}
            </div>
            <div className="stat-label">{t('stats.facilities')}</div>
          </div>
          <div className="stat-card">
            <div className="stat-value accent-emerald animate-in">
              {stats ? formatNumber(stats.pricedFacilities) : '—'}
            </div>
            <div className="stat-label">{t('stats.withPrice')}</div>
          </div>
          <div className="stat-card">
            <div className="stat-value accent-amber animate-in">
              {stats ? formatNumber(stats.curbSegments) : '—'}
            </div>
            <div className="stat-label">{t('stats.curbLines')}</div>
          </div>
          <div className="stat-card">
            <div className="stat-value accent-purple animate-in">
              {stats ? `${stats.coveragePercent}%` : '—'}
            </div>
            <div className="stat-label">{t('stats.coverage')}</div>
          </div>
        </div>

        {stats?.recordCompleteness && (
          <div className="completeness-panel">
            <div className="completeness-title">{uiText('Record completeness / provenance coverage', 'Полнота записей / покрытие источниками')}</div>
            <div className="completeness-row">
              <span>{uiText('Price known records', 'Записи с известной ценой')}</span>
              <b>{getCompletenessPercent(stats.recordCompleteness.priceKnownRecords, stats.recordCompleteness.totalKnownRecords)}</b>
            </div>
            <div className="completeness-row">
              <span>{uiText('Provenance coverage', 'Покрытие источниками')}</span>
              <b>{getCompletenessPercent(stats.recordCompleteness.sourceLinkedRecords, stats.recordCompleteness.totalKnownRecords)}</b>
            </div>
            <div className="completeness-row">
              <span>{uiText('Payment / booking links', 'Ссылки на оплату / бронь')}</span>
              <b>{getCompletenessPercent(stats.recordCompleteness.paymentOrBookingLinkedRecords, stats.recordCompleteness.totalKnownRecords)}</b>
            </div>
            <div className="completeness-row">
              <span>{uiText('Payment links', 'Ссылки на оплату')}</span>
              <b>{getCompletenessPercent(stats.recordCompleteness.paymentLinkedRecords, stats.recordCompleteness.totalKnownRecords)}</b>
            </div>
            <div className="completeness-row">
              <span>{uiText('Booking links', 'Ссылки на бронь')}</span>
              <b>{getCompletenessPercent(stats.recordCompleteness.bookingLinkedRecords, stats.recordCompleteness.totalKnownRecords)}</b>
            </div>
            <div className="completeness-badges">
              <span className="quality-chip confidence-medium">
                {formatNumber(stats.recordCompleteness.priceUnknownRecords)} {uiText('price unknown', 'цена неизвестна')}
              </span>
              <span className="quality-chip confidence-low">
                {formatNumber(stats.recordCompleteness.needsReviewRecords + stats.recordCompleteness.conflictRecords)} {uiText('review/conflict', 'проверка/конфликт')}
              </span>
            </div>
          </div>
        )}

        {/* City Selector */}
        <div className="city-selector">
          {Object.values(CITIES).map((city) => (
            <button
              key={city.id}
              className={`city-chip ${activeCity === city.id ? 'active' : ''}`}
              onClick={() => setActiveCity(city.id)}
            >
              {getLocalizedCityName(city.id, city.name)}
            </button>
          ))}
        </div>

        {stats?.data_status && stats.data_status !== 'ready' && (
          <div className="data-status-panel" role="status">
            <strong>
              {stats.data_status === 'unsupported'
                ? uiText('Unsupported city', 'Город не поддерживается')
                : uiText('Research-only data', 'Данные только для исследования')}
            </strong>
            <span>
              {stats.support_message || uiText(
                'No imported ParkingUSA layer is available for this city yet.',
                'Для этого города пока нет импортированного слоя ParkingUSA.'
              )}
            </span>
          </div>
        )}

        {/* Filters */}
        <div className="filters-section">
          <div className="filter-group">
            <label className="filter-label">{t('filters.displayMode')}</label>
            <select
              className="filter-select"
              value={displayMode}
              onChange={(e) => setDisplayMode(e.target.value as DisplayMode)}
            >
              <option value="all">{t('display.all')}</option>
              <option value="segments">{t('display.segments')}</option>
              <option value="zones">{t('display.zones')}</option>
              <option value="points">{t('display.points')}</option>
              <option value="both">{t('display.both')}</option>
            </select>
          </div>

          <div className="filter-group">
            <label className="filter-label">{t('filters.facilityType')}</label>
            <select
              className="filter-select"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="">{t('types.all')}</option>
              {facilityTypes.map((type) => (
                <option key={type} value={type}>
                  {getTypeLabel(type)} ({type})
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label className="filter-label">{t('filters.price')}</label>
            <select
              className="filter-select"
              value={priceFilter}
              onChange={(e) => setPriceFilter(e.target.value)}
            >
              <option value="">{t('price.all')}</option>
              <option value="known">{t('price.known')}</option>
              <option value="unknown">{t('price.unknown')}</option>
            </select>
          </div>

          <div className="filter-group">
            <label className="filter-label">{t('filters.source')}</label>
            <select
              className="filter-select"
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
            >
              <option value="">{t('source.all')}</option>
              {sourceNames.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label className="filter-label">{t('filters.confidence')}</label>
            <select
              className="filter-select"
              value={confidenceFilter}
              onChange={(e) => setConfidenceFilter(e.target.value as ConfidenceFilter)}
            >
              <option value="">{t('confidence.all')}</option>
              <option value="high">{t('confidence.highWithThreshold')}</option>
              <option value="medium">{t('confidence.mediumWithThreshold')}</option>
              <option value="low">{t('confidence.lowWithThreshold')}</option>
              <option value="review">{t('confidence.reviewWithThreshold')}</option>
            </select>
          </div>

          <div className="filter-group">
            <label className="filter-label">{t('filters.search')}</label>
            <input
              className="filter-input"
              placeholder={t('search.placeholder')}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Facility List */}
        <div className="facility-list">
          {facilities.slice(0, 50).map((f, idx) => {
            const p = f.properties;
            const type = (p.facility_type as string) || 'unknown';
            const confidence = (p.confidence as number) || 0.5;
            const priceDisplay = getPriceDisplay(p);
            const operator = getText(p, 'operator');
            const neighborhood = getText(p, 'neighborhood');
            const source = getText(p, 'source_name') || getText(p, 'last_verified_source');
            const freshness = formatDate(p.data_as_of);

            return (
              <div
                key={(p.source_id as string) || idx}
                className="facility-card"
                data-type={type}
                onClick={() => handleFacilityClick(f)}
              >
                <div className="facility-card-header">
                  <div className="facility-name">
                    {(p.name as string) || t('facility.parkingFallback')}
                  </div>
                  <span className={`facility-type-badge ${getBadgeClass(type)}`}>
                    {getTypeLabel(type)}
                  </span>
                </div>
                <div className="facility-meta">
                  <span className={`facility-meta-item facility-price ${priceDisplay.tone}`}>
                    {priceDisplay.label}
                  </span>
                  {operator && (
                    <span className="facility-meta-item">
                      {operator}
                    </span>
                  )}
                  {neighborhood && (
                    <span className="facility-meta-item">
                      {neighborhood}
                    </span>
                  )}
                </div>
                <div className="facility-quality-row">
                  <span className={`source-badge ${getSourceBadgeClass(source)}`}>
                    {source || t('facility.unknownSource')}
                  </span>
                  <span className={`quality-chip ${getConfidenceClass(confidence)}`}>
                    {getConfidenceLabel(confidence)} {Math.round(confidence * 100)}%
                  </span>
                  <span className={`quality-chip price-status-${priceDisplay.tone}`}>
                    {priceDisplay.statusLabel}
                  </span>
                  {freshness && <span className="freshness-chip">{freshness}</span>}
                </div>
                <div className="confidence-bar">
                  <div
                    className={`confidence-fill ${getConfidenceClass(confidence)}`}
                    style={{ width: `${confidence * 100}%` }}
                  />
                </div>
              </div>
            );
          })}
          {facilities.length === 0 && !isLoading && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
              {t('facility.noMatches')}
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="legend">
          <div className="legend-title">{t('legend.title')}</div>
          <div className="legend-items">
            <div className="legend-item">
              <div className="legend-dot" style={{ background: 'var(--accent-blue)', color: 'var(--accent-blue)' }} />
              {uiText('Known priced', 'Цена известна')}
            </div>
            <div className="legend-item">
              <div className="legend-dot" style={{ background: 'var(--accent-emerald)', color: 'var(--accent-emerald)' }} />
              {uiText('Known free', 'Точно бесплатно')}
            </div>
            <div className="legend-item">
              <div className="legend-dot" style={{ background: 'var(--text-muted)', color: 'var(--text-muted)' }} />
              {uiText('Known place, price unknown', 'Место известно, цена неизвестна')}
            </div>
            <div className="legend-item">
              <div className="legend-dot" style={{ background: 'var(--accent-amber)', color: 'var(--accent-amber)' }} />
              {uiText('Paid unknown / variable', 'Платно неизвестно / переменная')}
            </div>
            <div className="legend-item">
              <div className="legend-line" style={{ background: 'var(--accent-red)' }} />
              {uiText('Stale', 'Устарело')}
            </div>
            <div className="legend-item">
              <div className="legend-dot legend-dot-review" />
              {uiText('Review / conflict', 'Проверка / конфликт')}
            </div>
          </div>
        </div>
      </aside>

      {/* ── Map ── */}
      <main className="map-container">
        <ParkingMap
          activeCity={activeCity}
          displayMode={displayMode}
          typeFilter={typeFilter}
          priceFilter={priceFilter}
          sourceFilter={sourceFilter}
          confidenceFilter={confidenceFilter}
          searchQuery={searchQuery}
          onFacilitySelect={handleFacilityClick}
          routeGeometry={routeResult?.geometry ?? null}
          userLocation={userLocation}
          pickedStart={pickedStart}
          pickedDestination={pickedDestination}
          mapPickMode={mapPickMode}
          onMapPointPick={handleMapPointPick}
        />

        <div className="route-map-panel" aria-label={uiText('Map navigation controls', 'Управление навигацией на карте')}>
          <div className="route-map-panel-title">{uiText('Navigation', 'Навигация')}</div>
          <p className="route-map-panel-help">
            {uiText('Show your location, then click the map to pick route endpoints.', 'Покажите свое местоположение, затем выберите точки маршрута на карте.')}
          </p>
          <div className="route-map-actions">
            <button
              className="route-map-button"
              type="button"
              data-testid="show-my-location"
              onClick={showMyLocation}
              disabled={userLocationStatus === 'requesting'}
            >
              {userLocationStatus === 'requesting' ? uiText('Locating...', 'Ищем...') : uiText('Show my location', 'Мое местоположение')}
            </button>
            <button
              className={`route-map-button ${mapPickMode === 'start' ? 'active' : ''}`}
              type="button"
              data-testid="pick-start-on-map"
              onClick={() => setMapPickMode((mode) => (mode === 'start' ? 'none' : 'start'))}
            >
              {uiText('Pick start', 'Выбрать старт')}
            </button>
            <button
              className={`route-map-button ${mapPickMode === 'destination' ? 'active' : ''}`}
              type="button"
              data-testid="pick-destination-on-map"
              onClick={() => setMapPickMode((mode) => (mode === 'destination' ? 'none' : 'destination'))}
            >
              {uiText('Pick destination', 'Выбрать финиш')}
            </button>
          </div>
          <div className="picked-point-grid">
            <div className="picked-point-status route-readiness-status">
              <span>{uiText('Start source', 'Источник старта')}</span>
              <strong data-testid="route-start-source-status">{getPointRouteStartLabel()}</strong>
            </div>
            <div className="picked-point-status">
              <span>{uiText('Start', 'Старт')}</span>
              <strong data-testid="picked-start-status">{formatPointRouteStart()}</strong>
            </div>
            <div className="picked-point-status">
              <span>{uiText('Destination', 'Финиш')}</span>
              <strong data-testid="picked-destination-status">{formatPickedPoint(pickedDestination)}</strong>
            </div>
          </div>
          <div className="route-readiness-note" data-testid="route-readiness-status">
            {getPointRouteReadiness()}
          </div>
          <button
            className="route-map-button route-map-primary"
            type="button"
            data-testid="route-point-to-point"
            onClick={requestPointToPointRoute}
            disabled={routeStatus === 'requesting' || !(pickedStart || userLocation) || !pickedDestination}
          >
            {getPointRouteActionLabel()}
          </button>
          {routeResult && (
            <div className="route-summary-card">
              <strong>{formatRouteSummary(routeResult.distanceMeters, routeResult.durationSeconds)}</strong>
              <span>{routeResult.attribution}</span>
            </div>
          )}
          {routeError && (
            <div className="route-error">
              {routeError}
            </div>
          )}
          {(routeResult || routeError || userLocation || pickedStart || pickedDestination || mapPickMode !== 'none') && (
            <button className="route-clear" type="button" data-testid="clear-route-points" onClick={resetRouteState}>
              {uiText('Clear route and points', 'Очистить маршрут и точки')}
            </button>
          )}
        </div>

        {/* Detail panel */}
        {selectedFacility && (
          <div className={`detail-panel ${selectedFacility ? 'open' : ''}`}>
            {(() => {
              const p = selectedFacility.properties;
              const baseHourlyRate = getValue(p, 'base_hourly_rate');
              const operator = getText(p, 'operator');
              const access = getText(p, 'access');
              const capacity = getValue(p, 'capacity');
              const openingHours = getText(p, 'opening_hours');
              const eventRate = getText(p, 'event_rate');
              const maximumTime = getText(p, 'maximum_time');
              const parkmobileZone = getText(p, 'parkmobile_zone');
              const paymentProvider = getText(p, 'payment_provider');
              const paymentNote = getText(p, 'payment_note');
              const zoneName = getText(p, 'zone_name');
              const zoneType = getText(p, 'zone_type');
              const restrictedTime = getText(p, 'restricted_res_time');
              const restrictions = getText(p, 'restrictions');
              const evCharging = getText(p, 'ev_charging');
              const street = getText(p, 'street');
              const neighborhood = getText(p, 'neighborhood');
              const source = getText(p, 'source_name') || getText(p, 'last_verified_source');
              const sourceId = getText(p, 'source_id');
              const dataAsOf = formatDate(p.data_as_of);
              const confidence = (p.confidence as number) || 0.5;
              const priceDisplay = getPriceDisplay(p);
              const priceStatus = getText(p, 'price_status', 'unknown');
              const ruleStatus = getText(p, 'rule_status', 'unknown');
              const enrichmentStatus = getText(p, 'enrichment_status', 'needs_review');
              const sourceLink = getSafeLink(p, 'source_url', uiText('Open source', 'Открыть источник'));
              const evidenceLink = getSafeLink(p, 'evidence_url', uiText('Open evidence', 'Открыть доказательство'));
              const paymentLink = getSafeLink(p, 'payment_url', uiText('Open payment', 'Открыть оплату'));
              const paymentAppLink = getSafeLink(p, 'payment_app_url', uiText('Open payment app', 'Открыть приложение оплаты'));
              const bookingLink = getSafeLink(p, 'booking_url', uiText('Open booking', 'Открыть бронь'));

              return (
                <>
                  <div className="detail-header">
                    <div>
                      <div className="popup-title">
                        {(selectedFacility.properties.name as string) || t('facility.parkingFallback')}
                      </div>
                      <span className={`facility-type-badge ${getBadgeClass(
                        (selectedFacility.properties.facility_type as string) || 'unknown'
                      )}`}>
                        {getTypeLabel((selectedFacility.properties.facility_type as string) || 'unknown')}
                      </span>
                    </div>
                    <button
                      className="detail-close"
                      onClick={() => {
                        setSelectedFacility(null);
                        resetRouteState();
                      }}
                    >
                      ✕
                    </button>
                  </div>
                  <div className="detail-body">
                    <div className="detail-section">
                      <div className="detail-section-title">{t('detail.pricing')}</div>
                      <div className={`popup-price price-${priceDisplay.tone}`}>
                        {priceDisplay.label}
                      </div>
                      <div className="status-chip-row">
                        <span className={`quality-chip price-status-${priceDisplay.tone}`}>
                          {priceDisplay.statusLabel}
                        </span>
                      </div>
                      {baseHourlyRate !== null && (
                        <div className="detail-field">
                          <span className="detail-field-label">{t('detail.baseHourly')}</span>
                          <span className="detail-field-value">
                            ${baseHourlyRate}/hr
                          </span>
                        </div>
                      )}
                      <div className="detail-field">
                        <span className="detail-field-label">{t('detail.fee')}</span>
                        <span className="detail-field-value">
                          {(selectedFacility.properties.fee as string) || t('types.unknown')}
                        </span>
                      </div>
                      <div className="detail-field">
                        <span className="detail-field-label">{uiText('Price status', 'Статус цены')}</span>
                        <span className="detail-field-value">
                          {getStatusDisplay(priceStatus, priceStatus)}
                        </span>
                      </div>
                      {eventRate && eventRate.toLowerCase() !== 'none' && eventRate.toLowerCase() !== 'n/a' && (
                        <div className="detail-field">
                          <span className="detail-field-label">{uiText('Event rate', 'Цена на события')}</span>
                          <span className="detail-field-value">{eventRate}</span>
                        </div>
                      )}
                      {maximumTime && (
                        <div className="detail-field">
                          <span className="detail-field-label">{uiText('Maximum time', 'Максимальное время')}</span>
                          <span className="detail-field-value">{maximumTime}</span>
                        </div>
                      )}
                      {parkmobileZone && (
                        <div className="detail-field">
                          <span className="detail-field-label">{uiText('ParkMobile zone', 'Зона ParkMobile')}</span>
                          <span className="detail-field-value">{parkmobileZone}</span>
                        </div>
                      )}
                      {paymentProvider && (
                        <div className="detail-field">
                          <span className="detail-field-label">{uiText('Payment providers', 'Провайдеры оплаты')}</span>
                          <span className="detail-field-value">{paymentProvider}</span>
                        </div>
                      )}
                      {paymentNote && (
                        <div className="detail-field">
                          <span className="detail-field-label">{uiText('Payment note', 'Примечание оплаты')}</span>
                          <span className="detail-field-value">{paymentNote}</span>
                        </div>
                      )}
                      {zoneType && (
                        <div className="detail-field">
                          <span className="detail-field-label">{uiText('Zone type', 'Тип зоны')}</span>
                          <span className="detail-field-value">{zoneType}</span>
                        </div>
                      )}
                      {restrictedTime && (
                        <div className="detail-field">
                          <span className="detail-field-label">{uiText('Restricted time', 'Время/режим')}</span>
                          <span className="detail-field-value">{restrictedTime}</span>
                        </div>
                      )}
                    </div>

                    <div className="detail-section">
                      <div className="detail-section-title">{t('detail.details')}</div>
                      {operator && (
                        <div className="detail-field">
                          <span className="detail-field-label">{t('detail.operator')}</span>
                          <span className="detail-field-value">
                            {operator}
                          </span>
                        </div>
                      )}
                      {access && (
                        <div className="detail-field">
                          <span className="detail-field-label">{t('detail.access')}</span>
                          <span className="detail-field-value">
                            {access}
                          </span>
                        </div>
                      )}
                      {capacity !== null && (
                        <div className="detail-field">
                          <span className="detail-field-label">{t('detail.capacity')}</span>
                          <span className="detail-field-value">
                            {capacity}
                          </span>
                        </div>
                      )}
                      {evCharging && evCharging.toLowerCase() !== 'n/a' && (
                        <div className="detail-field">
                          <span className="detail-field-label">{uiText('EV charging', 'Зарядка EV')}</span>
                          <span className="detail-field-value">{evCharging}</span>
                        </div>
                      )}
                      {openingHours && (
                        <div className="detail-field">
                          <span className="detail-field-label">{t('detail.hours')}</span>
                          <span className="detail-field-value">
                            {openingHours}
                          </span>
                        </div>
                      )}
                      {street && (
                        <div className="detail-field">
                          <span className="detail-field-label">{t('detail.street')}</span>
                          <span className="detail-field-value">
                            {street}
                          </span>
                        </div>
                      )}
                      {neighborhood && (
                        <div className="detail-field">
                          <span className="detail-field-label">{t('detail.neighborhood')}</span>
                          <span className="detail-field-value">
                            {neighborhood}
                          </span>
                        </div>
                      )}
                      {zoneName && (
                        <div className="detail-field">
                          <span className="detail-field-label">{uiText('Residential zone', 'Резидентская зона')}</span>
                          <span className="detail-field-value">{zoneName}</span>
                        </div>
                      )}
                      {restrictions && (
                        <div className="detail-field">
                          <span className="detail-field-label">{uiText('Restrictions', 'Ограничения')}</span>
                          <span className="detail-field-value">{restrictions}</span>
                        </div>
                      )}
                    </div>

                    <div className="detail-section">
                      <div className="detail-section-title">{t('detail.dataQuality')}</div>
                      <div className="detail-field">
                        <span className="detail-field-label">{t('detail.confidence')}</span>
                        <span className="detail-field-value">
                          {getConfidenceLabel(confidence)} · {Math.round(confidence * 100)}%
                        </span>
                      </div>
                      <div className="confidence-bar" style={{ marginTop: '8px' }}>
                        <div
                          className={`confidence-fill ${getConfidenceClass(
                            confidence
                          )}`}
                          style={{
                            width: `${confidence * 100}%`,
                          }}
                        />
                      </div>
                      {source && (
                        <div className="detail-field" style={{ marginTop: '8px' }}>
                          <span className="detail-field-label">{t('detail.source')}</span>
                          <span className={`source-badge ${getSourceBadgeClass(source)}`}>
                            {source}
                          </span>
                        </div>
                      )}
                      {dataAsOf && (
                        <div className="detail-field">
                          <span className="detail-field-label">{t('detail.dataAsOf')}</span>
                          <span className="detail-field-value">
                            {dataAsOf}
                          </span>
                        </div>
                      )}
                      <div className="detail-field">
                        <span className="detail-field-label">{uiText('Rule status', 'Статус правил')}</span>
                        <span className="detail-field-value">
                          {getStatusDisplay(ruleStatus, ruleStatus)}
                        </span>
                      </div>
                      <div className="detail-field">
                        <span className="detail-field-label">{uiText('Enrichment status', 'Статус обогащения')}</span>
                        <span className="detail-field-value">
                          {getStatusDisplay(enrichmentStatus, enrichmentStatus)}
                        </span>
                      </div>
                      {sourceId && (
                        <div className="detail-field">
                          <span className="detail-field-label">{t('detail.sourceId')}</span>
                          <span className="detail-field-value" style={{ fontSize: '11px' }}>
                            {sourceId}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="detail-section route-section">
                      <div className="detail-section-title">{uiText('Navigation', 'Навигация')}</div>
                      <p className="detail-help-text">
                        {uiText(
                          'Route from a picked start point, your current location, or a manual latitude/longitude start point. No location is saved.',
                          'Постройте маршрут от выбранного старта, текущего местоположения или ручной широты/долготы. Местоположение не сохраняется.'
                        )}
                      </p>
                      <div className="route-status-row">
                        <span className="detail-field-label">{uiText('Start', 'Старт')}</span>
                        <span className="detail-field-value" data-testid="user-location-status">
                          {userLocationStatus}
                        </span>
                      </div>
                      {selectedDestinationResult?.ok ? (
                        <button
                          className="suggestion-submit route-primary-action"
                          type="button"
                          data-testid="navigate-to-parking"
                          onClick={startNavigation}
                          disabled={routeStatus === 'requesting'}
                        >
                          {routeStatus === 'requesting' || userLocationStatus === 'requesting'
                            ? uiText('Finding route...', 'Строим маршрут...')
                            : uiText('Navigate to parking', 'Маршрут к парковке')}
                        </button>
                      ) : (
                        <div className="route-error" data-testid="route-error">
                          {uiText('Selected parking geometry cannot be routed.', 'Геометрию выбранной парковки нельзя использовать для маршрута.')}
                        </div>
                      )}
                      {showManualStart && (
                        <div className="manual-start-grid">
                          <input
                            className="suggestion-input"
                            data-testid="manual-start-lat"
                            value={manualStartLat}
                            onChange={(event) => setManualStartLat(event.target.value)}
                            placeholder={uiText('Start latitude', 'Широта старта')}
                            inputMode="decimal"
                          />
                          <input
                            className="suggestion-input"
                            data-testid="manual-start-lon"
                            value={manualStartLon}
                            onChange={(event) => setManualStartLon(event.target.value)}
                            placeholder={uiText('Start longitude', 'Долгота старта')}
                            inputMode="decimal"
                          />
                          <button className="suggestion-submit" type="button" onClick={submitManualStart} disabled={routeStatus === 'requesting'}>
                            {uiText('Use manual start', 'Использовать ручной старт')}
                          </button>
                        </div>
                      )}
                      {routeResult && (
                        <div className="route-summary-card" data-testid="route-summary">
                          <strong>{formatRouteSummary(routeResult.distanceMeters, routeResult.durationSeconds)}</strong>
                          <span>{routeResult.attribution}</span>
                        </div>
                      )}
                      {routeError && (
                        <div className="suggestion-message error" data-testid="route-error">
                          {routeError}
                        </div>
                      )}
                      {(routeResult || routeError || userLocation) && (
                        <button className="route-clear" type="button" data-testid="clear-route" onClick={resetRouteState}>
                          {uiText('Clear route', 'Очистить маршрут')}
                        </button>
                      )}
                    </div>

                    <div className="detail-section">
                      <div className="detail-section-title">{uiText('Links', 'Ссылки')}</div>
                      <div className="detail-link-grid">
                        {[
                          { key: 'source', label: uiText('Source', 'Источник'), link: sourceLink },
                          { key: 'evidence', label: uiText('Evidence', 'Доказательство'), link: evidenceLink },
                          { key: 'payment', label: uiText('Payment', 'Оплата'), link: paymentLink },
                          { key: 'payment-app', label: uiText('Payment app', 'Приложение оплаты'), link: paymentAppLink },
                          { key: 'booking', label: uiText('Booking', 'Бронь'), link: bookingLink },
                        ].map((item) => (
                          <div className="detail-field" key={item.key}>
                            <span className="detail-field-label">{item.label}</span>
                            {item.link ? (
                              <a
                                className="detail-safe-link"
                                href={item.link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {item.link.label}
                              </a>
                            ) : (
                              <span className="detail-field-value unavailable">
                                {uiText('Not available', 'Недоступно')}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="detail-section">
                      <div className="detail-section-title">{t('detail.suggestTitle')}</div>
                      <p className="detail-help-text">
                        {t('detail.suggestHelp')}
                      </p>
                      <input
                        className="suggestion-input"
                        value={suggestedPrice}
                        onChange={(event) => setSuggestedPrice(event.target.value)}
                        placeholder={t('suggestion.pricePlaceholder')}
                        disabled={suggestionStatus === 'submitting'}
                      />
                      <input
                        className="suggestion-input"
                        value={suggestedRules}
                        onChange={(event) => setSuggestedRules(event.target.value)}
                        placeholder={t('suggestion.rulesPlaceholder')}
                        disabled={suggestionStatus === 'submitting'}
                      />
                      <input
                        className="suggestion-input"
                        value={suggestedPaymentUrl}
                        onChange={(event) => setSuggestedPaymentUrl(event.target.value)}
                        placeholder={t('suggestion.paymentPlaceholder')}
                        disabled={suggestionStatus === 'submitting'}
                      />
                      <input
                        className="suggestion-input"
                        value={suggestedEvidenceUrl}
                        onChange={(event) => setSuggestedEvidenceUrl(event.target.value)}
                        placeholder={t('suggestion.evidencePlaceholder')}
                        disabled={suggestionStatus === 'submitting'}
                      />
                      <textarea
                        className="suggestion-input suggestion-textarea"
                        value={suggestionComment}
                        onChange={(event) => setSuggestionComment(event.target.value)}
                        placeholder={t('suggestion.commentPlaceholder')}
                        disabled={suggestionStatus === 'submitting'}
                      />
                      <button
                        className="suggestion-submit"
                        type="button"
                        onClick={submitSuggestion}
                        disabled={suggestionStatus === 'submitting'}
                      >
                        {suggestionStatus === 'submitting' ? t('suggestion.saving') : t('suggestion.submit')}
                      </button>
                      {suggestionMessage && (
                        <div className={`suggestion-message ${suggestionStatus}`}>
                          {suggestionMessage}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </main>
    </div>
  );
}

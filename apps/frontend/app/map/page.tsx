'use client';

/* ═══════════════════════════════════════════════════════════════
   OpenParking — Main App
   Full-screen map with sidebar, filters, facility list
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useRef, useMemo, type CSSProperties, type MouseEvent, type PointerEvent, type TouchEvent } from 'react';
import dynamic from 'next/dynamic';
import type { Feature, Geometry } from 'geojson';
import { useLanguage } from '@/components/LanguageProvider';
import { LOCALE_LABELS, LOCALES, cityNameKey, type Locale } from '@/lib/i18n';
import { FlagIcon } from '@/components/FlagIcon';
import {
  driverConfidence,
  matchesTrustFilter,
  safeUrl,
  trustLabel,
  trustRank,
  type TrustFilter,
} from '@/lib/data-quality';
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
      <div className="map-skeleton" aria-hidden="true">
        <span className="map-skeleton-marker marker-a" />
        <span className="map-skeleton-marker marker-b" />
        <span className="map-skeleton-marker marker-c" />
      </div>
      <div className="map-loading-card" role="status">
        <div className="map-loading-progress" />
        <strong>Loading parking map...</strong>
        <span>Preparing MapLibre canvas and local fallback layers.</span>
      </div>
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
type ThemeMode = 'light' | 'dark';
type WorkspaceMode = 'find' | 'quality';
type SortMode = 'recommended' | 'trust' | 'price' | 'actionable' | 'review';

interface LayerCounts {
  curbs: number;
  reference: number;
  zones: number;
  places: number;
}

interface LayerLoadState {
  facilities: 'loading' | 'ready' | 'error';
  segments: 'loading' | 'ready' | 'error';
  zones: 'loading' | 'ready' | 'error';
}

interface PriceDisplay {
  label: string;
  tone: PriceTone;
  statusLabel: string;
}

interface LinkDisplay {
  label: string;
  url: string;
}

function OpenParkingLogo() {
  return (
    <img 
      src="/brand/openparking-mark.svg" 
      className="openparking-logo-mark" 
      alt="OpenParking" 
      width="42" 
      height="42" 
    />
  );
}

function ThemeSwitch({ theme, onChange, label }: { theme: ThemeMode; onChange: (theme: ThemeMode) => void; label: string }) {
  return (
    <label className="theme-switch" aria-label={label} title={label}>
      <input
        className="theme-switch__checkbox"
        type="checkbox"
        checked={theme === 'dark'}
        onChange={(event) => onChange(event.target.checked ? 'dark' : 'light')}
      />
      <span className="theme-switch__container" aria-hidden="true">
        <span className="theme-switch__clouds" />
        <span className="theme-switch__stars-container">
          <svg viewBox="0 0 144 55" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M135.831 3.00688C135.055 3.85027 134.111 4.29946 133 4.35447C134.111 4.40947 135.055 4.85867 135.831 5.71123C136.607 6.55462 136.996 7.56303 136.996 8.72727C136.996 7.56303 137.384 6.55462 138.16 5.71123C138.936 4.85867 139.88 4.40947 141 4.35447C139.88 4.29946 138.936 3.85027 138.16 3.00688C137.384 2.15432 136.996 1.14591 136.996 0C136.996 1.14591 136.607 2.15432 135.831 3.00688Z" fill="currentColor" />
            <path d="M31 23.3545C32.1114 23.2995 33.0551 22.8503 33.8313 21.9977C34.6075 21.1543 34.9956 20.1459 34.9956 19C34.9956 20.1459 35.3837 21.1543 36.1599 21.9977C36.9361 22.8503 37.8798 23.2995 39 23.3545C37.8798 23.4095 36.9361 23.8587 36.1599 24.7112C35.3837 25.5546 34.9956 26.563 34.9956 27.7273C34.9956 26.563 34.6075 25.5546 33.8313 24.7112C33.0551 23.8587 32.1114 23.4095 31 23.3545Z" fill="currentColor" />
            <circle cx="76" cy="17" r="2" fill="currentColor" />
            <circle cx="99" cy="38" r="2" fill="currentColor" />
          </svg>
        </span>
        <span className="theme-switch__circle-container">
          <span className="theme-switch__sun-moon-container">
            <span className="theme-switch__moon">
              <span className="theme-switch__spot" />
              <span className="theme-switch__spot" />
              <span className="theme-switch__spot" />
            </span>
          </span>
        </span>
      </span>
    </label>
  );
}

function CompactThemeButton({ theme, onChange, label }: { theme: ThemeMode; onChange: (theme: ThemeMode) => void; label: string }) {
  const nextTheme = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      className={`mobile-theme-toggle mobile-theme-toggle-${theme}`}
      type="button"
      aria-label={label}
      aria-pressed={theme === 'dark'}
      title={label}
      onClick={() => onChange(nextTheme)}
    >
      {theme === 'dark' ? (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M20.2 14.6A7.7 7.7 0 0 1 9.4 3.8 8.4 8.4 0 1 0 20.2 14.6Z" />
        </svg>
      )}
    </button>
  );
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
  const [theme, setTheme] = useState<ThemeMode>('light');
  const [themeHydrated, setThemeHydrated] = useState(false);
  const [activeCity, setActiveCity] = useState('miami');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('both');
  const [typeFilter, setTypeFilter] = useState('');
  const [priceFilter, setPriceFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [trustFilter, setTrustFilter] = useState<TrustFilter>('likely');
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>('');
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('find');
  const [sortMode, setSortMode] = useState<SortMode>('recommended');
  const [searchInput, setSearchInput] = useState('');
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
  const [mapLayerCounts, setMapLayerCounts] = useState<LayerCounts>({ curbs: 0, reference: 0, zones: 0, places: 0 });
  const [mapLayerStatus, setMapLayerStatus] = useState<LayerLoadState>({
    facilities: 'loading',
    segments: 'loading',
    zones: 'loading',
  });
  const [routePanelExpanded, setRoutePanelExpanded] = useState(false);
  const [mobileSheetCollapsed, setMobileSheetCollapsed] = useState(false);
  const [mobileSheetMapPeeking, setMobileSheetMapPeeking] = useState(false);
  const [mobileSheetDragOffset, setMobileSheetDragOffset] = useState(0);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routeAbortRef = useRef<AbortController | null>(null);
  const facilityListRef = useRef<HTMLDivElement | null>(null);
  const mobileSheetPeekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mobileSheetPointerStartYRef = useRef<number | null>(null);
  const mobileSheetMouseStartYRef = useRef<number | null>(null);
  const mobileSheetTouchStartYRef = useRef<number | null>(null);
  const mobileSheetSuppressClickRef = useRef(false);
  const { locale, setLocale, t, formatNumber, formatDate } = useLanguage();
  const uiText = useCallback((en: string, ru: string) => (locale === 'ru' ? ru : en), [locale]);
  const selectedDestinationResult = useMemo(
    () => (selectedFacility ? resolveParkingDestination(selectedFacility.geometry) : null),
    [selectedFacility]
  );

  useEffect(() => {
    const stored = window.localStorage.getItem('openparking-theme');
    const resolvedTheme = stored === 'light' || stored === 'dark' ? stored : 'light';
    document.documentElement.dataset.theme = resolvedTheme;
    setTheme(resolvedTheme);
    setThemeHydrated(true);
  }, []);

  useEffect(() => {
    if (!themeHydrated) return;
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('openparking-theme', theme);
  }, [theme, themeHydrated]);

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
    if (trustFilter) params.set('trust', trustFilter);
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
  }, [activeCity, confidenceFilter, priceFilter, searchQuery, sourceFilter, trustFilter, typeFilter]);

  useEffect(() => {
    facilityListRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    if (typeof window !== 'undefined' && window.innerWidth > 900 && (searchQuery || workspaceMode === 'quality')) {
      facilityListRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }, [searchQuery, workspaceMode, trustFilter, sortMode]);

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
    setSearchInput(value);
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
    setRoutePanelExpanded(false);
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
    setRoutePanelExpanded(true);
    void requestRouteBetween(start, pickedDestination);
  }, [pickedDestination, pickedStart, requestRouteBetween, uiText, userLocation]);

  const startNavigation = useCallback(() => {
    if (!selectedFacility) return;
    setRouteError('');
    setRouteResult(null);
    setShowManualStart(false);
    setRoutePanelExpanded(true);

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

  const readableRawLabel = (value: string) =>
    value
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());

  const getTypeLabel = (type: string) => {
    const normalizedType = type.toLowerCase();
    const labels: Record<string, string> = {
      yes: uiText('Parking', 'Парковка'),
      parking_space: uiText('Parking space', 'Парковочное место'),
      street_meter: t('types.street'),
      offstreet_meter: t('types.offstreet'),
      garage: t('types.garage'),
      parking_garage: t('types.garage'),
      'multi-storey': t('types.garage'),
      underground: t('types.underground'),
      rooftop: uiText('Rooftop parking', 'Парковка на крыше'),
      surface: t('types.lot'),
      surface_lot: t('types.lot'),
      parking_lot: t('types.lot'),
      lot: t('types.lot'),
      parking: t('types.parking'),
      residential_parking_zone: uiText('Residential parking zone', 'Резидентская зона правил'),
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
  };

  const getFeeLabel = (fee: string) => {
    const normalizedFee = fee.toLowerCase();
    if (normalizedFee === 'yes') return uiText('Paid', 'Платная');
    if (normalizedFee === 'no') return uiText('No fee reported', 'Плата не указана');
    if (normalizedFee === 'free') return uiText('Free', 'Бесплатно');
    return getStatusDisplay(fee, readableRawLabel(fee));
  };

  const getAccessLabel = (accessValue: string) => {
    const normalizedAccess = accessValue.toLowerCase();
    const labels: Record<string, string> = {
      yes: uiText('Public access', 'Публичный доступ'),
      public: uiText('Public access', 'Публичный доступ'),
      customers: uiText('Customers only', 'Только для клиентов'),
      customers_only: uiText('Customers only', 'Только для клиентов'),
      private: t('types.private'),
      permit: uiText('Permit only', 'Только по разрешению'),
      no: uiText('No public access', 'Нет публичного доступа'),
      destination: uiText('Destination parking', 'Парковка у объекта'),
      unknown: t('types.unknown'),
    };
    return labels[normalizedAccess] || readableRawLabel(accessValue);
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
      known_priced: uiText('Known priced', 'Цена известна'),
      known_free: uiText('Known free', 'Точно бесплатно'),
      known_unpriced: uiText('Known place, price unknown', 'Место известно, цена неизвестна'),
      paid_unknown: uiText('Paid, amount unknown', 'Платно, сумма неизвестна'),
      partial: uiText('Partial', 'Частично'),
      unknown: t('types.unknown'),
      not_applicable: uiText('Not applicable', 'Не применимо'),
    };
    return labels[status] || fallback || t('types.unknown');
  };

  const trustOptions: Array<{ value: TrustFilter; label: string; hint: string }> = [
    {
      value: 'reliable',
      label: uiText('Reliable', 'Надежные'),
      hint: uiText('Verified offers, 75%+ confidence', 'Проверенные предложения, 75%+'),
    },
    {
      value: 'likely',
      label: uiText('More options', 'Больше вариантов'),
      hint: uiText('Likely public parking, 60%+', 'Вероятные парковки, 60%+'),
    },
    {
      value: 'all',
      label: uiText('All candidates', 'Все кандидаты'),
      hint: uiText('Coverage baseline without conflicts', 'База покрытия без конфликтов'),
    },
    {
      value: 'review',
      label: uiText('Needs review', 'На проверку'),
      hint: uiText('Low confidence or stale data', 'Низкое доверие или устарело'),
    },
    {
      value: 'conflict',
      label: uiText('Conflicts', 'Конфликты'),
      hint: uiText('Not ordinary parking or disputed', 'Не обычная парковка или спорно'),
    },
  ];

  const visibleTrustOptions = workspaceMode === 'quality'
    ? [
        ...trustOptions.filter((option) => option.value === 'review' || option.value === 'conflict'),
        ...trustOptions.filter((option) => option.value !== 'review' && option.value !== 'conflict'),
      ]
    : trustOptions;

  const priceOptions = [
    { value: '', label: t('price.all') },
    { value: 'known', label: t('price.known') },
    { value: 'free', label: uiText('Free', 'Бесплатно') },
    { value: 'unknown', label: t('price.unknown') },
  ];

  const typeOptions = [
    { value: '', label: t('types.all') },
    { value: 'garage', label: uiText('Garage', 'Гараж') },
    { value: 'surface_lot', label: uiText('Surface lot', 'Открытая площадка') },
    { value: 'street_meter', label: uiText('Street meter', 'Уличный паркомат') },
    { value: 'valet', label: t('types.valet') },
  ];

  const desktopMapShortcuts = [
    {
      key: 'garage',
      marker: 'P',
      label: uiText('Garages', 'Гаражи'),
      tone: 'blue',
      active: typeFilter === 'garage',
      action: () => {
        setTypeFilter('garage');
        setDisplayMode('points');
        setTrustFilter('likely');
      },
    },
    {
      key: 'surface_lot',
      marker: 'P',
      label: uiText('Lots', 'Площадки'),
      tone: 'green',
      active: typeFilter === 'surface_lot',
      action: () => {
        setTypeFilter('surface_lot');
        setDisplayMode('zones');
        setTrustFilter('likely');
      },
    },
    {
      key: 'street_meter',
      marker: '$',
      label: uiText('Meters', 'Паркоматы'),
      tone: 'amber',
      active: typeFilter === 'street_meter',
      action: () => {
        setTypeFilter('street_meter');
        setDisplayMode('points');
        setTrustFilter('likely');
      },
    },
    {
      key: 'known_price',
      marker: '$',
      label: uiText('Known price', 'Цена есть'),
      tone: 'cyan',
      active: priceFilter === 'known',
      action: () => {
        setPriceFilter('known');
        setSortMode('price');
        setWorkspaceMode('find');
      },
    },
    {
      key: 'review',
      marker: '!',
      label: uiText('Review', 'Проверка'),
      tone: 'red',
      active: workspaceMode === 'quality',
      action: () => {
        setWorkspaceMode('quality');
        setTrustFilter('review');
        setConfidenceFilter('review');
        setSortMode('review');
        setDisplayMode('segments');
      },
    },
  ];

  const hasActionLink = (p: Record<string, unknown>) =>
    Boolean(
      getSafeLink(p, 'payment_url', 'payment') ||
      getSafeLink(p, 'booking_url', 'booking') ||
      getSafeLink(p, 'payment_app_url', 'payment app')
    );

  const hasKnownPriceRecord = (p: Record<string, unknown>) => {
    const status = getText(p, 'price_status');
    return status === 'known_priced' || status === 'known_free';
  };

  const getTrustDisplay = (p: Record<string, unknown>) => {
    const label = trustLabel(p);
    const labels: Record<TrustFilter, string> = {
      reliable: uiText('Verified', 'Проверено'),
      likely: uiText('Likely', 'Вероятно'),
      all: uiText('Candidate', 'Кандидат'),
      review: uiText('Needs review', 'Нужна проверка'),
      conflict: uiText('Conflict', 'Конфликт'),
    };
    return { label, text: labels[label] };
  };

  const sortedFacilities = useMemo(() => {
    const list = facilities.filter((feature) => matchesTrustFilter(feature.properties || {}, trustFilter));

    return [...list].sort((a, b) => {
      const ap = a.properties || {};
      const bp = b.properties || {};
      const trustDiff = trustRank(bp) - trustRank(ap);
      const confidenceDiff = driverConfidence(bp) - driverConfidence(ap);
      const actionDiff = Number(hasActionLink(bp)) - Number(hasActionLink(ap));
      const priceDiff = Number(hasKnownPriceRecord(bp)) - Number(hasKnownPriceRecord(ap));

      if (sortMode === 'trust') return confidenceDiff || trustDiff || priceDiff || actionDiff;
      if (sortMode === 'price') return priceDiff || trustDiff || confidenceDiff || actionDiff;
      if (sortMode === 'actionable') return actionDiff || trustDiff || priceDiff || confidenceDiff;
      if (sortMode === 'review') return trustRank(ap) - trustRank(bp) || driverConfidence(ap) - driverConfidence(bp);

      return trustDiff || actionDiff || priceDiff || confidenceDiff;
    });
  }, [facilities, sortMode, trustFilter]);

  const datasetTotal = stats
    ? stats.totalFacilities + stats.curbSegments + stats.zones
    : null;
  const visibleOnMapTotal = mapLayerCounts.curbs + mapLayerCounts.reference + mapLayerCounts.zones + mapLayerCounts.places;
  const mapLayersSettled = Object.values(mapLayerStatus).every((status) => status === 'ready' || status === 'error');
  const matchedLabel = searchQuery
    ? uiText('Matched by search', 'Найдено поиском')
    : uiText('Current list', 'Текущий список');
  const layerScopeItems = [
    { label: uiText('Dataset total', 'Всего в датасете'), value: datasetTotal },
    { label: uiText('Visible on map', 'Видно на карте'), value: mapLayersSettled ? visibleOnMapTotal : uiText('Loading', 'Загрузка') },
    { label: matchedLabel, value: isLoading ? uiText('Loading', 'Загрузка') : sortedFacilities.length },
  ];
  const totalKnownRecords = stats?.recordCompleteness?.totalKnownRecords ?? 0;
  const missingPaymentRecords = stats?.recordCompleteness
    ? Math.max(0, totalKnownRecords - stats.recordCompleteness.paymentOrBookingLinkedRecords)
    : 0;
  const qualityActions = stats?.recordCompleteness
    ? [
        {
          key: 'review',
          label: uiText('Needs review', 'Нужна проверка'),
          value: stats.recordCompleteness.needsReviewRecords,
          tone: 'review',
          action: () => {
            setWorkspaceMode('quality');
            setTrustFilter('review');
            setConfidenceFilter('review');
            setSortMode('review');
            setDisplayMode('segments');
          },
        },
        {
          key: 'conflict',
          label: uiText('Conflicts', 'Конфликты'),
          value: stats.recordCompleteness.conflictRecords,
          tone: 'conflict',
          action: () => {
            setWorkspaceMode('quality');
            setTrustFilter('conflict');
            setConfidenceFilter('review');
            setSortMode('review');
            setDisplayMode('segments');
          },
        },
        {
          key: 'payment',
          label: uiText('Missing payment', 'Нет ссылки оплаты'),
          value: missingPaymentRecords,
          tone: 'payment',
          action: () => {
            setWorkspaceMode('quality');
            setTrustFilter('all');
            setConfidenceFilter('');
            setSortMode('actionable');
            setDisplayMode('both');
          },
        },
      ]
    : [];
  const routePanelHasContext = Boolean(
    routeResult ||
    routeError ||
    userLocation ||
    pickedStart ||
    pickedDestination ||
    mapPickMode !== 'none' ||
    routeStatus !== 'idle'
  );
  const routePanelOpen = routePanelExpanded || routePanelHasContext;
  const mobileSheetLabel = mobileSheetCollapsed
    ? uiText('Show filters', 'Показать фильтры')
    : uiText('Hide filters', 'Скрыть фильтры');
  const mobileThemeLabel = theme === 'dark'
    ? uiText('Switch to light theme', 'Включить светлую тему')
    : uiText('Switch to dark theme', 'Включить темную тему');
  const mobileSheetStyle = {
    '--mobile-sheet-drag-y': `${mobileSheetDragOffset}px`,
  } as CSSProperties;

  const clearMobileSheetPeekTimer = useCallback(() => {
    if (!mobileSheetPeekTimerRef.current) return;
    clearTimeout(mobileSheetPeekTimerRef.current);
    mobileSheetPeekTimerRef.current = null;
  }, []);

  useEffect(() => clearMobileSheetPeekTimer, [clearMobileSheetPeekTimer]);

  const cancelMobileSheetMapPeek = useCallback(() => {
    clearMobileSheetPeekTimer();
    setMobileSheetMapPeeking(false);
  }, [clearMobileSheetPeekTimer]);

  const handleMapInteractionStart = useCallback(() => {
    if (typeof window === 'undefined' || window.innerWidth > 900 || mobileSheetCollapsed) return;
    clearMobileSheetPeekTimer();
    setMobileSheetMapPeeking(true);
  }, [clearMobileSheetPeekTimer, mobileSheetCollapsed]);

  const handleMapInteractionEnd = useCallback(() => {
    if (typeof window === 'undefined' || window.innerWidth > 900) return;
    clearMobileSheetPeekTimer();
    mobileSheetPeekTimerRef.current = setTimeout(() => {
      setMobileSheetMapPeeking(false);
      mobileSheetPeekTimerRef.current = null;
    }, 850);
  }, [clearMobileSheetPeekTimer]);

  const finishMobileSheetDrag = useCallback((startY: number | null, endY: number) => {
    cancelMobileSheetMapPeek();
    setMobileSheetDragOffset(0);
    if (startY === null) return;

    const deltaY = endY - startY;
    if (Math.abs(deltaY) < 32) return;

    mobileSheetSuppressClickRef.current = true;
    setMobileSheetCollapsed(deltaY > 0);
  }, [cancelMobileSheetMapPeek]);
  const previewMobileSheetDrag = useCallback((startY: number | null, currentY: number) => {
    if (startY === null) return;

    cancelMobileSheetMapPeek();
    const deltaY = currentY - startY;
    if (Math.abs(deltaY) > 4) {
      mobileSheetSuppressClickRef.current = true;
    }

    const dragOffset = mobileSheetCollapsed
      ? Math.max(Math.min(deltaY, 0), -86)
      : Math.min(Math.max(deltaY, 0), 160);
    setMobileSheetDragOffset(dragOffset);
  }, [cancelMobileSheetMapPeek, mobileSheetCollapsed]);
  const handleMobileSheetPointerDown = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    cancelMobileSheetMapPeek();
    mobileSheetPointerStartYRef.current = event.clientY;
    mobileSheetSuppressClickRef.current = false;
    setMobileSheetDragOffset(0);
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [cancelMobileSheetMapPeek]);
  const handleMobileSheetPointerMove = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    previewMobileSheetDrag(mobileSheetPointerStartYRef.current, event.clientY);
  }, [previewMobileSheetDrag]);
  const handleMobileSheetPointerUp = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    const startY = mobileSheetPointerStartYRef.current;
    mobileSheetPointerStartYRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    finishMobileSheetDrag(startY, event.clientY);
  }, [finishMobileSheetDrag]);
  const handleMobileSheetPointerCancel = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    mobileSheetPointerStartYRef.current = null;
    setMobileSheetDragOffset(0);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);
  const handleMobileSheetMouseDown = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    cancelMobileSheetMapPeek();
    mobileSheetMouseStartYRef.current = event.clientY;
    mobileSheetSuppressClickRef.current = false;
    setMobileSheetDragOffset(0);
  }, [cancelMobileSheetMapPeek]);
  const handleMobileSheetMouseMove = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    previewMobileSheetDrag(mobileSheetMouseStartYRef.current, event.clientY);
  }, [previewMobileSheetDrag]);
  const handleMobileSheetMouseUp = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    const startY = mobileSheetMouseStartYRef.current;
    mobileSheetMouseStartYRef.current = null;
    finishMobileSheetDrag(startY, event.clientY);
  }, [finishMobileSheetDrag]);
  const handleMobileSheetTouchStart = useCallback((event: TouchEvent<HTMLButtonElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    cancelMobileSheetMapPeek();
    mobileSheetTouchStartYRef.current = touch.clientY;
    mobileSheetSuppressClickRef.current = false;
    setMobileSheetDragOffset(0);
  }, [cancelMobileSheetMapPeek]);
  const handleMobileSheetTouchMove = useCallback((event: TouchEvent<HTMLButtonElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    previewMobileSheetDrag(mobileSheetTouchStartYRef.current, touch.clientY);
  }, [previewMobileSheetDrag]);
  const handleMobileSheetTouchEnd = useCallback((event: TouchEvent<HTMLButtonElement>) => {
    const touch = event.changedTouches[0];
    if (!touch) return;

    const startY = mobileSheetTouchStartYRef.current;
    mobileSheetTouchStartYRef.current = null;
    finishMobileSheetDrag(startY, touch.clientY);
  }, [finishMobileSheetDrag]);
  const handleMobileSheetHandleClick = useCallback(() => {
    if (mobileSheetSuppressClickRef.current) {
      mobileSheetSuppressClickRef.current = false;
      return;
    }

    cancelMobileSheetMapPeek();
    setMobileSheetCollapsed((collapsed) => !collapsed);
  }, [cancelMobileSheetMapPeek]);

  return (
    <div
      className={`app-layout ${mobileSheetCollapsed ? 'mobile-sheet-collapsed' : ''} ${mobileSheetMapPeeking ? 'mobile-sheet-map-peek' : ''} ${mobileSheetDragOffset !== 0 ? 'mobile-sheet-dragging' : ''}`}
      style={mobileSheetStyle}
    >
      {/* ── Sidebar ── */}
      <aside className={`sidebar ${mobileSheetCollapsed ? 'mobile-sheet-collapsed' : ''}`}>
        <div className="mobile-sheet-bar">
          <button
            className="mobile-sheet-handle"
            type="button"
            aria-label={mobileSheetLabel}
            aria-expanded={!mobileSheetCollapsed}
            title={mobileSheetLabel}
            onClick={handleMobileSheetHandleClick}
            onPointerDown={handleMobileSheetPointerDown}
            onPointerMove={handleMobileSheetPointerMove}
            onPointerUp={handleMobileSheetPointerUp}
            onPointerCancel={handleMobileSheetPointerCancel}
            onMouseDown={handleMobileSheetMouseDown}
            onMouseMove={handleMobileSheetMouseMove}
            onMouseUp={handleMobileSheetMouseUp}
            onTouchStart={handleMobileSheetTouchStart}
            onTouchMove={handleMobileSheetTouchMove}
            onTouchEnd={handleMobileSheetTouchEnd}
          >
            <span className="mobile-sheet-handle-grip" aria-hidden="true" />
          </button>
          <CompactThemeButton
            theme={theme}
            onChange={setTheme}
            label={mobileThemeLabel}
          />
        </div>
        <div className="sidebar-header">
          <div className="sidebar-logo-row">
            <div className="sidebar-logo">
              <div className="sidebar-logo-icon">
                <OpenParkingLogo />
              </div>
              <div>
                <h1>{t('app.title')}</h1>
                <div className="sidebar-subtitle">
                  {t('app.subtitle')}
                </div>
              </div>
            </div>
            <div className="sidebar-actions">
              <ThemeSwitch
                theme={theme}
                onChange={setTheme}
                label={uiText('Switch color theme', 'Переключить тему')}
              />
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
                      <FlagIcon locale={option} className="language-flag" />
                      <span>{label.short}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="map-command-panel">
          <label className="filter-label" htmlFor="parking-search">{t('filters.search')}</label>
          <div className="search-command">
            <input
              id="parking-search"
              className="filter-input search-command-input"
              value={searchInput}
              placeholder={uiText('Address, garage, zone, operator...', 'Адрес, гараж, зона, оператор...')}
              onChange={(event) => handleSearch(event.target.value)}
            />
            <button
              className="search-clear-button"
              type="button"
              aria-label={uiText('Clear search', 'Очистить поиск')}
              onClick={() => {
                setSearchInput('');
                setSearchQuery('');
              }}
              disabled={!searchInput && !searchQuery}
            >
              ×
            </button>
          </div>
          <div className="search-suggestions" aria-label={uiText('Search suggestions', 'Подсказки поиска')}>
            {[
              { value: 'garage', label: uiText('garage', 'гараж') },
              { value: 'meter', label: uiText('meter', 'паркомат') },
              { value: 'Miami Beach', label: uiText('Miami Beach', 'Майами-Бич') },
            ].map((suggestion) => (
              <button
                key={suggestion.value}
                type="button"
                onClick={() => handleSearch(suggestion.value)}
              >
                {suggestion.label}
              </button>
            ))}
          </div>
          <div className="desktop-map-shortcuts" aria-label={uiText('Parking map shortcuts', 'Быстрые действия карты')}>
            {desktopMapShortcuts.map((shortcut) => (
              <button
                key={shortcut.key}
                type="button"
                className={`desktop-map-shortcut shortcut-${shortcut.tone} ${shortcut.active ? 'active' : ''}`}
                onClick={shortcut.action}
                aria-pressed={shortcut.active}
              >
                <span className="desktop-map-shortcut-icon" aria-hidden="true">
                  {shortcut.marker}
                </span>
                <span>{shortcut.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="city-summary-panel">
          <div className="city-selector compact">
            {Object.values(CITIES).map((city) => (
              <button
                key={city.id}
                className={`city-chip ${activeCity === city.id ? 'active' : ''}`}
                onClick={() => setActiveCity(city.id)}
                type="button"
              >
                {getLocalizedCityName(city.id, city.name)}
              </button>
            ))}
          </div>
          <div className="city-status-strip">
            <span><b>{stats ? formatNumber(stats.totalFacilities) : '—'}</b> {t('stats.facilities')}</span>
            <span><b>{stats ? formatNumber(stats.curbSegments) : '—'}</b> {t('stats.curbLines')}</span>
            <span><b>{stats ? `${stats.coveragePercent}%` : '—'}</b> {t('stats.coverage')}</span>
            <span><b>{stats?.recordCompleteness ? getCompletenessPercent(stats.recordCompleteness.sourceLinkedRecords, stats.recordCompleteness.totalKnownRecords) : '—'}</b> {uiText('sources', 'источники')}</span>
          </div>
          <div className="layer-scope-strip" aria-label={uiText('Layer result scope', 'Область счетчиков слоя')}>
            {layerScopeItems.map((item) => (
              <span key={item.label}>
                <b>{typeof item.value === 'number' ? formatNumber(item.value) : item.value}</b>
                {item.label}
              </span>
            ))}
          </div>
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
                'No imported OpenParking layer is available for this city yet.',
                'Для этого города пока нет импортированного слоя OpenParking.'
              )}
            </span>
          </div>
        )}

        <div className="filters-section redesigned-filters">
          <div className="mode-tabs" data-mode={workspaceMode} role="tablist" aria-label={uiText('Workspace mode', 'Режим работы')}>
            <button
              className={`mode-tab ${workspaceMode === 'find' ? 'active' : ''}`}
              type="button"
              aria-selected={workspaceMode === 'find'}
              onClick={() => {
                setWorkspaceMode('find');
                if (trustFilter === 'review' || trustFilter === 'conflict') setTrustFilter('likely');
                setDisplayMode('both');
              }}
            >
              <span className="mode-label">{uiText('Find parking', 'Найти парковку')}</span>
            </button>
            <button
              className={`mode-tab ${workspaceMode === 'quality' ? 'active' : ''}`}
              type="button"
              aria-selected={workspaceMode === 'quality'}
              onClick={() => {
                setWorkspaceMode('quality');
                setTrustFilter('review');
                setConfidenceFilter('review');
                setSortMode('review');
                setDisplayMode('segments');
              }}
            >
              <span className="mode-label">{uiText('Data quality', 'Качество')}</span>
              {stats?.recordCompleteness ? (
                <span className="mode-count">
                  <span className="mode-warning" aria-hidden="true">!</span>
                  {formatNumber(stats.recordCompleteness.needsReviewRecords + stats.recordCompleteness.conflictRecords)}
                </span>
              ) : null}
            </button>
          </div>

          {workspaceMode === 'quality' && qualityActions.length > 0 && (
            <div className="quality-action-panel" aria-label={uiText('Data quality action list', 'Список действий по качеству данных')}>
              {qualityActions.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`quality-action-card quality-action-${item.tone}`}
                  onClick={item.action}
                >
                  <span>{item.label}</span>
                  <b>{formatNumber(item.value)}</b>
                </button>
              ))}
            </div>
          )}

          <div className="filter-group">
            <div className="filter-heading-row">
              <label className="filter-label">{uiText('Reliability', 'Надежность')}</label>
              <span className="filter-hint">{uiText('Driver-facing confidence', 'Доверие для водителя')}</span>
            </div>
            <div className="trust-grid" key={workspaceMode}>
              {visibleTrustOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`trust-option ${trustFilter === option.value ? 'active' : ''} trust-${option.value}`}
                  onClick={() => setTrustFilter(option.value)}
                  aria-pressed={trustFilter === option.value}
                >
                  <span>{option.label}</span>
                  <small>{option.hint}</small>
                </button>
              ))}
            </div>
          </div>

          <details className="advanced-filter-details">
            <summary>{uiText('Advanced filters', 'Расширенные фильтры')}</summary>
            <div className="filter-group">
              <label className="filter-label">{t('filters.facilityType')}</label>
              <div className="filter-chip-row">
                {typeOptions.map((option) => (
                  <button
                    key={option.value || 'all-types'}
                    className={`filter-chip ${typeFilter === option.value ? 'active' : ''}`}
                    type="button"
                    title={option.value ? `raw: ${option.value}` : undefined}
                    onClick={() => setTypeFilter(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <select
                className="filter-select compact-select"
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
                aria-label={t('filters.facilityType')}
              >
                <option value="">{t('types.all')}</option>
                {facilityTypes.map((type) => (
                  <option key={type} value={type} title={type}>
                    {getTypeLabel(type)}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label className="filter-label">{t('filters.price')}</label>
              <div className="filter-chip-row">
                {priceOptions.map((option) => (
                  <button
                    key={option.value || 'all-prices'}
                    className={`filter-chip ${priceFilter === option.value ? 'active' : ''}`}
                    type="button"
                    onClick={() => setPriceFilter(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-group two-column-controls">
              <div>
                <label className="filter-label">{t('filters.displayMode')}</label>
                <select
                  className="filter-select"
                  value={displayMode}
                  onChange={(event) => setDisplayMode(event.target.value as DisplayMode)}
                >
                  <option value="both">{t('display.both')}</option>
                  <option value="all">{t('display.all')}</option>
                  <option value="segments">{t('display.segments')}</option>
                  <option value="zones">{t('display.zones')}</option>
                  <option value="points">{t('display.points')}</option>
                </select>
              </div>
              <div>
                <label className="filter-label">{uiText('Sort', 'Сортировка')}</label>
                <select
                  className="filter-select"
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value as SortMode)}
                >
                  <option value="recommended">{uiText('Recommended', 'Рекомендуемые')}</option>
                  <option value="trust">{uiText('Most reliable', 'Сначала надежные')}</option>
                  <option value="price">{uiText('Price known', 'Сначала с ценой')}</option>
                  <option value="actionable">{uiText('Pay/book first', 'Оплата/бронь')}</option>
                  <option value="review">{uiText('Needs review first', 'Сначала проверка')}</option>
                </select>
              </div>
            </div>

            <div className="advanced-filter-grid">
              <div className="filter-group">
                <label className="filter-label">{t('filters.source')}</label>
                <select
                  className="filter-select"
                  value={sourceFilter}
                  onChange={(event) => setSourceFilter(event.target.value)}
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
                  onChange={(event) => setConfidenceFilter(event.target.value as ConfidenceFilter)}
                >
                  <option value="">{t('confidence.all')}</option>
                  <option value="high">{t('confidence.highWithThreshold')}</option>
                  <option value="medium">{t('confidence.mediumWithThreshold')}</option>
                  <option value="low">{t('confidence.lowWithThreshold')}</option>
                  <option value="review">{t('confidence.reviewWithThreshold')}</option>
                </select>
              </div>
            </div>
          </details>

          {stats?.recordCompleteness && (
            <details className="data-health-details" open={workspaceMode === 'quality'}>
              <summary>{uiText('City data health', 'Состояние данных города')}</summary>
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
              <div className="completeness-badges">
                <span className="quality-chip confidence-medium">
                  {formatNumber(stats.recordCompleteness.priceUnknownRecords)} {uiText('price unknown', 'цена неизвестна')}
                </span>
                <span className="quality-chip confidence-low">
                  {formatNumber(stats.recordCompleteness.needsReviewRecords + stats.recordCompleteness.conflictRecords)} {uiText('review/conflict', 'проверка/конфликт')}
                </span>
              </div>
            </details>
          )}
        </div>

        {/* Facility List */}
        <div className="facility-list" ref={facilityListRef} aria-label={uiText('Parking results', 'Результаты парковки')}>
          {sortedFacilities.slice(0, 50).map((f, idx) => {
            const p = f.properties;
            const type = (p.facility_type as string) || 'unknown';
            const confidence = driverConfidence(p);
            const priceDisplay = getPriceDisplay(p);
            const operator = getText(p, 'operator');
            const neighborhood = getText(p, 'neighborhood');
            const source = getText(p, 'source_name') || getText(p, 'last_verified_source');
            const freshness = formatDate(p.data_as_of);
            const trust = getTrustDisplay(p);

            return (
              <button
                key={(p.source_id as string) || idx}
                className="facility-card"
                data-type={type}
                type="button"
                onClick={() => handleFacilityClick(f)}
                aria-label={`${(p.name as string) || t('facility.parkingFallback')}. ${priceDisplay.label}. ${trust.text}.`}
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
                  <span className={`quality-chip trust-chip trust-${trust.label}`}>
                    {trust.text}
                  </span>
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
              </button>
            );
          })}
          {sortedFacilities.length === 0 && !isLoading && (
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
          theme={theme}
          displayMode={displayMode}
          typeFilter={typeFilter}
          priceFilter={priceFilter}
          sourceFilter={sourceFilter}
          trustFilter={trustFilter}
          confidenceFilter={confidenceFilter}
          searchQuery={searchQuery}
          onFacilitySelect={handleFacilityClick}
          routeGeometry={routeResult?.geometry ?? null}
          userLocation={userLocation}
          pickedStart={pickedStart}
          pickedDestination={pickedDestination}
          mapPickMode={mapPickMode}
          onMapPointPick={handleMapPointPick}
          onMapInteractionStart={handleMapInteractionStart}
          onMapInteractionEnd={handleMapInteractionEnd}
          onDisplayModeChange={setDisplayMode}
          onLayerCountsChange={setMapLayerCounts}
          onLayerStatusChange={setMapLayerStatus}
        />

        <div
          className={`route-map-panel ${routePanelOpen ? 'route-panel-open' : 'route-panel-collapsed'}`}
          aria-label={uiText('Map navigation controls', 'Управление навигацией на карте')}
        >
          <button
            className="route-map-panel-title route-panel-toggle"
            type="button"
            onClick={() => setRoutePanelExpanded((expanded) => !expanded)}
            aria-expanded={routePanelOpen}
          >
            {uiText('Navigation', 'Навигация')}
          </button>
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
          <div className={`detail-panel ${selectedFacility ? 'open' : ''}`} role="dialog" aria-label={uiText('Parking details', 'Детали парковки')}>
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
                      type="button"
                      aria-label={uiText('Close details', 'Закрыть детали')}
                      onClick={() => {
                        setSelectedFacility(null);
                        resetRouteState();
                      }}
                    >
                      ✕
                    </button>
                  </div>
                  <div className="detail-body" tabIndex={0}>
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
                          {getFeeLabel((selectedFacility.properties.fee as string) || 'unknown')}
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
                            {getAccessLabel(access)}
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
                        <details className="data-provenance-details">
                          <summary>{uiText('Data provenance', 'Происхождение данных')}</summary>
                          <div className="detail-field">
                            <span className="detail-field-label">{t('detail.sourceId')}</span>
                            <span className="detail-field-value source-id-value">
                              {sourceId}
                            </span>
                          </div>
                        </details>
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

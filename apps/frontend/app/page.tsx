'use client';

/* ═══════════════════════════════════════════════════════════════
   ParkingUSA — Main Page
   Full-screen map with sidebar, filters, facility list
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import type { Feature, Geometry } from 'geojson';
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

export default function HomePage() {
  const [activeCity, setActiveCity] = useState('sf');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('all');
  const [typeFilter, setTypeFilter] = useState('');
  const [priceFilter, setPriceFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState<CityStats | null>(null);
  const [facilities, setFacilities] = useState<FacilityFeature[]>([]);
  const [selectedFacility, setSelectedFacility] = useState<FacilityFeature | null>(null);
  const [facilityTypes, setFacilityTypes] = useState<string[]>([]);
  const [sourceNames, setSourceNames] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load stats
  useEffect(() => {
    fetch('/api/stats')
      .then((r) => r.json())
      .then(setStats)
      .catch(console.error);
  }, []);

  // Load facilities for the list
  useEffect(() => {
    setIsLoading(true);
    const params = new URLSearchParams();
    if (typeFilter) params.set('type', typeFilter);
    if (priceFilter) params.set('price', priceFilter);
    if (sourceFilter) params.set('source', sourceFilter);
    if (confidenceFilter) params.set('confidence', confidenceFilter);
    if (searchQuery) params.set('q', searchQuery);
    params.set('limit', '200');

    fetch(`/api/facilities?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setFacilities(data.features || []);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, [confidenceFilter, priceFilter, searchQuery, sourceFilter, typeFilter]);

  // Load facility types for filter dropdown
  useEffect(() => {
    fetch('/api/facilities?limit=50000')
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
  }, []);

  const handleSearch = useCallback((value: string) => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setSearchQuery(value);
    }, 300);
  }, []);

  const handleFacilityClick = useCallback((facility: FacilityFeature) => {
    setSelectedFacility(facility);
  }, []);

  const getBadgeClass = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes('garage') || t.includes('multi') || t.includes('underground')) return 'badge-garage';
    if (t.includes('surface') || t.includes('lot')) return 'badge-surface';
    if (t.includes('street') || t.includes('meter') || t.includes('entrance')) return 'badge-street';
    if (t.includes('valet')) return 'badge-valet';
    return 'badge-unknown';
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      street_meter: 'Street',
      offstreet_meter: 'Off-street',
      garage: 'Garage',
      'multi-storey': 'Garage',
      underground: 'Underground',
      surface: 'Lot',
      surface_lot: 'Lot',
      lot: 'Lot',
      parking: 'Parking',
      parking_area: 'Area',
      parking_entrance: 'Entry',
      valet: 'Valet',
      street_side: 'Street',
    };
    return labels[type] || type;
  };

  const getConfidenceClass = (conf: number) => {
    if (conf >= 0.7) return 'confidence-high';
    if (conf >= 0.5) return 'confidence-medium';
    return 'confidence-low';
  };

  const getConfidenceLabel = (conf: number) => {
    if (conf >= 0.75) return 'High';
    if (conf >= 0.5) return 'Medium';
    return 'Review';
  };

  const getSourceBadgeClass = (source: string) => {
    const s = source.toLowerCase();
    if (s.includes('openstreetmap') || s.includes('osm')) return 'osm';
    if (s.includes('datasf') || s.includes('city') || s.includes('ladot') || s.includes('nyc')) return 'city';
    return '';
  };

  const formatDate = (value: unknown) => {
    if (typeof value !== 'string' || !value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return value.slice(0, 10);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatNumber = (n: number) => n.toLocaleString('en-US');
  const getText = (p: Record<string, unknown>, key: string, fallback = '') => {
    const value = p[key];
    return typeof value === 'string' ? value : fallback;
  };
  const getValue = (p: Record<string, unknown>, key: string) => {
    const value = p[key];
    return typeof value === 'string' || typeof value === 'number' ? value : null;
  };

  return (
    <div className="app-layout">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon">🅿️</div>
            <div>
              <h1>ParkingUSA</h1>
              <div className="sidebar-subtitle">
                Every parking spot in America
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value accent-blue animate-in">
              {stats ? formatNumber(stats.totalFacilities) : '—'}
            </div>
            <div className="stat-label">Facilities</div>
          </div>
          <div className="stat-card">
            <div className="stat-value accent-emerald animate-in">
              {stats ? formatNumber(stats.pricedFacilities) : '—'}
            </div>
            <div className="stat-label">With Price</div>
          </div>
          <div className="stat-card">
            <div className="stat-value accent-amber animate-in">
              {stats ? formatNumber(stats.curbSegments) : '—'}
            </div>
            <div className="stat-label">Curb Lines</div>
          </div>
          <div className="stat-card">
            <div className="stat-value accent-purple animate-in">
              {stats ? `${stats.coveragePercent}%` : '—'}
            </div>
            <div className="stat-label">Coverage</div>
          </div>
        </div>

        {/* City Selector */}
        <div className="city-selector">
          {Object.values(CITIES).map((city) => (
            <button
              key={city.id}
              className={`city-chip ${activeCity === city.id ? 'active' : ''}`}
              onClick={() => setActiveCity(city.id)}
            >
              {city.name}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="filters-section">
          <div className="filter-group">
            <label className="filter-label">Display Mode</label>
            <select
              className="filter-select"
              value={displayMode}
              onChange={(e) => setDisplayMode(e.target.value as DisplayMode)}
            >
              <option value="all">All Layers</option>
              <option value="segments">Curb Lines</option>
              <option value="zones">Parking Zones</option>
              <option value="points">Meter Points</option>
              <option value="both">Lines + Points</option>
            </select>
          </div>

          <div className="filter-group">
            <label className="filter-label">Facility Type</label>
            <select
              className="filter-select"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="">All Types</option>
              {facilityTypes.map((type) => (
                <option key={type} value={type}>
                  {getTypeLabel(type)} ({type})
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label className="filter-label">Price</label>
            <select
              className="filter-select"
              value={priceFilter}
              onChange={(e) => setPriceFilter(e.target.value)}
            >
              <option value="">All</option>
              <option value="known">Price Known</option>
              <option value="unknown">Price Unknown</option>
            </select>
          </div>

          <div className="filter-group">
            <label className="filter-label">Source</label>
            <select
              className="filter-select"
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
            >
              <option value="">All Sources</option>
              {sourceNames.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label className="filter-label">Confidence</label>
            <select
              className="filter-select"
              value={confidenceFilter}
              onChange={(e) => setConfidenceFilter(e.target.value as ConfidenceFilter)}
            >
              <option value="">All Confidence</option>
              <option value="high">High 75%+</option>
              <option value="medium">Medium 50-74%</option>
              <option value="low">Low &lt;50%</option>
              <option value="review">Needs Review &lt;70%</option>
            </select>
          </div>

          <div className="filter-group">
            <label className="filter-label">Search</label>
            <input
              className="filter-input"
              placeholder="Name, operator, address…"
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
            const charge = (p.charge as string) || 'unknown';
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
                    {(p.name as string) || 'Parking'}
                  </div>
                  <span className={`facility-type-badge ${getBadgeClass(type)}`}>
                    {getTypeLabel(type)}
                  </span>
                </div>
                <div className="facility-meta">
                  <span className={`facility-meta-item facility-price ${charge === 'unknown' ? 'unknown' : ''}`}>
                    {charge === 'unknown' ? 'Price N/A' : charge}
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
                    {source || 'Unknown source'}
                  </span>
                  <span className={`quality-chip ${getConfidenceClass(confidence)}`}>
                    {getConfidenceLabel(confidence)} {Math.round(confidence * 100)}%
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
              No facilities match your filters
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="legend">
          <div className="legend-title">Legend</div>
          <div className="legend-items">
            <div className="legend-item">
              <div className="legend-line" style={{ background: 'var(--accent-emerald)' }} />
              Curb: ≤$2/h
            </div>
            <div className="legend-item">
              <div className="legend-line" style={{ background: 'var(--accent-amber)' }} />
              Curb: $2–$4/h
            </div>
            <div className="legend-item">
              <div className="legend-line" style={{ background: 'var(--accent-red)' }} />
              Curb: &gt;$4/h
            </div>
            <div className="legend-item">
              <div className="legend-dot" style={{ background: 'var(--accent-blue)', color: 'var(--accent-blue)' }} />
              Garage / Multi-storey
            </div>
            <div className="legend-item">
              <div className="legend-dot" style={{ background: 'var(--accent-emerald)', color: 'var(--accent-emerald)' }} />
              Surface Lot
            </div>
            <div className="legend-item">
              <div className="legend-dot" style={{ background: 'var(--accent-amber)', color: 'var(--accent-amber)' }} />
              Street Meter
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
        />

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
              const street = getText(p, 'street');
              const neighborhood = getText(p, 'neighborhood');
              const source = getText(p, 'source_name') || getText(p, 'last_verified_source');
              const sourceId = getText(p, 'source_id');
              const dataAsOf = formatDate(p.data_as_of);
              const confidence = (p.confidence as number) || 0.5;

              return (
                <>
            <div className="detail-header">
              <div>
                <div className="popup-title">
                  {(selectedFacility.properties.name as string) || 'Parking'}
                </div>
                <span className={`facility-type-badge ${getBadgeClass(
                  (selectedFacility.properties.facility_type as string) || 'unknown'
                )}`}>
                  {getTypeLabel((selectedFacility.properties.facility_type as string) || 'unknown')}
                </span>
              </div>
              <button className="detail-close" onClick={() => setSelectedFacility(null)}>
                ✕
              </button>
            </div>
            <div className="detail-body">
              <div className="detail-section">
                <div className="detail-section-title">Pricing</div>
                <div className="popup-price">
                  {(selectedFacility.properties.charge as string) || 'Unknown'}
                </div>
                {baseHourlyRate !== null && (
                  <div className="detail-field">
                    <span className="detail-field-label">Base Hourly</span>
                    <span className="detail-field-value">
                      ${baseHourlyRate}/hr
                    </span>
                  </div>
                )}
                <div className="detail-field">
                  <span className="detail-field-label">Fee</span>
                  <span className="detail-field-value">
                    {(selectedFacility.properties.fee as string) || 'Unknown'}
                  </span>
                </div>
              </div>

              <div className="detail-section">
                <div className="detail-section-title">Details</div>
                {operator && (
                  <div className="detail-field">
                    <span className="detail-field-label">Operator</span>
                    <span className="detail-field-value">
                      {operator}
                    </span>
                  </div>
                )}
                {access && (
                  <div className="detail-field">
                    <span className="detail-field-label">Access</span>
                    <span className="detail-field-value">
                      {access}
                    </span>
                  </div>
                )}
                {capacity !== null && (
                  <div className="detail-field">
                    <span className="detail-field-label">Capacity</span>
                    <span className="detail-field-value">
                      {capacity}
                    </span>
                  </div>
                )}
                {openingHours && (
                  <div className="detail-field">
                    <span className="detail-field-label">Hours</span>
                    <span className="detail-field-value">
                      {openingHours}
                    </span>
                  </div>
                )}
                {street && (
                  <div className="detail-field">
                    <span className="detail-field-label">Street</span>
                    <span className="detail-field-value">
                      {street}
                    </span>
                  </div>
                )}
                {neighborhood && (
                  <div className="detail-field">
                    <span className="detail-field-label">Neighborhood</span>
                    <span className="detail-field-value">
                      {neighborhood}
                    </span>
                  </div>
                )}
              </div>

              <div className="detail-section">
                <div className="detail-section-title">Data Quality</div>
                <div className="detail-field">
                  <span className="detail-field-label">Confidence</span>
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
                    <span className="detail-field-label">Source</span>
                    <span className={`source-badge ${getSourceBadgeClass(source)}`}>
                      {source}
                    </span>
                  </div>
                )}
                {dataAsOf && (
                  <div className="detail-field">
                    <span className="detail-field-label">Data As Of</span>
                    <span className="detail-field-value">
                      {dataAsOf}
                    </span>
                  </div>
                )}
                {sourceId && (
                  <div className="detail-field">
                    <span className="detail-field-label">Source ID</span>
                    <span className="detail-field-value" style={{ fontSize: '11px' }}>
                      {sourceId}
                    </span>
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

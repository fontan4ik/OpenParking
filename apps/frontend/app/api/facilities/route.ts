/* ═══════════════════════════════════════════════════════════════
   GET /api/facilities
   Returns parking facilities as GeoJSON with filters
   ═══════════════════════════════════════════════════════════════ */

import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_CITY_ID, loadFacilities } from '@/lib/data-loader';
import { matchesPriceFilter } from '@/lib/data-quality';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const typeFilter = searchParams.get('type');
  const priceFilter = searchParams.get('price');
  const sourceFilter = searchParams.get('source');
  const confidenceFilter = searchParams.get('confidence');
  const q = searchParams.get('q')?.toLowerCase();
  const limit = parseInt(searchParams.get('limit') || '50000', 10);
  const city = searchParams.get('city') || DEFAULT_CITY_ID;

  const data = await loadFacilities(city);
  let features = data.features;

  if (typeFilter) {
    features = features.filter(
      (f) => (f.properties.facility_type as string) === typeFilter
    );
  }

  if (priceFilter === 'known' || priceFilter === 'unknown') {
    features = features.filter((f) => matchesPriceFilter(f.properties, priceFilter));
  }

  if (sourceFilter) {
    features = features.filter((f) => {
      const p = f.properties;
      return p.source_name === sourceFilter || p.last_verified_source === sourceFilter;
    });
  }

  if (confidenceFilter) {
    features = features.filter((f) => {
      const confidence =
        typeof f.properties.confidence === 'number' ? f.properties.confidence : 0.5;
      if (confidenceFilter === 'high') return confidence >= 0.75;
      if (confidenceFilter === 'medium') return confidence >= 0.5 && confidence < 0.75;
      if (confidenceFilter === 'low') return confidence < 0.5;
      if (confidenceFilter === 'review') return confidence < 0.7;
      return true;
    });
  }

  if (q) {
    features = features.filter((f) => {
      const p = f.properties;
      const hay = `${p.name || ''} ${p.operator || ''} ${p.source_id || ''} ${p.street || ''} ${p.neighborhood || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }

  features = features.slice(0, limit);

  return NextResponse.json({
    type: 'FeatureCollection',
    metadata: {
      ...(data.metadata ?? {}),
      count: features.length,
      source_count: data.features.length,
      filters: { city, type: typeFilter, price: priceFilter, source: sourceFilter, confidence: confidenceFilter, q },
    },
    features,
  });
}

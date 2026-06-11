/* ═══════════════════════════════════════════════════════════════
   GET /api/facilities
   Returns parking facilities as GeoJSON with filters
   ═══════════════════════════════════════════════════════════════ */

import { NextRequest, NextResponse } from 'next/server';
import { loadFacilities } from '@/lib/data-loader';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const typeFilter = searchParams.get('type');
  const priceFilter = searchParams.get('price');
  const sourceFilter = searchParams.get('source');
  const confidenceFilter = searchParams.get('confidence');
  const q = searchParams.get('q')?.toLowerCase();
  const limit = parseInt(searchParams.get('limit') || '50000', 10);

  const data = await loadFacilities();
  let features = data.features;

  if (typeFilter) {
    features = features.filter(
      (f) => (f.properties.facility_type as string) === typeFilter
    );
  }

  if (priceFilter === 'known') {
    features = features.filter((f) => {
      const p = f.properties;
      return (
        p.base_hourly_rate ||
        (p.charge && p.charge !== 'unknown')
      );
    });
  } else if (priceFilter === 'unknown') {
    features = features.filter((f) => {
      const p = f.properties;
      return (
        !p.base_hourly_rate &&
        (!p.charge || p.charge === 'unknown')
      );
    });
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
      count: features.length,
      filters: { type: typeFilter, price: priceFilter, source: sourceFilter, confidence: confidenceFilter, q },
    },
    features,
  });
}

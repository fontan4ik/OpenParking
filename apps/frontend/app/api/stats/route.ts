/* ═══════════════════════════════════════════════════════════════
   GET /api/stats
   Returns aggregate statistics for the dashboard including
   record-completeness / provenance-coverage metrics.
   ═══════════════════════════════════════════════════════════════ */

import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_CITY_ID, loadAllLayers, computeStats, buildParkingIndex } from '@/lib/data-loader';
import { computeRecordCompleteness } from '@/lib/data-quality';
import { computeDerivedEnrichmentBacklog } from '@/lib/enrichment-backlog';

export async function GET(request: NextRequest) {
  const city = request.nextUrl.searchParams.get('city') || DEFAULT_CITY_ID;
  const { facilities, segments, zones } = await loadAllLayers(city);
  const stats = computeStats(facilities, segments, zones, city);

  // Build canonical parking index to get enriched feature properties
  // for record-completeness metrics without reloading data.
  const index = buildParkingIndex(city, { facilities, segments, zones });
  const indexProperties = index.features.map((f) => f.properties);
  const recordCompleteness = computeRecordCompleteness(indexProperties);
  const derivedEnrichmentBacklog = computeDerivedEnrichmentBacklog(indexProperties, { cityId: city });

  return NextResponse.json({ ...stats, recordCompleteness, derivedEnrichmentBacklog });
}

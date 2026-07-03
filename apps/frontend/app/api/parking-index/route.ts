/* ═══════════════════════════════════════════════════════════════
   GET /api/parking-index
   One ParkingUSA canonical parking coverage feed.
   ═══════════════════════════════════════════════════════════════ */

import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_CITY_ID, loadParkingIndex } from '@/lib/data-loader';

export async function GET(request: NextRequest) {
  const city = request.nextUrl.searchParams.get('city') || DEFAULT_CITY_ID;
  const data = await loadParkingIndex(city);

  return NextResponse.json(data, {
    headers: {
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
    },
  });
}

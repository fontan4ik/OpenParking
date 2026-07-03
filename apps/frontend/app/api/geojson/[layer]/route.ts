/* ═══════════════════════════════════════════════════════════════
   GET /api/geojson/[layer]
   Serves pre-built GeoJSON layers: facilities, segments, zones
   ═══════════════════════════════════════════════════════════════ */

import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_CITY_ID, loadFacilities, loadCurbSegments, loadZones } from '@/lib/data-loader';

const loaders: Record<string, (city: string) => ReturnType<typeof loadFacilities>> = {
  facilities: loadFacilities,
  segments: loadCurbSegments,
  zones: loadZones,
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ layer: string }> }
) {
  const { layer } = await params;
  const loader = loaders[layer];
  const city = request.nextUrl.searchParams.get('city') || DEFAULT_CITY_ID;

  if (!loader) {
    return NextResponse.json(
      { error: `Unknown layer: ${layer}. Available: ${Object.keys(loaders).join(', ')}` },
      { status: 404 }
    );
  }

  const data = await loader(city);

  return NextResponse.json(data, {
    headers: {
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
    },
  });
}

/* ═══════════════════════════════════════════════════════════════
   GET /api/geojson/[layer]
   Serves pre-built GeoJSON layers: facilities, segments, zones
   ═══════════════════════════════════════════════════════════════ */

import { NextRequest, NextResponse } from 'next/server';
import { loadFacilities, loadCurbSegments, loadZones } from '@/lib/data-loader';

const loaders: Record<string, () => ReturnType<typeof loadFacilities>> = {
  facilities: loadFacilities,
  segments: loadCurbSegments,
  zones: loadZones,
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ layer: string }> }
) {
  const { layer } = await params;
  const loader = loaders[layer];

  if (!loader) {
    return NextResponse.json(
      { error: `Unknown layer: ${layer}. Available: ${Object.keys(loaders).join(', ')}` },
      { status: 404 }
    );
  }

  const data = await loader();

  return NextResponse.json(data, {
    headers: {
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
    },
  });
}

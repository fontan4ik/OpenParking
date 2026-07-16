/* ═══════════════════════════════════════════════════════════════
   GET /api/geocode/forward
   Forward-geocoding proxy for OpenCage.
   OPENCAGE_API_KEY stays server-side only.
   ═══════════════════════════════════════════════════════════════ */

import { NextRequest, NextResponse } from 'next/server';
import { forwardGeocode } from '@/lib/geocoding';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;

  const input: Record<string, string> = {};
  const q = searchParams.get('q');
  const limit = searchParams.get('limit');
  const language = searchParams.get('language');

  if (q !== null) input.q = q;
  if (limit !== null) input.limit = limit;
  if (language !== null) input.language = language;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const result = await forwardGeocode(input, controller.signal);

    if (result.status === 'error') {
      const httpStatus = result.errorType === 'validation' ? 400 : 502;
      return NextResponse.json(result, { status: httpStatus });
    }

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

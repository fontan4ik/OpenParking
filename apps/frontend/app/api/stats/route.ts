/* ═══════════════════════════════════════════════════════════════
   GET /api/stats
   Returns aggregate statistics for the dashboard
   ═══════════════════════════════════════════════════════════════ */

import { NextResponse } from 'next/server';
import { loadAllLayers, computeStats } from '@/lib/data-loader';

export async function GET() {
  const { facilities, segments, zones } = await loadAllLayers();
  const stats = computeStats(facilities, segments, zones);

  return NextResponse.json(stats);
}

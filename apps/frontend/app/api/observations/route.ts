import { NextRequest, NextResponse } from 'next/server';
import { prisma, tryDatabase } from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const entityType = searchParams.get('entityType') ?? undefined;
  const sourceName = searchParams.get('source') ?? undefined;
  const q = searchParams.get('q')?.toLowerCase();
  const limit = Math.min(parseInt(searchParams.get('limit') || '250', 10), 1000);

  const observations = await tryDatabase(async () => {
    const rows = await prisma.sourceObservation.findMany({
      where: {
        entityType,
        sourceName,
      },
      orderBy: [{ createdAt: 'desc' }],
      take: Number.isFinite(limit) ? limit : 250,
    });

    return rows
      .filter((row) => {
        if (!q) return true;
        const haystack = `${row.sourceName} ${row.sourceId} ${row.entityType} ${
          row.entitySourceId ?? ''
        } ${row.notes ?? ''}`.toLowerCase();
        return haystack.includes(q);
      })
      .map((row) => ({
        id: row.id,
        source_name: row.sourceName,
        source_id: row.sourceId,
        entity_type: row.entityType,
        entity_source_id: row.entitySourceId,
        observed_at: row.observedAt.toISOString(),
        raw_properties: row.rawProperties,
        confidence: row.confidence,
        notes: row.notes,
        created_at: row.createdAt.toISOString(),
      }));
  });

  return NextResponse.json({
    observations: observations ?? [],
    metadata: {
      count: observations?.length ?? 0,
      filters: { entityType, source: sourceName, q },
    },
  });
}

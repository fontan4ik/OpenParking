import { NextRequest, NextResponse } from 'next/server';
import { prisma, tryDatabase } from '@/lib/db';

const USER_REPORT_SOURCE = {
  name: 'User Report',
  type: 'user_report',
  homepageUrl: null,
  license: 'User submitted; review before canonical use',
  notes: 'ParkingUSA user-submitted tariffs, rules, photos, payment links, comments, and corrections pending moderation.',
};

const MAX_REPORT_BODY_BYTES = 12_000;
const USER_REPORT_WINDOW_MS = 60 * 60 * 1000;
const USER_REPORT_MAX_PER_WINDOW = 5;
const reportBuckets = new Map<string, { count: number; resetAt: number }>();

function reviewTokenIsValid(request: NextRequest) {
  const expected = process.env.PARKINGUSA_REVIEW_TOKEN;
  return Boolean(expected && request.headers.get('x-parkingusa-review-token') === expected);
}

function clientKey(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip') || 'local';
}

function rateLimitUserReport(request: NextRequest) {
  const now = Date.now();
  const key = clientKey(request);
  const bucket = reportBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    reportBuckets.set(key, { count: 1, resetAt: now + USER_REPORT_WINDOW_MS });
    return null;
  }

  if (bucket.count >= USER_REPORT_MAX_PER_WINDOW) {
    return Math.ceil((bucket.resetAt - now) / 1000);
  }

  bucket.count += 1;
  return null;
}

function optionalUrl(value: string) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString().slice(0, 1000) : '';
  } catch {
    return '';
  }
}

function parseJsonBody(rawBody: string) {
  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    return null;
  }
}

function observationSourceFilter(request: NextRequest, requestedSource?: string) {
  if (reviewTokenIsValid(request)) return requestedSource;
  if (requestedSource) {
    return requestedSource === USER_REPORT_SOURCE.name ? '__hidden_user_report__' : requestedSource;
  }
  return { not: USER_REPORT_SOURCE.name };
}

function stringField(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function sourceKey(value: string) {
  return value.replace(/[^A-Za-z0-9._:-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 160) || 'unknown';
}

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
        sourceName: observationSourceFilter(request, sourceName),
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

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).length > MAX_REPORT_BODY_BYTES) {
    return NextResponse.json({ error: 'Request body is too large' }, { status: 413 });
  }

  const retryAfter = rateLimitUserReport(request);
  if (retryAfter !== null) {
    return NextResponse.json(
      { error: 'Too many user reports. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  const body = parseJsonBody(rawBody);
  if (!isRecord(body)) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parkingSourceName = stringField(body.parking_source_name, 160);
  const parkingSourceId = stringField(body.parking_source_id, 220);
  const facilityName = stringField(body.facility_name, 220);
  const city = stringField(body.city, 80);
  const state = stringField(body.state, 20);
  const suggestedPrice = stringField(body.suggested_price, 500);
  const suggestedRules = stringField(body.suggested_rules, 1000);
  const paymentUrl = optionalUrl(stringField(body.payment_url, 1000));
  const evidenceUrl = optionalUrl(stringField(body.evidence_url, 1000));
  const comment = stringField(body.comment, 2000);

  if (!parkingSourceName || !parkingSourceId) {
    return NextResponse.json({ error: 'parking_source_name and parking_source_id are required' }, { status: 400 });
  }

  if (!suggestedPrice && !suggestedRules && !paymentUrl && !evidenceUrl && !comment) {
    return NextResponse.json(
      { error: 'Submit at least one suggested field: price, rules, payment URL, evidence URL, or comment' },
      { status: 400 }
    );
  }

  const created = await tryDatabase(async () => {
    await prisma.dataSource.upsert({
      where: { name: USER_REPORT_SOURCE.name },
      update: USER_REPORT_SOURCE,
      create: USER_REPORT_SOURCE,
    });

    const now = new Date();
    const sourceId = `user-report:${sourceKey(parkingSourceName)}:${sourceKey(parkingSourceId)}:${now.getTime()}`;
    const rawProperties = {
      status: 'pending_review',
      parking_source_name: parkingSourceName,
      parking_source_id: parkingSourceId,
      facility_name: facilityName || null,
      city: city || null,
      state: state || null,
      suggested_price: suggestedPrice || null,
      suggested_rules: suggestedRules || null,
      payment_url: paymentUrl || null,
      evidence_url: evidenceUrl || null,
      comment: comment || null,
      submitted_from: 'parking_detail_panel',
    };

    return prisma.sourceObservation.create({
      data: {
        sourceName: USER_REPORT_SOURCE.name,
        sourceId,
        entityType: 'user_report',
        entitySourceId: `${parkingSourceName}:${parkingSourceId}`,
        observedAt: now,
        rawProperties,
        confidence: 0.35,
        notes: `Pending user-submitted parking info for ${facilityName || parkingSourceId}`,
      },
    });
  });

  if (!created) {
    return NextResponse.json({ error: 'Database is not available for user reports' }, { status: 503 });
  }

  return NextResponse.json(
    {
      observation: {
        id: created.id,
        source_name: created.sourceName,
        source_id: created.sourceId,
        entity_type: created.entityType,
        entity_source_id: created.entitySourceId,
        observed_at: created.observedAt.toISOString(),
        raw_properties: created.rawProperties,
        confidence: created.confidence,
        notes: created.notes,
      },
    },
    { status: 201 }
  );
}

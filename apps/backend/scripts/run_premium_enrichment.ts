import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Prisma } from '@prisma/client';
import { safePublicUrl, stableHash, textOrNull } from './connector_foundation';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..', '..');
const require = createRequire(import.meta.url);
const { loadEnvConfig } = require('@next/env') as { loadEnvConfig: (dir: string) => void };
loadEnvConfig(root);

export const PREMIUM_SOURCE_NAME = 'Premium Parking Miami public operator site';
export const PREMIUM_SOURCE_KEY = 'premium-parking-miami-public-site';
export const PREMIUM_CITY_URL = 'https://www.premiumparking.com/city/miami';
export const PREMIUM_GRAPHQL_URL = 'https://api.premiumparking.com/graphql';

const MARKET_QUERY = `
  query getMarketPageData($slug: String!, $venuesInGroupsLimit: Int, $popularVenuesLimit: Int) {
    market(slug: $slug, archived: false) {
      name
      id
      latitude
      longitude
      slug
      venues(archived: false, limit: $popularVenuesLimit, sort_by: { position: ASC }) {
        address
        id
        name
        slug
        description
      }
      venue_groups(sort_by: { position: ASC }) {
        id
        title
        venues(archived: false, limit: $venuesInGroupsLimit, sort_by: { position_in_group: ASC }) {
          address
          description
          id
          name
          slug
        }
      }
    }
  }
`;

type PremiumVenue = {
  id?: number | string | null;
  name?: string | null;
  address?: string | null;
  slug?: string | null;
  description?: string | null;
};

type PremiumVenueGroup = {
  id?: number | string | null;
  title?: string | null;
  venues?: PremiumVenue[] | null;
};

type PremiumMarket = {
  id?: number | string | null;
  name?: string | null;
  slug?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  venues?: PremiumVenue[] | { venues?: PremiumVenue[] | null } | null;
  venue_groups?: PremiumVenueGroup[] | null;
};

export type PremiumLinkClassification = 'facility_page' | 'operator_search' | 'direct_checkout' | 'app_zone' | 'unsafe_or_unknown';

export type PremiumObservationRecord = {
  source_name: string;
  source_id: string;
  entity_type: 'operator_facility_observation';
  source_url: string;
  api_url: string;
  evidence_url: string;
  candidate_url: string;
  link_classification: PremiumLinkClassification;
  payment_url: string | null;
  booking_url: string | null;
  confidence: number;
  status: 'parser_observation';
  match_candidates: Array<{ source_name: string; source_id: string; confidence: number; reason: string }>;
  raw_properties: Record<string, unknown>;
};

export type PremiumEnrichmentReport = {
  connector_key: 'premium_operator_public_site';
  dry_run: boolean;
  import_requested: boolean;
  generated_at: string;
  source: {
    source_key: string;
    source_name: string;
    source_type: 'operator_public_site';
    portal_type: 'graphql_public_client';
    source_url: string;
    api_url: string;
    legal_risk: 'medium_tos_review';
    confidence: number;
    city: 'Miami';
    state: 'FL';
  };
  counts: {
    records_seen: number;
    records_normalized: number;
    records_inserted: number;
    records_updated: number;
    records_error_count: number;
    total_available: number | null;
  };
  records: PremiumObservationRecord[];
  warnings: string[];
};

function argValue(name: string, fallback?: string) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

export function premiumVenueUrl(citySlug: string, venueSlug: string): string | null {
  return safePublicUrl(`https://www.premiumparking.com/city/${encodeURIComponent(citySlug)}/${encodeURIComponent(venueSlug)}`);
}

export function classifyPremiumLink(url: string | null): PremiumLinkClassification {
  const safe = safePublicUrl(url);
  if (!safe) return 'unsafe_or_unknown';
  const parsed = new URL(safe);
  if (parsed.hostname === 'www.premiumparking.com' && /^\/city\/[^/]+\/[^/]+\/?$/.test(parsed.pathname)) return 'facility_page';
  if (parsed.hostname === 'www.premiumparking.com' && parsed.pathname.startsWith('/city/')) return 'operator_search';
  if (/checkout|reserve|booking|payment|session/i.test(parsed.pathname + parsed.search)) return 'direct_checkout';
  if (/parkmobile|paybyphone/i.test(parsed.hostname + parsed.pathname)) return 'app_zone';
  return 'operator_search';
}

function venueArray(venues: PremiumMarket['venues']): PremiumVenue[] {
  if (Array.isArray(venues)) return venues;
  if (venues && typeof venues === 'object' && Array.isArray(venues.venues)) return venues.venues;
  return [];
}

function dedupeVenues(market: PremiumMarket): PremiumVenue[] {
  const byKey = new Map<string, PremiumVenue>();
  for (const venue of venueArray(market.venues)) {
    const key = textOrNull(venue.slug) || textOrNull(venue.id) || stableHash(venue);
    byKey.set(key, venue);
  }
  for (const group of market.venue_groups ?? []) {
    for (const venue of group.venues ?? []) {
      const key = textOrNull(venue.slug) || textOrNull(venue.id) || stableHash(venue);
      byKey.set(key, venue);
    }
  }
  return [...byKey.values()];
}

export function normalizePremiumMarket(market: PremiumMarket, verifiedAt = new Date()): PremiumObservationRecord[] {
  const citySlug = textOrNull(market.slug) || 'miami';
  return dedupeVenues(market).map((venue) => {
    const venueId = textOrNull(venue.id) || textOrNull(venue.slug) || stableHash(venue);
    const venueSlug = textOrNull(venue.slug) || venueId;
    const candidateUrl = premiumVenueUrl(citySlug, venueSlug) ?? PREMIUM_CITY_URL;
    const linkClassification = classifyPremiumLink(candidateUrl);
    return {
      source_name: PREMIUM_SOURCE_NAME,
      source_id: `premium:${citySlug}:venue:${venueId}`,
      entity_type: 'operator_facility_observation',
      source_url: PREMIUM_CITY_URL,
      api_url: PREMIUM_GRAPHQL_URL,
      evidence_url: candidateUrl,
      candidate_url: candidateUrl,
      link_classification: linkClassification,
      payment_url: linkClassification === 'direct_checkout' ? candidateUrl : null,
      booking_url: linkClassification === 'direct_checkout' ? candidateUrl : null,
      confidence: 0.68,
      status: 'parser_observation',
      match_candidates: [],
      raw_properties: {
        operator: 'Premium Parking',
        market: {
          id: market.id ?? null,
          name: market.name ?? null,
          slug: citySlug,
          latitude: market.latitude ?? null,
          longitude: market.longitude ?? null,
        },
        venue,
        observed_at: verifiedAt.toISOString(),
        payment_url_promotion_note: 'Premium venue URLs are operator facility pages, not direct checkout links; keep canonical payment_url/booking_url null until a direct checkout URL is observed.',
      },
    };
  });
}

async function fetchPremiumMarket(limit: number): Promise<{ market: PremiumMarket | null; warning: string | null }> {
  const response = await fetch(PREMIUM_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      origin: 'https://www.premiumparking.com',
      referer: PREMIUM_CITY_URL,
      'user-agent': 'ParkingUSA Premium enrichment dry-run (bounded; ToS review)',
    },
    body: JSON.stringify({
      query: MARKET_QUERY,
      variables: { slug: 'miami', venuesInGroupsLimit: limit, popularVenuesLimit: limit },
    }),
  });
  const text = await response.text();
  if (!response.ok) return { market: null, warning: `Premium GraphQL endpoint returned ${response.status} ${response.statusText}: ${text.slice(0, 200)}` };
  const body = JSON.parse(text) as { data?: { market?: PremiumMarket | null }; errors?: unknown };
  if (body.errors) return { market: null, warning: `Premium GraphQL endpoint returned GraphQL errors: ${JSON.stringify(body.errors).slice(0, 300)}` };
  return { market: body.data?.market ?? null, warning: null };
}

async function readFixture(filePath: string): Promise<PremiumMarket> {
  const raw = JSON.parse(await fs.readFile(filePath, 'utf8')) as { data?: { market?: PremiumMarket } } | { market?: PremiumMarket } | PremiumMarket;
  if ('data' in raw && raw.data?.market) return raw.data.market;
  if ('market' in raw && raw.market) return raw.market;
  return raw as PremiumMarket;
}

export function buildPremiumReport(input: { records: PremiumObservationRecord[]; dryRun: boolean; importRequested: boolean; warnings?: string[]; generatedAt?: Date }): PremiumEnrichmentReport {
  return {
    connector_key: 'premium_operator_public_site',
    dry_run: input.dryRun,
    import_requested: input.importRequested,
    generated_at: (input.generatedAt ?? new Date()).toISOString(),
    source: {
      source_key: PREMIUM_SOURCE_KEY,
      source_name: PREMIUM_SOURCE_NAME,
      source_type: 'operator_public_site',
      portal_type: 'graphql_public_client',
      source_url: PREMIUM_CITY_URL,
      api_url: PREMIUM_GRAPHQL_URL,
      legal_risk: 'medium_tos_review',
      confidence: 0.68,
      city: 'Miami',
      state: 'FL',
    },
    counts: {
      records_seen: input.records.length,
      records_normalized: input.records.length,
      records_inserted: 0,
      records_updated: 0,
      records_error_count: 0,
      total_available: null,
    },
    records: input.records,
    warnings: input.warnings ?? [],
  };
}

async function persistPremiumReport(report: PremiumEnrichmentReport): Promise<PremiumEnrichmentReport> {
  if (report.dry_run) return report;
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  let inserted = 0;
  let updated = 0;
  try {
    await prisma.dataSource.upsert({
      where: { name: report.source.source_name },
      update: {
        sourceKey: report.source.source_key,
        type: report.source.source_type,
        homepageUrl: report.source.source_url,
        sourceUrl: report.source.source_url,
        apiUrl: report.source.api_url,
        portalType: report.source.portal_type,
        recommendedConnector: 'premium_operator_public_site_parser',
        legalRisk: report.source.legal_risk,
        notes: 'Premium public operator-site enrichment stores SourceObservation records only; canonical payment_url/booking_url promotion is blocked until direct checkout links are observed and ToS review passes.',
      },
      create: {
        name: report.source.source_name,
        sourceKey: report.source.source_key,
        type: report.source.source_type,
        homepageUrl: report.source.source_url,
        sourceUrl: report.source.source_url,
        apiUrl: report.source.api_url,
        portalType: report.source.portal_type,
        recommendedConnector: 'premium_operator_public_site_parser',
        legalRisk: report.source.legal_risk,
        notes: 'Premium public operator-site enrichment stores SourceObservation records only; canonical payment_url/booking_url promotion is blocked until direct checkout links are observed and ToS review passes.',
      },
    });

    for (const record of report.records) {
      const rawProperties = JSON.parse(JSON.stringify(record)) as Prisma.InputJsonValue;
      const existing = await prisma.sourceObservation.findUnique({
        where: {
          sourceName_sourceId_entityType: {
            sourceName: record.source_name,
            sourceId: record.source_id,
            entityType: record.entity_type,
          },
        },
        select: { id: true },
      });
      await prisma.sourceObservation.upsert({
        where: {
          sourceName_sourceId_entityType: {
            sourceName: record.source_name,
            sourceId: record.source_id,
            entityType: record.entity_type,
          },
        },
        update: {
          entitySourceId: record.source_id,
          rawProperties,
          status: record.status,
          confidence: record.confidence,
          notes: 'Premium operator facility observation; no canonical payment/booking promotion in this slice.',
        },
        create: {
          sourceName: record.source_name,
          sourceId: record.source_id,
          entityType: record.entity_type,
          entitySourceId: record.source_id,
          rawProperties,
          status: record.status,
          confidence: record.confidence,
          notes: 'Premium operator facility observation; no canonical payment/booking promotion in this slice.',
        },
      });
      if (existing) updated += 1;
      else inserted += 1;
    }
    return { ...report, counts: { ...report.counts, records_inserted: inserted, records_updated: updated } };
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run') || !process.argv.includes('--import');
  const importRequested = process.argv.includes('--import') && !process.argv.includes('--dry-run');
  const limit = Math.max(1, Math.min(25, Number(argValue('--limit', '8'))));
  const fixturePath = argValue('--fixture');
  const warnings = dryRun ? ['Dry-run mode: no DB mutation; records_inserted and records_updated remain 0.'] : [];

  let market: PremiumMarket | null;
  if (fixturePath) {
    market = await readFixture(fixturePath);
  } else {
    const fetched = await fetchPremiumMarket(limit);
    market = fetched.market;
    if (fetched.warning) warnings.push(fetched.warning, 'Premium currently requires browser/client-authorized GraphQL access for live extraction; use --fixture with a browser-captured JSON payload for deterministic dry-run/import.');
  }

  const records = market ? normalizePremiumMarket(market).slice(0, limit) : [];
  const report = buildPremiumReport({ records, dryRun, importRequested, warnings });
  console.log(JSON.stringify(await persistPremiumReport(report), null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

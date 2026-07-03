import { safePercentage, safeUrl } from '@/lib/data-quality';

export type EnrichmentBacklogGroupName =
  | 'city'
  | 'layer'
  | 'source'
  | 'enrichment_status'
  | 'price_status'
  | 'missing_url_category'
  | 'stale_status'
  | 'conflict_review_status'
  | 'confidence_band';

export interface EnrichmentBacklogExample {
  parkingusa_id: string;
  source_name: string;
  source_id: string;
  layer: string;
  city: string;
  state: string;
  name: string;
  enrichment_status: string;
  price_status: string;
  rule_status: string;
  confidence: number | null;
  source_url: string;
  payment_url: string;
  booking_url: string;
  evidence_url: string;
}

export interface EnrichmentBacklogGroup {
  key: string;
  label: string;
  count: number;
  percentOfTotal: number;
  examples: EnrichmentBacklogExample[];
}

export interface EnrichmentBacklogReport {
  kind: 'derived_enrichment_backlog_report';
  label: string;
  derived: true;
  persisted: false;
  scopeNote: string;
  totalRecords: number;
  backlogRecords: number;
  completeRecords: number;
  backlogPercent: number;
  completePercent: number;
  maxExamplesPerGroup: number;
  groups: Record<EnrichmentBacklogGroupName, EnrichmentBacklogGroup[]>;
}

interface GroupBucket {
  key: string;
  label: string;
  count: number;
  examples: EnrichmentBacklogExample[];
}

const DEFAULT_MAX_EXAMPLES_PER_GROUP = 3;
const STALE_DAYS = 365;

const GROUP_LABELS: Record<string, string> = {
  missing_source_url: 'Missing source URL',
  missing_api_url: 'Missing API URL',
  missing_payment_url: 'Missing payment URL',
  missing_booking_url: 'Missing booking URL',
  missing_payment_or_booking_url: 'Missing payment or booking URL',
  missing_evidence_url: 'Missing evidence URL',
  stale: 'Stale by date or status',
  current_or_unknown: 'Current or no stale signal',
  conflict: 'Conflict flagged',
  needs_review: 'Needs review',
  no_conflict_or_review: 'No conflict or review flag',
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
  unknown: 'Unknown',
};

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function statusValue(value: unknown): string {
  const text = stringValue(value);
  return text || 'unknown';
}

function hasSafeUrl(value: unknown): boolean {
  return typeof value === 'string' && safeUrl(value).length > 0;
}

function staleDate(value: unknown): boolean {
  const text = stringValue(value);
  if (!text) return false;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return false;
  const diffDays = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays > STALE_DAYS;
}

function isStaleRecord(props: Record<string, unknown>): boolean {
  return (
    props.price_status === 'stale' ||
    props.rule_status === 'stale' ||
    props.enrichment_status === 'stale' ||
    staleDate(props.last_verified_at) ||
    staleDate(props.data_as_of)
  );
}

function confidenceBand(props: Record<string, unknown>): string {
  const confidence = numberValue(props.confidence) ?? numberValue(props.sourceConfidence);
  if (confidence === null) return 'unknown';
  if (confidence >= 0.75) return 'high';
  if (confidence >= 0.5) return 'medium';
  return 'low';
}

function conflictReviewStatus(props: Record<string, unknown>): string {
  if (props.enrichment_status === 'conflict' || props.rule_status === 'conflict') return 'conflict';
  if (props.enrichment_status === 'needs_review') return 'needs_review';
  return 'no_conflict_or_review';
}

function missingUrlCategories(props: Record<string, unknown>): string[] {
  const categories: string[] = [];
  const hasPayment = hasSafeUrl(props.payment_url);
  const hasBooking = hasSafeUrl(props.booking_url);

  if (!hasSafeUrl(props.source_url)) categories.push('missing_source_url');
  if (!hasSafeUrl(props.api_url)) categories.push('missing_api_url');
  if (!hasPayment) categories.push('missing_payment_url');
  if (!hasBooking) categories.push('missing_booking_url');
  if (!hasPayment && !hasBooking) categories.push('missing_payment_or_booking_url');
  if (!hasSafeUrl(props.evidence_url)) categories.push('missing_evidence_url');

  return categories;
}

function exampleFromProperties(props: Record<string, unknown>): EnrichmentBacklogExample {
  return {
    parkingusa_id: stringValue(props.parkingusa_id),
    source_name: stringValue(props.source_name) || stringValue(props.last_verified_source) || 'unknown',
    source_id: stringValue(props.source_id),
    layer: statusValue(props.parkingusa_layer),
    city: stringValue(props.city),
    state: stringValue(props.state),
    name: stringValue(props.name) || stringValue(props.street) || stringValue(props.neighborhood),
    enrichment_status: statusValue(props.enrichment_status),
    price_status: statusValue(props.price_status),
    rule_status: statusValue(props.rule_status),
    confidence: numberValue(props.confidence) ?? numberValue(props.sourceConfidence),
    source_url: hasSafeUrl(props.source_url) ? stringValue(props.source_url) : '',
    payment_url: hasSafeUrl(props.payment_url) ? stringValue(props.payment_url) : '',
    booking_url: hasSafeUrl(props.booking_url) ? stringValue(props.booking_url) : '',
    evidence_url: hasSafeUrl(props.evidence_url) ? stringValue(props.evidence_url) : '',
  };
}

function bucketLabel(key: string): string {
  return GROUP_LABELS[key] ?? key;
}

function addToGroup(
  buckets: Map<string, GroupBucket>,
  key: string,
  example: EnrichmentBacklogExample,
  maxExamplesPerGroup: number,
) {
  const safeKey = key || 'unknown';
  const bucket = buckets.get(safeKey) ?? {
    key: safeKey,
    label: bucketLabel(safeKey),
    count: 0,
    examples: [],
  };

  bucket.count += 1;
  if (bucket.examples.length < maxExamplesPerGroup) {
    bucket.examples.push(example);
  }
  buckets.set(safeKey, bucket);
}

function finalizeGroups(
  buckets: Map<string, GroupBucket>,
  totalRecords: number,
): EnrichmentBacklogGroup[] {
  return [...buckets.values()]
    .map((bucket) => ({
      ...bucket,
      percentOfTotal: safePercentage(bucket.count, totalRecords, 1),
    }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function emptyGroupMaps(): Record<EnrichmentBacklogGroupName, Map<string, GroupBucket>> {
  return {
    city: new Map(),
    layer: new Map(),
    source: new Map(),
    enrichment_status: new Map(),
    price_status: new Map(),
    missing_url_category: new Map(),
    stale_status: new Map(),
    conflict_review_status: new Map(),
    confidence_band: new Map(),
  };
}

function finalizeGroupMaps(
  buckets: Record<EnrichmentBacklogGroupName, Map<string, GroupBucket>>,
  totalRecords: number,
): Record<EnrichmentBacklogGroupName, EnrichmentBacklogGroup[]> {
  return {
    city: finalizeGroups(buckets.city, totalRecords),
    layer: finalizeGroups(buckets.layer, totalRecords),
    source: finalizeGroups(buckets.source, totalRecords),
    enrichment_status: finalizeGroups(buckets.enrichment_status, totalRecords),
    price_status: finalizeGroups(buckets.price_status, totalRecords),
    missing_url_category: finalizeGroups(buckets.missing_url_category, totalRecords),
    stale_status: finalizeGroups(buckets.stale_status, totalRecords),
    conflict_review_status: finalizeGroups(buckets.conflict_review_status, totalRecords),
    confidence_band: finalizeGroups(buckets.confidence_band, totalRecords),
  };
}

export function computeDerivedEnrichmentBacklog(
  records: Record<string, unknown>[],
  options: { cityId?: string; maxExamplesPerGroup?: number } = {},
): EnrichmentBacklogReport {
  const totalRecords = records.length;
  const maxExamplesPerGroup = options.maxExamplesPerGroup ?? DEFAULT_MAX_EXAMPLES_PER_GROUP;
  const buckets = emptyGroupMaps();
  let backlogRecords = 0;

  for (const props of records) {
    const example = exampleFromProperties(props);
    const enrichmentStatus = statusValue(props.enrichment_status);
    const priceStatus = statusValue(props.price_status);
    const city = stringValue(props.city) || options.cityId || 'unknown';
    const layer = statusValue(props.parkingusa_layer);
    const source = stringValue(props.source_name) || stringValue(props.last_verified_source) || 'unknown';
    const needsBacklog = props.needs_enrichment === true || enrichmentStatus !== 'complete';

    if (needsBacklog) backlogRecords += 1;

    addToGroup(buckets.city, city, example, maxExamplesPerGroup);
    addToGroup(buckets.layer, layer, example, maxExamplesPerGroup);
    addToGroup(buckets.source, source, example, maxExamplesPerGroup);
    addToGroup(buckets.enrichment_status, enrichmentStatus, example, maxExamplesPerGroup);
    addToGroup(buckets.price_status, priceStatus, example, maxExamplesPerGroup);
    addToGroup(
      buckets.stale_status,
      isStaleRecord(props) ? 'stale' : 'current_or_unknown',
      example,
      maxExamplesPerGroup,
    );
    addToGroup(buckets.conflict_review_status, conflictReviewStatus(props), example, maxExamplesPerGroup);
    addToGroup(buckets.confidence_band, confidenceBand(props), example, maxExamplesPerGroup);

    for (const category of missingUrlCategories(props)) {
      addToGroup(buckets.missing_url_category, category, example, maxExamplesPerGroup);
    }
  }

  const completeRecords = totalRecords - backlogRecords;

  return {
    kind: 'derived_enrichment_backlog_report',
    label: 'Derived enrichment backlog/report',
    derived: true,
    persisted: false,
    scopeNote:
      'Calculated from current canonical records at request time. It does not persist tasks, assign owners, schedule work, or notify operators.',
    totalRecords,
    backlogRecords,
    completeRecords,
    backlogPercent: safePercentage(backlogRecords, totalRecords, 1),
    completePercent: safePercentage(completeRecords, totalRecords, 1),
    maxExamplesPerGroup,
    groups: finalizeGroupMaps(buckets, totalRecords),
  };
}

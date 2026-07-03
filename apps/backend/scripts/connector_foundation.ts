import crypto from 'node:crypto';

export type PortalType = 'socrata' | 'arcgis_rest' | 'ckan';

export interface ConnectorSourceConfig {
  sourceKey: string;
  sourceName: string;
  sourceType: string;
  portalType: PortalType;
  sourceUrl: string | null;
  metadataUrl: string | null;
  apiUrl: string | null;
  evidenceUrlStrategy: string;
  stableSourceIdStrategy: string;
  freshnessMapping: string;
  paginationPath: string;
  idempotentUpsertKey: string;
  paymentUrl?: string | null;
  bookingUrl?: string | null;
  legalRisk?: string | null;
  confidence?: number | null;
  city?: string | null;
  state?: string | null;
}

export interface ConnectorRecord {
  source_name: string;
  source_id: string;
  source_url: string | null;
  api_url: string | null;
  evidence_url: string | null;
  payment_url: string | null;
  booking_url: string | null;
  price_status: string;
  rule_status: string;
  last_verified_at: string | null;
  data_as_of: string | null;
  raw_properties: Record<string, unknown>;
  upsert_key: {
    model: 'SourceObservation';
    unique: 'sourceName_sourceId_entityType';
    sourceName: string;
    sourceId: string;
    entityType: string;
  };
}

export interface ConnectorReport {
  connector_key: PortalType;
  dry_run: boolean;
  import_requested: boolean;
  generated_at: string;
  source: ConnectorSourceConfig;
  counts: {
    records_seen: number;
    records_normalized: number;
    records_skipped: number;
    records_inserted: number;
    records_updated: number;
    records_error_count: number;
    total_available: number | null;
  };
  paging: {
    limit: number;
    pages_fetched: number;
    next_offset: number | null;
    path: string;
  };
  records: ConnectorRecord[];
  warnings: string[];
}

const PRIVATE_IPV4_RE = /^(localhost|127\.|10\.|0\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/i;

export function safePublicUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (hostname === '::1' || PRIVATE_IPV4_RE.test(hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function idTextOrNull(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'bigint') return String(value);
  return null;
}

export function numberOrNull(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isoDateOrNull(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString();
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value > 10_000_000_000 ? value : value * 1000);
    return Number.isNaN(date.valueOf()) ? null : date.toISOString();
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value.trim());
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

export function stableHash(value: unknown): string {
  return crypto.createHash('sha1').update(JSON.stringify(value)).digest('hex').slice(0, 16);
}

export function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'source';
}

export function buildSocrataSourceConfig(input: {
  sourceName?: string | null;
  sourceUrl: string;
  apiUrl: string;
  metadataUrl?: string | null;
  sourceKey?: string | null;
  legalRisk?: string | null;
  confidence?: number | null;
  city?: string | null;
  state?: string | null;
}): ConnectorSourceConfig {
  const datasetId = socrataDatasetId(input.apiUrl, input.metadataUrl ?? undefined);
  const sourceName = input.sourceName?.trim() || `Socrata ${datasetId}`;
  return {
    sourceKey: input.sourceKey?.trim() || `socrata-${datasetId}`,
    sourceName,
    sourceType: 'city_open_data',
    portalType: 'socrata',
    sourceUrl: safePublicUrl(input.sourceUrl),
    metadataUrl: safePublicUrl(input.metadataUrl),
    apiUrl: safePublicUrl(input.apiUrl),
    evidenceUrlStrategy: 'Use the human dataset page as dataset evidence and the bounded SODA API URL as row evidence.',
    stableSourceIdStrategy: 'Prefer Socrata :id; fall back to dataset id plus deterministic raw row hash when :id is unavailable.',
    freshnessMapping: 'Map rowsUpdatedAt/metadataUpdatedAt or row updated_at-style fields to data_as_of; dry-run time maps to last_verified_at.',
    paginationPath: 'SODA rows page with $limit, $offset, and stable $order=:id.',
    idempotentUpsertKey: 'SourceObservation(sourceName, sourceId, entityType=connector_record)',
    legalRisk: input.legalRisk ?? 'low_verify_license',
    confidence: input.confidence ?? 0.75,
    city: input.city ?? null,
    state: input.state ?? null,
  };
}

export function buildArcgisSourceConfig(input: {
  sourceName?: string | null;
  sourceUrl: string;
  apiUrl: string;
  metadataUrl?: string | null;
  sourceKey?: string | null;
  legalRisk?: string | null;
  confidence?: number | null;
  city?: string | null;
  state?: string | null;
}): ConnectorSourceConfig {
  const layerUrl = arcgisLayerUrl(input.apiUrl);
  const sourceName = input.sourceName?.trim() || 'ArcGIS REST source';
  return {
    sourceKey: input.sourceKey?.trim() || `arcgis-${stableHash(layerUrl)}`,
    sourceName,
    sourceType: 'city_gis',
    portalType: 'arcgis_rest',
    sourceUrl: safePublicUrl(input.sourceUrl || layerUrl),
    metadataUrl: safePublicUrl(input.metadataUrl ?? arcgisMetadataUrl(input.apiUrl)),
    apiUrl: safePublicUrl(input.apiUrl),
    evidenceUrlStrategy: 'Use the layer metadata URL plus object-id query URL for each sample record.',
    stableSourceIdStrategy: 'Prefer GlobalID, then OBJECTID/objectIdField, then deterministic raw feature hash.',
    freshnessMapping: 'Map editingInfo.lastEditDate or date-like row attributes to data_as_of; dry-run time maps to last_verified_at.',
    paginationPath: 'ArcGIS REST query with resultOffset, resultRecordCount, and OBJECTID ASC order.',
    idempotentUpsertKey: 'SourceObservation(sourceName, sourceId, entityType=connector_record)',
    legalRisk: input.legalRisk ?? 'low_verify_license',
    confidence: input.confidence ?? 0.75,
    city: input.city ?? null,
    state: input.state ?? null,
  };
}

export function buildCkanSourceConfig(input: {
  sourceName?: string | null;
  sourceUrl: string;
  apiUrl: string;
  metadataUrl?: string | null;
  sourceKey?: string | null;
  legalRisk?: string | null;
  confidence?: number | null;
  city?: string | null;
  state?: string | null;
}): ConnectorSourceConfig {
  const sourceName = input.sourceName?.trim() || 'CKAN/Data.gov source';
  return {
    sourceKey: input.sourceKey?.trim() || `ckan-${stableHash(input.apiUrl)}`,
    sourceName,
    sourceType: 'open_data_catalog_record',
    portalType: 'ckan',
    sourceUrl: safePublicUrl(input.sourceUrl),
    metadataUrl: safePublicUrl(input.metadataUrl),
    apiUrl: safePublicUrl(input.apiUrl),
    evidenceUrlStrategy: 'Use the dataset page as evidence; resource rows use datastore_search URL when available.',
    stableSourceIdStrategy: 'Use dataset name plus resource id; datastore rows append _id or deterministic row hash.',
    freshnessMapping: 'Map metadata_modified/metadata_created or resource last_modified to data_as_of; dry-run time maps to last_verified_at.',
    paginationPath: 'CKAN package_search rows/start or datastore_search limit/offset; Data.gov metadata search may use cursor after in later production work.',
    idempotentUpsertKey: 'SourceObservation(sourceName, sourceId, entityType=connector_record)',
    legalRisk: input.legalRisk ?? 'low_verify_dataset_license',
    confidence: input.confidence ?? 0.7,
    city: input.city ?? null,
    state: input.state ?? null,
  };
}

export function socrataDatasetId(apiUrl: string, metadataUrl?: string): string {
  const candidate = metadataUrl || apiUrl;
  const metadataMatch = candidate.match(/\/api\/views\/([^/?#]+)/);
  if (metadataMatch?.[1]) return metadataMatch[1];
  const resourceMatch = candidate.match(/\/resource\/([^/.?#]+)/);
  return resourceMatch?.[1] ?? stableHash(candidate);
}

export function socrataPageUrl(apiUrl: string, limit: number, offset: number): string {
  const url = new URL(apiUrl);
  url.searchParams.set('$limit', String(limit));
  url.searchParams.set('$offset', String(offset));
  if (!url.searchParams.has('$order')) url.searchParams.set('$order', ':id');
  return url.toString();
}

export function socrataCountUrl(apiUrl: string): string {
  const url = new URL(apiUrl);
  url.searchParams.set('$select', 'count(*)');
  return url.toString();
}

export function socrataRecordId(row: Record<string, unknown>, datasetId: string): string {
  const rawId = textOrNull(row[':id']) || textOrNull(row.id) || textOrNull(row._id);
  return rawId ? `socrata:${datasetId}:${rawId}` : `socrata:${datasetId}:row-hash:${stableHash(row)}`;
}

export function normalizeSocrataRecord(
  source: ConnectorSourceConfig,
  row: Record<string, unknown>,
  apiUrl: string,
  verifiedAt = new Date(),
): ConnectorRecord {
  const datasetId = socrataDatasetId(apiUrl, source.metadataUrl ?? undefined);
  const sourceId = socrataRecordId(row, datasetId);
  const rowEvidenceUrl = safePublicUrl(source.sourceUrl) ?? safePublicUrl(apiUrl);
  return normalizeConnectorRecord({
    source,
    sourceId,
    apiUrl,
    evidenceUrl: rowEvidenceUrl,
    priceStatus: inferPriceStatus(row),
    ruleStatus: inferRuleStatus(row),
    lastVerifiedAt: verifiedAt.toISOString(),
    dataAsOf: firstDate(row, ['data_as_of', 'updated_at', 'last_updated', 'modified', 'last_modified']),
    rawProperties: row,
  });
}

export function arcgisLayerUrl(apiUrl: string): string {
  const queryIndex = apiUrl.indexOf('/query');
  if (queryIndex >= 0) return apiUrl.slice(0, queryIndex);
  return apiUrl.replace(/[?].*$/, '').replace(/\/$/, '');
}

export function arcgisMetadataUrl(apiUrl: string): string {
  const url = new URL(arcgisLayerUrl(apiUrl));
  url.search = '';
  url.searchParams.set('f', 'json');
  return url.toString();
}

export function arcgisQueryUrl(apiUrl: string, limit: number, offset: number, objectIdField = 'OBJECTID'): string {
  const base = apiUrl.includes('/query') ? apiUrl : `${arcgisLayerUrl(apiUrl)}/query`;
  const url = new URL(base);
  url.searchParams.set('where', url.searchParams.get('where') || '1=1');
  url.searchParams.set('outFields', url.searchParams.get('outFields') || '*');
  url.searchParams.set('returnGeometry', url.searchParams.get('returnGeometry') || 'false');
  url.searchParams.set('f', 'json');
  url.searchParams.set('resultRecordCount', String(limit));
  url.searchParams.set('resultOffset', String(offset));
  url.searchParams.set('orderByFields', `${objectIdField} ASC`);
  return url.toString();
}

export function arcgisCountUrl(apiUrl: string): string {
  const base = apiUrl.includes('/query') ? apiUrl : `${arcgisLayerUrl(apiUrl)}/query`;
  const url = new URL(base);
  url.searchParams.set('where', url.searchParams.get('where') || '1=1');
  url.searchParams.set('returnCountOnly', 'true');
  url.searchParams.set('f', 'json');
  return url.toString();
}

export function arcgisRecordId(attributes: Record<string, unknown>, sourceKey: string, objectIdField = 'OBJECTID'): string {
  const globalId = textOrNull(attributes.GlobalID) || textOrNull(attributes.GLOBALID) || textOrNull(attributes.globalid);
  const objectId = idTextOrNull(attributes[objectIdField])
    || idTextOrNull(attributes.OBJECTID)
    || idTextOrNull(attributes.ObjectId)
    || idTextOrNull(attributes.objectid);
  if (globalId) return `arcgis:${sourceKey}:globalid:${globalId}`;
  if (objectId) return `arcgis:${sourceKey}:objectid:${objectId}`;
  return `arcgis:${sourceKey}:feature-hash:${stableHash(attributes)}`;
}

export function arcgisEvidenceUrl(apiUrl: string, objectId: unknown, objectIdField = 'OBJECTID'): string | null {
  if (objectId === null || objectId === undefined || objectId === '') return safePublicUrl(arcgisMetadataUrl(apiUrl));
  const url = new URL(`${arcgisLayerUrl(apiUrl)}/query`);
  url.searchParams.set('where', `${objectIdField}=${objectId}`);
  url.searchParams.set('outFields', '*');
  url.searchParams.set('returnGeometry', 'false');
  url.searchParams.set('f', 'json');
  return safePublicUrl(url.toString());
}

export function normalizeArcgisFeature(
  source: ConnectorSourceConfig,
  feature: Record<string, unknown>,
  apiUrl: string,
  objectIdField = 'OBJECTID',
  verifiedAt = new Date(),
): ConnectorRecord {
  const attributes = typeof feature.attributes === 'object' && feature.attributes
    ? feature.attributes as Record<string, unknown>
    : feature;
  const objectId = attributes[objectIdField] ?? attributes.OBJECTID ?? attributes.ObjectId ?? attributes.objectid ?? null;
  return normalizeConnectorRecord({
    source,
    sourceId: arcgisRecordId(attributes, source.sourceKey, objectIdField),
    apiUrl,
    evidenceUrl: arcgisEvidenceUrl(apiUrl, objectId, objectIdField),
    priceStatus: inferPriceStatus(attributes),
    ruleStatus: inferRuleStatus(attributes),
    lastVerifiedAt: verifiedAt.toISOString(),
    dataAsOf: firstDate(attributes, ['data_as_of', 'EditDate', 'last_edited_date', 'LASTUPDATE', 'last_update', 'updated_at']),
    rawProperties: attributes,
  });
}

export function ckanPackageSearchUrl(portal: string, query: string, rows: number, start: number): string {
  const url = new URL('/api/3/action/package_search', portal);
  url.searchParams.set('q', query);
  url.searchParams.set('rows', String(rows));
  url.searchParams.set('start', String(start));
  return url.toString();
}

export function ckanDatastoreSearchUrl(portal: string, resourceId: string, limit: number, offset: number): string {
  const url = new URL('/api/3/action/datastore_search', portal);
  url.searchParams.set('resource_id', resourceId);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('offset', String(offset));
  return url.toString();
}

export function ckanRecordId(pkg: Record<string, unknown>, resource: Record<string, unknown> | null, row?: Record<string, unknown>): string {
  const dataset = textOrNull(pkg.name) || textOrNull(pkg.id) || stableHash(pkg);
  const resourceId = resource ? textOrNull(resource.id) || textOrNull(resource.name) || stableHash(resource) : 'dataset';
  if (row) {
    const rowId = idTextOrNull(row._id) || idTextOrNull(row.id) || stableHash(row);
    return `ckan:${dataset}:${resourceId}:row:${rowId}`;
  }
  return `ckan:${dataset}:${resourceId}`;
}

export function normalizeCkanPackageRecord(
  source: ConnectorSourceConfig,
  portal: string,
  pkg: Record<string, unknown>,
  resource: Record<string, unknown> | null,
  apiUrl: string,
  verifiedAt = new Date(),
): ConnectorRecord {
  const datasetName = textOrNull(pkg.name) || textOrNull(pkg.id) || stableHash(pkg);
  const evidence = safePublicUrl(new URL(`/dataset/${datasetName}`, portal).toString());
  return normalizeConnectorRecord({
    source,
    sourceId: ckanRecordId(pkg, resource),
    apiUrl,
    evidenceUrl: evidence,
    priceStatus: inferPriceStatus({ ...pkg, ...(resource ?? {}) }),
    ruleStatus: inferRuleStatus({ ...pkg, ...(resource ?? {}) }),
    lastVerifiedAt: verifiedAt.toISOString(),
    dataAsOf: firstDate({ ...pkg, ...(resource ?? {}) }, ['metadata_modified', 'metadata_created', 'last_modified', 'created']),
    rawProperties: {
      package: pkg,
      resource,
    },
  });
}

export function normalizeConnectorRecord(input: {
  source: ConnectorSourceConfig;
  sourceId: string;
  apiUrl: string | null;
  evidenceUrl: string | null;
  priceStatus: string;
  ruleStatus: string;
  lastVerifiedAt: string | null;
  dataAsOf: string | null;
  rawProperties: Record<string, unknown>;
}): ConnectorRecord {
  return {
    source_name: input.source.sourceName,
    source_id: input.sourceId,
    source_url: safePublicUrl(input.source.sourceUrl),
    api_url: safePublicUrl(input.apiUrl),
    evidence_url: safePublicUrl(input.evidenceUrl),
    payment_url: safePublicUrl(input.source.paymentUrl),
    booking_url: safePublicUrl(input.source.bookingUrl),
    price_status: input.priceStatus,
    rule_status: input.ruleStatus,
    last_verified_at: input.lastVerifiedAt,
    data_as_of: input.dataAsOf,
    raw_properties: input.rawProperties,
    upsert_key: {
      model: 'SourceObservation',
      unique: 'sourceName_sourceId_entityType',
      sourceName: input.source.sourceName,
      sourceId: input.sourceId,
      entityType: 'connector_record',
    },
  };
}

export function buildConnectorReport(input: {
  connectorKey: PortalType;
  dryRun: boolean;
  importRequested: boolean;
  source: ConnectorSourceConfig;
  records: ConnectorRecord[];
  recordsSeen: number;
  recordsSkipped?: number;
  recordsErrorCount?: number;
  totalAvailable?: number | null;
  limit: number;
  pagesFetched: number;
  nextOffset?: number | null;
  warnings?: string[];
  generatedAt?: Date;
}): ConnectorReport {
  return {
    connector_key: input.connectorKey,
    dry_run: input.dryRun,
    import_requested: input.importRequested,
    generated_at: (input.generatedAt ?? new Date()).toISOString(),
    source: input.source,
    counts: {
      records_seen: input.recordsSeen,
      records_normalized: input.records.length,
      records_skipped: input.recordsSkipped ?? Math.max(0, input.recordsSeen - input.records.length),
      records_inserted: 0,
      records_updated: 0,
      records_error_count: input.recordsErrorCount ?? 0,
      total_available: input.totalAvailable ?? null,
    },
    paging: {
      limit: input.limit,
      pages_fetched: input.pagesFetched,
      next_offset: input.nextOffset ?? null,
      path: input.source.paginationPath,
    },
    records: input.records,
    warnings: input.warnings ?? [],
  };
}

export async function persistConnectorReport(prisma: any, report: ConnectorReport): Promise<ConnectorReport> {
  if (report.dry_run) return report;

  const source = report.source;
  const run = await prisma.importRun.create({
    data: {
      sourceName: source.sourceName,
      sourceKey: source.sourceKey,
      connectorKey: report.connector_key,
      dryRun: false,
      status: 'running',
      recordsSeen: report.counts.records_seen,
      summary: {
        mode: 'connector_foundation',
        source,
      },
    },
  });

  let inserted = 0;
  let updated = 0;
  let errors = 0;

  try {
    await prisma.dataSource.upsert({
      where: { name: source.sourceName },
      update: {
        sourceKey: source.sourceKey,
        type: source.sourceType,
        homepageUrl: source.sourceUrl,
        sourceUrl: source.sourceUrl,
        metadataUrl: source.metadataUrl,
        apiUrl: source.apiUrl,
        portalType: source.portalType,
        recommendedConnector: `${source.portalType}_connector_foundation`,
        legalRisk: source.legalRisk,
        paymentUrl: source.paymentUrl ?? null,
        bookingUrl: source.bookingUrl ?? null,
        evidenceUrl: null,
        notes: connectorNotes(source),
      },
      create: {
        name: source.sourceName,
        sourceKey: source.sourceKey,
        type: source.sourceType,
        homepageUrl: source.sourceUrl,
        sourceUrl: source.sourceUrl,
        metadataUrl: source.metadataUrl,
        apiUrl: source.apiUrl,
        portalType: source.portalType,
        recommendedConnector: `${source.portalType}_connector_foundation`,
        legalRisk: source.legalRisk,
        paymentUrl: source.paymentUrl ?? null,
        bookingUrl: source.bookingUrl ?? null,
        evidenceUrl: null,
        notes: connectorNotes(source),
      },
    });

    for (const record of report.records) {
      const existing = await prisma.sourceObservation.findUnique({
        where: {
          sourceName_sourceId_entityType: {
            sourceName: record.source_name,
            sourceId: record.source_id,
            entityType: 'connector_record',
          },
        },
        select: { id: true },
      });

      await prisma.sourceObservation.upsert({
        where: {
          sourceName_sourceId_entityType: {
            sourceName: record.source_name,
            sourceId: record.source_id,
            entityType: 'connector_record',
          },
        },
        update: {
          entitySourceId: record.source_id,
          rawProperties: record,
          status: 'connector_sample',
          confidence: source.confidence ?? 0.7,
          notes: `Observed by ${report.connector_key} connector foundation.`,
        },
        create: {
          sourceName: record.source_name,
          sourceId: record.source_id,
          entityType: 'connector_record',
          entitySourceId: record.source_id,
          rawProperties: record,
          status: 'connector_sample',
          confidence: source.confidence ?? 0.7,
          notes: `Observed by ${report.connector_key} connector foundation.`,
        },
      });

      if (existing) updated += 1;
      else inserted += 1;
    }

    const persisted = {
      ...report,
      counts: {
        ...report.counts,
        records_inserted: inserted,
        records_updated: updated,
        records_error_count: errors,
      },
    };

    await prisma.importRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        status: 'completed',
        recordsInserted: inserted,
        recordsUpdated: updated,
        recordsSkipped: report.counts.records_skipped,
        recordsErrorCount: errors,
        summary: persisted,
      },
    });

    return persisted;
  } catch (error) {
    errors += 1;
    await prisma.importRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        status: 'failed',
        recordsInserted: inserted,
        recordsUpdated: updated,
        recordsSkipped: report.counts.records_skipped,
        recordsErrorCount: errors,
        error: error instanceof Error ? error.message : String(error),
        summary: report,
      },
    });
    throw error;
  }
}

export function connectorNotes(source: ConnectorSourceConfig): string {
  return [
    `source_key=${source.sourceKey}`,
    `portal_type=${source.portalType}`,
    `evidence=${source.evidenceUrlStrategy}`,
    `source_id=${source.stableSourceIdStrategy}`,
    `freshness=${source.freshnessMapping}`,
    `pagination=${source.paginationPath}`,
    `upsert=${source.idempotentUpsertKey}`,
  ].join('; ');
}

function inferPriceStatus(row: Record<string, unknown>): string {
  const haystack = JSON.stringify(row).toLowerCase();
  if (/\bfree\b|\$0|no charge/.test(haystack)) return 'known_free';
  if (/rate|price|fee|charge|hourly|daily|monthly|tariff/.test(haystack)) return 'known_priced';
  return 'unknown';
}

function inferRuleStatus(row: Record<string, unknown>): string {
  const haystack = JSON.stringify(row).toLowerCase();
  if (/hours|schedule|rule|restriction|permit|zone|limit|max/.test(haystack)) return 'partial';
  return 'unknown';
}

function firstDate(row: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const parsed = isoDateOrNull(row[key]);
    if (parsed) return parsed;
  }
  return null;
}

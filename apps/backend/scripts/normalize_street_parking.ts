import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient, type Prisma } from '@prisma/client';
import type { normalizeStreetParkingTags as NormalizeStreetParkingTags } from '../../frontend/lib/street-parking';

type JsonRecord = Record<string, unknown>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..', '..');

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require('@next/env') as {
  loadEnvConfig: (dir: string) => void;
};
loadEnvConfig(root);

const { normalizeStreetParkingTags } = require('../../frontend/lib/street-parking') as {
  normalizeStreetParkingTags: typeof NormalizeStreetParkingTags;
};
const prisma = new PrismaClient();

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

const positional = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const inputPath =
  positional[0] ?? path.join(root, 'data', 'sf_parking_zones_osm.geojson');
const outputPath =
  positional[1] ?? path.join(root, 'data', 'street_parking_normalized.json');
const importToDb = process.argv.includes('--db');

const SOURCE = {
  name: 'OpenStreetMap street parking normalization',
  type: 'derived_openstreetmap',
  homepageUrl: 'https://wiki.openstreetmap.org/wiki/Key:parking:left',
  license: 'ODbL-derived facts from OSM tags',
  notes:
    'Derived by ported osm-tag-updater transpose/utils modules from Referenss/osm-tag-updater.',
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function extractTags(record: JsonRecord): JsonRecord {
  const properties = asRecord(record.properties);
  return {
    ...asRecord(properties.raw_tags),
    ...asRecord(properties.tags),
    ...properties,
  };
}

function extractRecords(input: unknown): JsonRecord[] {
  if (Array.isArray(input)) return input.map(asRecord);

  const rootRecord = asRecord(input);
  const features = rootRecord.features;
  if (Array.isArray(features)) return features.map(asRecord);

  return [rootRecord];
}

async function ensureSource() {
  await prisma.dataSource.upsert({
    where: { name: SOURCE.name },
    update: SOURCE,
    create: SOURCE,
  });
}

async function upsertObservations(records: JsonRecord[]) {
  await ensureSource();
  const chunkSize = 250;
  let count = 0;

  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize);
    await prisma.$transaction(
      chunk.map((item) => {
        const sourceId = `street-normalized:${String(item.source_id)}`;
        const rawProperties = json({
          normalized_tags: item.normalized_tags,
          manual_tags: item.manual_tags,
          ignored_tags: item.ignored_tags,
        });

        return prisma.sourceObservation.upsert({
          where: {
            sourceName_sourceId_entityType: {
              sourceName: SOURCE.name,
              sourceId,
              entityType: 'street_parking_normalization',
            },
          },
          update: {
            entitySourceId: String(item.source_id),
            rawProperties,
            confidence: Number(item.confidence) || 0,
            notes:
              Number(item.manual_tags_count) > 0
                ? 'Contains manual review candidates from osm-tag-updater.'
                : null,
          },
          create: {
            sourceName: SOURCE.name,
            sourceId,
            entityType: 'street_parking_normalization',
            entitySourceId: String(item.source_id),
            rawProperties,
            confidence: Number(item.confidence) || 0,
            notes:
              Number(item.manual_tags_count) > 0
                ? 'Contains manual review candidates from osm-tag-updater.'
                : null,
          },
        });
      })
    );
    count += chunk.length;
    console.log(`street parking observations: ${count}/${records.length}`);
  }
}

async function main() {
  const raw = await readFile(inputPath, 'utf8');
  const input = JSON.parse(raw);
  const records = extractRecords(input);

  const normalized = records
    .map((record, index) => {
      const properties = asRecord(record.properties);
      const sourceId =
        properties.source_id ??
        properties.id ??
        record.id ??
        `record:${index + 1}`;
      const normalization = normalizeStreetParkingTags(extractTags(record));

      return {
        source_id: sourceId,
        confidence: normalization.confidence,
        normalized_tags: normalization.normalizedTags,
        manual_tags: normalization.manualTags,
        manual_tags_count: normalization.manualTags.length,
        ignored_tags: normalization.ignoredTags,
      };
    })
    .filter(
      (item) =>
        item.normalized_tags.length > 0 ||
        item.manual_tags.length > 0 ||
        item.ignored_tags.some((tag) => tag.startsWith('parking:lane:'))
    );

  const report = {
    source: path.relative(root, inputPath),
    output: path.relative(root, outputPath),
    records_seen: records.length,
    records_with_parking_lane_tags: normalized.length,
    normalized_tag_count: normalized.reduce(
      (sum, item) => sum + item.normalized_tags.length,
      0
    ),
    manual_review_count: normalized.filter((item) => item.manual_tags.length > 0)
      .length,
    records: normalized,
  };

  await writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');
  if (importToDb) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for normalize:street-parking -- --db');
    }
    await upsertObservations(normalized);
  }
  console.log(JSON.stringify({ ...report, records: undefined }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});

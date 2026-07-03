import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient, type Prisma } from '@prisma/client';
import type { CapacityHeuristic } from '../../frontend/lib/heuristics/parking-capacity';
import type { GeoJSONCollection, GeoJSONFeature } from '../../frontend/lib/data-loader';

type CapacityHeuristicRecord = CapacityHeuristic;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..', '..');
const require = createRequire(import.meta.url);
const { loadEnvConfig } = require('@next/env') as {
  loadEnvConfig: (dir: string) => void;
};
loadEnvConfig(root);

const { deriveCapacityHeuristics } = require('../../frontend/lib/heuristics/parking-capacity') as {
  deriveCapacityHeuristics: (zones: GeoJSONFeature[], curbs: GeoJSONFeature[]) => CapacityHeuristicRecord[];
};
const prisma = new PrismaClient();

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

const positional = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const zonesPath = positional[0] ?? path.join(root, 'data', 'sf_parking_zones_osm.geojson');
const curbsPath =
  positional[1] ?? path.join(root, 'data', 'sf_parking_curb_segments.geojson');
const outputPath =
  positional[2] ?? path.join(root, 'data', 'parking_capacity_heuristics.json');
const importToDb = process.argv.includes('--db');

const SOURCE = {
  name: 'A/B Street-derived parking capacity heuristics',
  type: 'derived_heuristic',
  homepageUrl: 'https://a-b-street.github.io/docs/tech/trafficsim/parking.html',
  license: 'Derived algorithmic facts; input data licenses apply.',
  notes:
    'Implements ParkingUSA TS heuristics inspired by A/B Street parking lot/curb capacity workflows, without porting Rust app code.',
};

async function readGeoJSON(filePath: string): Promise<GeoJSONCollection> {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw) as GeoJSONCollection;
}

async function ensureSource() {
  await prisma.dataSource.upsert({
    where: { name: SOURCE.name },
    update: SOURCE,
    create: SOURCE,
  });
}

async function upsertObservations(records: CapacityHeuristicRecord[]) {
  await ensureSource();
  const chunkSize = 500;
  let count = 0;

  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize);
    await prisma.$transaction(
      chunk.map((item) => {
        const sourceId = `capacity:${item.entityType}:${item.sourceId}`;
        return prisma.sourceObservation.upsert({
          where: {
            sourceName_sourceId_entityType: {
              sourceName: SOURCE.name,
              sourceId,
              entityType: 'parking_capacity_heuristic',
            },
          },
          update: {
            entitySourceId: item.sourceId,
            rawProperties: json(item),
            confidence: item.confidence,
            notes: item.reviewRequired ? 'Review required before treating as authoritative capacity.' : null,
          },
          create: {
            sourceName: SOURCE.name,
            sourceId,
            entityType: 'parking_capacity_heuristic',
            entitySourceId: item.sourceId,
            rawProperties: json(item),
            confidence: item.confidence,
            notes: item.reviewRequired ? 'Review required before treating as authoritative capacity.' : null,
          },
        });
      })
    );
    count += chunk.length;
    console.log(`capacity heuristics: ${count}/${records.length}`);
  }
}

async function main() {
  const [zones, curbs] = await Promise.all([readGeoJSON(zonesPath), readGeoJSON(curbsPath)]);
  const records = deriveCapacityHeuristics(zones.features ?? [], curbs.features ?? []);

  const report = {
    source: {
      zones: path.relative(root, zonesPath),
      curbs: path.relative(root, curbsPath),
    },
    output: path.relative(root, outputPath),
    records_seen: {
      zones: zones.features?.length ?? 0,
      curbs: curbs.features?.length ?? 0,
    },
    heuristics_count: records.length,
    review_required_count: records.filter((item) => item.reviewRequired).length,
    tagged_capacity_count: records.filter((item) => item.method === 'osm_tagged_capacity').length,
    records,
  };

  await writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');

  if (importToDb) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for derive:heuristics:db');
    }
    await upsertObservations(records);
  }

  console.log(JSON.stringify({ ...report, records: undefined }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});

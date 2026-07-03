ALTER TABLE "DataSource"
  ADD COLUMN IF NOT EXISTS "sourceKey" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "metadataUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "apiUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "portalType" TEXT,
  ADD COLUMN IF NOT EXISTS "recommendedConnector" TEXT,
  ADD COLUMN IF NOT EXISTS "legalRisk" TEXT,
  ADD COLUMN IF NOT EXISTS "paymentUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "bookingUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "evidenceUrl" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "DataSource_sourceKey_key" ON "DataSource"("sourceKey");

ALTER TABLE "ParkingFacility"
  ADD COLUMN IF NOT EXISTS "sourceUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "apiUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "paymentUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "bookingUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "evidenceUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "priceStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "ruleStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "enrichmentStatus" TEXT;

ALTER TABLE "CurbSegment"
  ADD COLUMN IF NOT EXISTS "city" TEXT,
  ADD COLUMN IF NOT EXISTS "state" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "apiUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "paymentUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "bookingUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "evidenceUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "priceStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "ruleStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "enrichmentStatus" TEXT;

CREATE INDEX IF NOT EXISTS "CurbSegment_city_state_idx" ON "CurbSegment"("city", "state");

ALTER TABLE "ParkingZone"
  ADD COLUMN IF NOT EXISTS "city" TEXT,
  ADD COLUMN IF NOT EXISTS "state" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "apiUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "paymentUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "bookingUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "evidenceUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "priceStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "ruleStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "enrichmentStatus" TEXT;

CREATE INDEX IF NOT EXISTS "ParkingZone_city_state_idx" ON "ParkingZone"("city", "state");

ALTER TABLE "SourceObservation"
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'pending_review';

CREATE TABLE IF NOT EXISTS "ImportRun" (
  "id" TEXT PRIMARY KEY,
  "sourceName" TEXT,
  "sourceKey" TEXT,
  "connectorKey" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'running',
  "dryRun" BOOLEAN NOT NULL DEFAULT false,
  "recordsSeen" INTEGER NOT NULL DEFAULT 0,
  "recordsInserted" INTEGER NOT NULL DEFAULT 0,
  "recordsUpdated" INTEGER NOT NULL DEFAULT 0,
  "recordsSkipped" INTEGER NOT NULL DEFAULT 0,
  "recordsErrorCount" INTEGER NOT NULL DEFAULT 0,
  "summary" JSONB,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ImportRun_sourceName_fkey" FOREIGN KEY ("sourceName") REFERENCES "DataSource"("name") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ImportRun_sourceName_status_startedAt_idx" ON "ImportRun"("sourceName", "status", "startedAt");
CREATE INDEX IF NOT EXISTS "ImportRun_sourceKey_status_startedAt_idx" ON "ImportRun"("sourceKey", "status", "startedAt");
CREATE INDEX IF NOT EXISTS "ImportRun_connectorKey_idx" ON "ImportRun"("connectorKey");

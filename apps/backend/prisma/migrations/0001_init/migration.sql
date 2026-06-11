CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS "DataSource" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL UNIQUE,
  "type" TEXT NOT NULL,
  "homepageUrl" TEXT,
  "license" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "ParkingFacility" (
  "id" TEXT PRIMARY KEY,
  "sourceName" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "name" TEXT,
  "facilityType" TEXT NOT NULL,
  "geometryType" TEXT NOT NULL,
  "geojson" JSONB NOT NULL,
  "lat" DOUBLE PRECISION,
  "lng" DOUBLE PRECISION,
  "city" TEXT NOT NULL DEFAULT 'San Francisco',
  "state" TEXT NOT NULL DEFAULT 'CA',
  "operator" TEXT,
  "access" TEXT,
  "capacity" TEXT,
  "fee" TEXT,
  "charge" TEXT,
  "baseHourlyRate" DOUBLE PRECISION,
  "openingHours" TEXT,
  "street" TEXT,
  "blockfaceId" TEXT,
  "neighborhood" TEXT,
  "meterType" TEXT,
  "capColor" TEXT,
  "rawProperties" JSONB NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "lastVerifiedAt" TIMESTAMP(3),
  "dataAsOf" TIMESTAMP(3),
  "geometryQuality" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ParkingFacility_sourceName_fkey" FOREIGN KEY ("sourceName") REFERENCES "DataSource"("name") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ParkingFacility_sourceName_sourceId_key" ON "ParkingFacility"("sourceName", "sourceId");
CREATE INDEX IF NOT EXISTS "ParkingFacility_facilityType_idx" ON "ParkingFacility"("facilityType");
CREATE INDEX IF NOT EXISTS "ParkingFacility_city_state_idx" ON "ParkingFacility"("city", "state");
CREATE INDEX IF NOT EXISTS "ParkingFacility_blockfaceId_idx" ON "ParkingFacility"("blockfaceId");
CREATE INDEX IF NOT EXISTS "ParkingFacility_sourceName_idx" ON "ParkingFacility"("sourceName");

CREATE TABLE IF NOT EXISTS "CurbSegment" (
  "id" TEXT PRIMARY KEY,
  "sourceName" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "blockfaceId" TEXT,
  "meterCount" INTEGER,
  "streetSample" TEXT,
  "neighborhood" TEXT,
  "baseHourlyRateMin" DOUBLE PRECISION,
  "baseHourlyRateMax" DOUBLE PRECISION,
  "charge" TEXT,
  "geojson" JSONB NOT NULL,
  "rawProperties" JSONB NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "lastVerifiedAt" TIMESTAMP(3),
  "dataAsOf" TIMESTAMP(3),
  "geometryQuality" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CurbSegment_sourceName_fkey" FOREIGN KEY ("sourceName") REFERENCES "DataSource"("name") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "CurbSegment_sourceName_sourceId_key" ON "CurbSegment"("sourceName", "sourceId");
CREATE INDEX IF NOT EXISTS "CurbSegment_blockfaceId_idx" ON "CurbSegment"("blockfaceId");
CREATE INDEX IF NOT EXISTS "CurbSegment_sourceName_idx" ON "CurbSegment"("sourceName");

CREATE TABLE IF NOT EXISTS "ParkingZone" (
  "id" TEXT PRIMARY KEY,
  "sourceName" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "name" TEXT,
  "facilityType" TEXT,
  "operator" TEXT,
  "access" TEXT,
  "fee" TEXT,
  "charge" TEXT,
  "capacity" TEXT,
  "openingHours" TEXT,
  "website" TEXT,
  "geojson" JSONB NOT NULL,
  "rawProperties" JSONB NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "lastVerifiedAt" TIMESTAMP(3),
  "dataAsOf" TIMESTAMP(3),
  "geometryQuality" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ParkingZone_sourceName_fkey" FOREIGN KEY ("sourceName") REFERENCES "DataSource"("name") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ParkingZone_sourceName_sourceId_key" ON "ParkingZone"("sourceName", "sourceId");
CREATE INDEX IF NOT EXISTS "ParkingZone_facilityType_idx" ON "ParkingZone"("facilityType");
CREATE INDEX IF NOT EXISTS "ParkingZone_sourceName_idx" ON "ParkingZone"("sourceName");

CREATE TABLE IF NOT EXISTS "SourceObservation" (
  "id" TEXT PRIMARY KEY,
  "sourceName" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entitySourceId" TEXT,
  "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rawProperties" JSONB NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SourceObservation_sourceName_fkey" FOREIGN KEY ("sourceName") REFERENCES "DataSource"("name") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "SourceObservation_sourceName_sourceId_idx" ON "SourceObservation"("sourceName", "sourceId");
CREATE INDEX IF NOT EXISTS "SourceObservation_entityType_entitySourceId_idx" ON "SourceObservation"("entityType", "entitySourceId");

CREATE TABLE IF NOT EXISTS "OccupancyEvent" (
  "id" TEXT PRIMARY KEY,
  "sourceName" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "facilitySource" TEXT,
  "curbSource" TEXT,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "occupancy" INTEGER,
  "capacity" INTEGER,
  "available" INTEGER,
  "sensors" TEXT,
  "rawProperties" JSONB NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "OccupancyEvent_sourceName_sourceId_idx" ON "OccupancyEvent"("sourceName", "sourceId");
CREATE INDEX IF NOT EXISTS "OccupancyEvent_facilitySource_idx" ON "OccupancyEvent"("facilitySource");
CREATE INDEX IF NOT EXISTS "OccupancyEvent_curbSource_idx" ON "OccupancyEvent"("curbSource");
CREATE INDEX IF NOT EXISTS "OccupancyEvent_observedAt_idx" ON "OccupancyEvent"("observedAt");

CREATE TABLE IF NOT EXISTS "Prediction" (
  "id" TEXT PRIMARY KEY,
  "sourceName" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "facilitySource" TEXT,
  "curbSource" TEXT,
  "predictedFor" TIMESTAMP(3) NOT NULL,
  "value" DOUBLE PRECISION NOT NULL,
  "probability" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "minOccupancy" INTEGER,
  "maxOccupancy" INTEGER,
  "rawProperties" JSONB NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "Prediction_sourceName_sourceId_idx" ON "Prediction"("sourceName", "sourceId");
CREATE INDEX IF NOT EXISTS "Prediction_facilitySource_idx" ON "Prediction"("facilitySource");
CREATE INDEX IF NOT EXISTS "Prediction_curbSource_idx" ON "Prediction"("curbSource");
CREATE INDEX IF NOT EXISTS "Prediction_predictedFor_idx" ON "Prediction"("predictedFor");

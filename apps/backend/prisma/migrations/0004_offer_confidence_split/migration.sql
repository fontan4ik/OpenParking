ALTER TABLE "ParkingFacility"
  ADD COLUMN IF NOT EXISTS "sourceConfidence" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "offerConfidence" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "displayConfidence" DOUBLE PRECISION;

ALTER TABLE "CurbSegment"
  ADD COLUMN IF NOT EXISTS "sourceConfidence" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "offerConfidence" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "displayConfidence" DOUBLE PRECISION;

ALTER TABLE "ParkingZone"
  ADD COLUMN IF NOT EXISTS "sourceConfidence" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "offerConfidence" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "displayConfidence" DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS "ParkingFacility_offerConfidence_idx" ON "ParkingFacility"("offerConfidence");
CREATE INDEX IF NOT EXISTS "CurbSegment_offerConfidence_idx" ON "CurbSegment"("offerConfidence");
CREATE INDEX IF NOT EXISTS "ParkingZone_offerConfidence_idx" ON "ParkingZone"("offerConfidence");

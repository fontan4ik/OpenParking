CREATE UNIQUE INDEX "SourceObservation_sourceName_sourceId_entityType_key"
  ON "SourceObservation"("sourceName", "sourceId", "entityType");

-- Keep the ingestion lease lifecycle separate from the end-to-end pipeline outcome.
ALTER TABLE "DailyIngestionRun" ADD COLUMN "pipelineStatus" TEXT;
ALTER TABLE "DailyIngestionRun" ADD COLUMN "pipelineFinishedAt" DATETIME;

CREATE INDEX "DailyIngestionRun_pipelineStatus_startedAt_idx"
ON "DailyIngestionRun"("pipelineStatus", "startedAt");

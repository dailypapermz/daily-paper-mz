-- Track the downstream pipeline lease separately from the completed ingestion lease.
DROP INDEX "DailyIngestionRun_pipelineStatus_startedAt_idx";

ALTER TABLE "DailyIngestionRun"
ADD COLUMN "pipelineStartedAt" TIMESTAMP(3);

CREATE INDEX "DailyIngestionRun_pipelineStatus_pipelineStartedAt_idx"
ON "DailyIngestionRun"("pipelineStatus", "pipelineStartedAt");

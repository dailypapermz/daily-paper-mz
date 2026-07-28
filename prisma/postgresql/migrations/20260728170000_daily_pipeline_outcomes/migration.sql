-- Keep the ingestion lease lifecycle separate from the end-to-end pipeline outcome.
CREATE TYPE "DailyPipelineRunStatus" AS ENUM (
  'RUNNING',
  'COMPLETE',
  'COMPLETE_WITH_WARNINGS',
  'PARTIAL',
  'FAILED'
);

ALTER TABLE "DailyIngestionRun"
ADD COLUMN "pipelineStatus" "DailyPipelineRunStatus",
ADD COLUMN "pipelineFinishedAt" TIMESTAMP(3);

CREATE INDEX "DailyIngestionRun_pipelineStatus_startedAt_idx"
ON "DailyIngestionRun"("pipelineStatus", "startedAt");

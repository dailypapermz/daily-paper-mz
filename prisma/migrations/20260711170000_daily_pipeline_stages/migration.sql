CREATE TABLE "DailyPipelineStageRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "errorMessage" TEXT,
    "detailsJson" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DailyPipelineStageRun_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DailyIngestionRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DailyPipelineStageRun_runId_stage_key" ON "DailyPipelineStageRun"("runId", "stage");
CREATE INDEX "DailyPipelineStageRun_runId_status_idx" ON "DailyPipelineStageRun"("runId", "status");

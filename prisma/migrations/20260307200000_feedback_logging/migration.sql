-- CreateTable
CREATE TABLE "CandidateFeedbackLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "oldValueJson" JSONB,
    "newValueJson" JSONB,
    "metadataJson" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CandidateFeedbackLog_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DailyIngestionRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CandidateFeedbackLog_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "DailyCanonicalCandidate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CandidateFeedbackLog_runId_createdAt_idx" ON "CandidateFeedbackLog"("runId", "createdAt");

-- CreateIndex
CREATE INDEX "CandidateFeedbackLog_candidateId_actionType_createdAt_idx" ON "CandidateFeedbackLog"("candidateId", "actionType", "createdAt");


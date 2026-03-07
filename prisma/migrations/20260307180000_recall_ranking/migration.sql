-- CreateTable
CREATE TABLE "DailyRecallRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "profileSnapshotId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "requestedTopN" INTEGER NOT NULL,
    "candidateCount" INTEGER NOT NULL DEFAULT 0,
    "recalledCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DailyRecallRun_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DailyIngestionRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DailyRecallRun_profileSnapshotId_fkey" FOREIGN KEY ("profileSnapshotId") REFERENCES "ProfileSnapshot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailyRecallResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recallRunId" TEXT NOT NULL,
    "canonicalCandidateId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "selected" BOOLEAN NOT NULL DEFAULT true,
    "recallScore" REAL NOT NULL,
    "semanticScore" REAL NOT NULL,
    "tagOverlapScore" REAL NOT NULL,
    "researchTypeScore" REAL NOT NULL,
    "sourceScopeScore" REAL NOT NULL,
    "reasonsJson" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DailyRecallResult_recallRunId_fkey" FOREIGN KEY ("recallRunId") REFERENCES "DailyRecallRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DailyRecallResult_canonicalCandidateId_fkey" FOREIGN KEY ("canonicalCandidateId") REFERENCES "DailyCanonicalCandidate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DailyRecallRun_runId_startedAt_idx" ON "DailyRecallRun"("runId", "startedAt");

-- CreateIndex
CREATE INDEX "DailyRecallRun_status_startedAt_idx" ON "DailyRecallRun"("status", "startedAt");

-- CreateIndex
CREATE INDEX "DailyRecallResult_recallRunId_rank_idx" ON "DailyRecallResult"("recallRunId", "rank");

-- CreateIndex
CREATE INDEX "DailyRecallResult_selected_recallScore_idx" ON "DailyRecallResult"("selected", "recallScore");

-- CreateIndex
CREATE UNIQUE INDEX "DailyRecallResult_recallRunId_canonicalCandidateId_key" ON "DailyRecallResult"("recallRunId", "canonicalCandidateId");


-- CreateTable
CREATE TABLE "DailyRerankRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "recallRunId" TEXT NOT NULL,
    "profileSnapshotId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "requestedTopN" INTEGER NOT NULL,
    "candidateCount" INTEGER NOT NULL DEFAULT 0,
    "recommendedCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DailyRerankRun_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DailyIngestionRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DailyRerankRun_recallRunId_fkey" FOREIGN KEY ("recallRunId") REFERENCES "DailyRecallRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DailyRerankRun_profileSnapshotId_fkey" FOREIGN KEY ("profileSnapshotId") REFERENCES "ProfileSnapshot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailyRecommendationResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rerankRunId" TEXT NOT NULL,
    "canonicalCandidateId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "selected" BOOLEAN NOT NULL DEFAULT true,
    "finalScore" REAL NOT NULL,
    "recallScore" REAL NOT NULL,
    "recentCoreScore" REAL NOT NULL,
    "stableLongTermScore" REAL NOT NULL,
    "highAttentionScore" REAL NOT NULL,
    "contentTagScore" REAL NOT NULL,
    "researchTypeScore" REAL NOT NULL,
    "collectionWeightScore" REAL NOT NULL,
    "sourcePriorityScore" REAL NOT NULL,
    "journalQualityScore" REAL NOT NULL,
    "userCorrectedScore" REAL NOT NULL,
    "recencyScore" REAL NOT NULL,
    "reasonsJson" JSONB NOT NULL,
    "featureWeightsJson" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DailyRecommendationResult_rerankRunId_fkey" FOREIGN KEY ("rerankRunId") REFERENCES "DailyRerankRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DailyRecommendationResult_canonicalCandidateId_fkey" FOREIGN KEY ("canonicalCandidateId") REFERENCES "DailyCanonicalCandidate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DailyRerankRun_runId_startedAt_idx" ON "DailyRerankRun"("runId", "startedAt");

-- CreateIndex
CREATE INDEX "DailyRerankRun_status_startedAt_idx" ON "DailyRerankRun"("status", "startedAt");

-- CreateIndex
CREATE INDEX "DailyRecommendationResult_rerankRunId_rank_idx" ON "DailyRecommendationResult"("rerankRunId", "rank");

-- CreateIndex
CREATE INDEX "DailyRecommendationResult_selected_finalScore_idx" ON "DailyRecommendationResult"("selected", "finalScore");

-- CreateIndex
CREATE UNIQUE INDEX "DailyRecommendationResult_rerankRunId_canonicalCandidateId_key" ON "DailyRecommendationResult"("rerankRunId", "canonicalCandidateId");


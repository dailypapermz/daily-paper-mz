-- CreateTable
CREATE TABLE "DailyIngestionRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "runDate" DATETIME NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "candidatesCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DailyCandidate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT,
    "abstractNote" TEXT,
    "publishedAt" DATETIME,
    "indexedAt" DATETIME,
    "url" TEXT,
    "doi" TEXT,
    "pmid" TEXT,
    "arxivId" TEXT,
    "bioRxivId" TEXT,
    "journalName" TEXT,
    "authorsJson" JSONB,
    "sourcePayloadJson" JSONB NOT NULL,
    "ingestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DailyCandidate_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DailyIngestionRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DailyIngestionRun_source_runDate_idx" ON "DailyIngestionRun"("source", "runDate");

-- CreateIndex
CREATE INDEX "DailyIngestionRun_status_startedAt_idx" ON "DailyIngestionRun"("status", "startedAt");

-- CreateIndex
CREATE INDEX "DailyCandidate_runId_idx" ON "DailyCandidate"("runId");

-- CreateIndex
CREATE INDEX "DailyCandidate_source_publishedAt_idx" ON "DailyCandidate"("source", "publishedAt");

-- CreateIndex
CREATE INDEX "DailyCandidate_source_indexedAt_idx" ON "DailyCandidate"("source", "indexedAt");

-- CreateIndex
CREATE INDEX "DailyCandidate_doi_idx" ON "DailyCandidate"("doi");

-- CreateIndex
CREATE INDEX "DailyCandidate_pmid_idx" ON "DailyCandidate"("pmid");

-- CreateIndex
CREATE INDEX "DailyCandidate_arxivId_idx" ON "DailyCandidate"("arxivId");

-- CreateIndex
CREATE INDEX "DailyCandidate_bioRxivId_idx" ON "DailyCandidate"("bioRxivId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyCandidate_runId_source_externalId_key" ON "DailyCandidate"("runId", "source", "externalId");


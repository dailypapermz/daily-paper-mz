-- CreateTable
CREATE TABLE "DailyCanonicalCandidate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "canonicalKey" TEXT NOT NULL,
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
    "mergedSourceCount" INTEGER NOT NULL DEFAULT 1,
    "sourceProvenanceJson" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DailyCanonicalCandidate_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DailyIngestionRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailyCanonicalCandidateProvenance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "canonicalCandidateId" TEXT NOT NULL,
    "sourceCandidateId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "mergeReason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DailyCanonicalCandidateProvenance_canonicalCandidateId_fkey" FOREIGN KEY ("canonicalCandidateId") REFERENCES "DailyCanonicalCandidate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DailyCanonicalCandidateProvenance_sourceCandidateId_fkey" FOREIGN KEY ("sourceCandidateId") REFERENCES "DailyCandidate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DailyCanonicalCandidate_runId_idx" ON "DailyCanonicalCandidate"("runId");

-- CreateIndex
CREATE INDEX "DailyCanonicalCandidate_doi_idx" ON "DailyCanonicalCandidate"("doi");

-- CreateIndex
CREATE UNIQUE INDEX "DailyCanonicalCandidate_runId_canonicalKey_key" ON "DailyCanonicalCandidate"("runId", "canonicalKey");

-- CreateIndex
CREATE UNIQUE INDEX "DailyCanonicalCandidateProvenance_sourceCandidateId_key" ON "DailyCanonicalCandidateProvenance"("sourceCandidateId");

-- CreateIndex
CREATE INDEX "DailyCanonicalCandidateProvenance_canonicalCandidateId_idx" ON "DailyCanonicalCandidateProvenance"("canonicalCandidateId");

-- CreateIndex
CREATE INDEX "DailyCanonicalCandidateProvenance_source_mergeReason_idx" ON "DailyCanonicalCandidateProvenance"("source", "mergeReason");


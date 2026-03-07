-- CreateTable
CREATE TABLE "JournalEnrichmentCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journalName" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "quartile" TEXT,
    "impactScore" REAL,
    "rawPayloadJson" JSONB,
    "normalizedJson" JSONB,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DailyCandidateJournalEnrichment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "candidateId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "quartile" TEXT,
    "impactScore" REAL,
    "rawPayloadJson" JSONB,
    "normalizedJson" JSONB,
    "errorMessage" TEXT,
    "enrichedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DailyCandidateJournalEnrichment_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "DailyCandidate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "JournalEnrichmentCache_provider_expiresAt_idx" ON "JournalEnrichmentCache"("provider", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEnrichmentCache_journalName_provider_key" ON "JournalEnrichmentCache"("journalName", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "DailyCandidateJournalEnrichment_candidateId_key" ON "DailyCandidateJournalEnrichment"("candidateId");

-- CreateIndex
CREATE INDEX "DailyCandidateJournalEnrichment_provider_status_idx" ON "DailyCandidateJournalEnrichment"("provider", "status");

-- CreateIndex
CREATE INDEX "DailyCandidateJournalEnrichment_enrichedAt_idx" ON "DailyCandidateJournalEnrichment"("enrichedAt");


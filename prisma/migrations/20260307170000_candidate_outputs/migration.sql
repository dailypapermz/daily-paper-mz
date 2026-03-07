-- CreateTable
CREATE TABLE "DailyCandidateSummary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "canonicalCandidateId" TEXT NOT NULL,
    "researchQuestion" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "mainFinding" TEXT NOT NULL,
    "relevanceToUser" TEXT NOT NULL,
    "provenance" TEXT NOT NULL DEFAULT 'GENERATED',
    "provider" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DailyCandidateSummary_canonicalCandidateId_fkey" FOREIGN KEY ("canonicalCandidateId") REFERENCES "DailyCanonicalCandidate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailyCandidateStructuredLabel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "canonicalCandidateId" TEXT NOT NULL,
    "labelType" TEXT NOT NULL,
    "contentRecallLabel" TEXT,
    "researchCategory" TEXT,
    "primaryKeyword" TEXT,
    "secondaryKeyword" TEXT,
    "rawLabelText" TEXT,
    "provenance" TEXT NOT NULL DEFAULT 'GENERATED',
    "provider" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DailyCandidateStructuredLabel_canonicalCandidateId_fkey" FOREIGN KEY ("canonicalCandidateId") REFERENCES "DailyCanonicalCandidate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyCandidateSummary_canonicalCandidateId_key" ON "DailyCandidateSummary"("canonicalCandidateId");

-- CreateIndex
CREATE INDEX "DailyCandidateSummary_provenance_idx" ON "DailyCandidateSummary"("provenance");

-- CreateIndex
CREATE INDEX "DailyCandidateStructuredLabel_canonicalCandidateId_idx" ON "DailyCandidateStructuredLabel"("canonicalCandidateId");

-- CreateIndex
CREATE INDEX "DailyCandidateStructuredLabel_provenance_labelType_idx" ON "DailyCandidateStructuredLabel"("provenance", "labelType");

-- CreateIndex
CREATE UNIQUE INDEX "DailyCandidateStructuredLabel_canonicalCandidateId_labelType_key" ON "DailyCandidateStructuredLabel"("canonicalCandidateId", "labelType");


-- CreateTable
CREATE TABLE "ZoteroTagGenerationJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "provider" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "selectedItemsCount" INTEGER NOT NULL DEFAULT 0,
    "missingItemsCount" INTEGER NOT NULL DEFAULT 0,
    "generatedItemsCount" INTEGER NOT NULL DEFAULT 0,
    "fallbackItemsCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ZoteroTagGenerationJobItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "usedFallback" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ZoteroTagGenerationJobItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ZoteroTagGenerationJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ZoteroTagGenerationJobItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ZoteroItemRaw" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ZoteroItemContentRecallTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "rawTag" TEXT NOT NULL,
    "label" TEXT,
    "provenance" TEXT NOT NULL DEFAULT 'ORIGINAL',
    "generationJobId" TEXT,
    "parseStatus" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ZoteroItemContentRecallTag_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ZoteroItemRaw" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ZoteroItemContentRecallTag_generationJobId_fkey" FOREIGN KEY ("generationJobId") REFERENCES "ZoteroTagGenerationJob" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ZoteroItemContentRecallTag" ("createdAt", "id", "itemId", "label", "parseStatus", "rawTag", "updatedAt") SELECT "createdAt", "id", "itemId", "label", "parseStatus", "rawTag", "updatedAt" FROM "ZoteroItemContentRecallTag";
DROP TABLE "ZoteroItemContentRecallTag";
ALTER TABLE "new_ZoteroItemContentRecallTag" RENAME TO "ZoteroItemContentRecallTag";
CREATE INDEX "ZoteroItemContentRecallTag_itemId_idx" ON "ZoteroItemContentRecallTag"("itemId");
CREATE INDEX "ZoteroItemContentRecallTag_provenance_idx" ON "ZoteroItemContentRecallTag"("provenance");
CREATE INDEX "ZoteroItemContentRecallTag_generationJobId_idx" ON "ZoteroItemContentRecallTag"("generationJobId");
CREATE INDEX "ZoteroItemContentRecallTag_parseStatus_idx" ON "ZoteroItemContentRecallTag"("parseStatus");
CREATE UNIQUE INDEX "ZoteroItemContentRecallTag_itemId_rawTag_key" ON "ZoteroItemContentRecallTag"("itemId", "rawTag");
CREATE TABLE "new_ZoteroItemResearchTypeTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "rawTag" TEXT NOT NULL,
    "rawCategoryToken" TEXT,
    "category" TEXT,
    "primaryKeyword" TEXT,
    "secondaryKeyword" TEXT,
    "provenance" TEXT NOT NULL DEFAULT 'ORIGINAL',
    "generationJobId" TEXT,
    "parseStatus" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ZoteroItemResearchTypeTag_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ZoteroItemRaw" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ZoteroItemResearchTypeTag_generationJobId_fkey" FOREIGN KEY ("generationJobId") REFERENCES "ZoteroTagGenerationJob" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ZoteroItemResearchTypeTag" ("category", "createdAt", "id", "itemId", "parseStatus", "primaryKeyword", "rawCategoryToken", "rawTag", "secondaryKeyword", "updatedAt") SELECT "category", "createdAt", "id", "itemId", "parseStatus", "primaryKeyword", "rawCategoryToken", "rawTag", "secondaryKeyword", "updatedAt" FROM "ZoteroItemResearchTypeTag";
DROP TABLE "ZoteroItemResearchTypeTag";
ALTER TABLE "new_ZoteroItemResearchTypeTag" RENAME TO "ZoteroItemResearchTypeTag";
CREATE INDEX "ZoteroItemResearchTypeTag_itemId_idx" ON "ZoteroItemResearchTypeTag"("itemId");
CREATE INDEX "ZoteroItemResearchTypeTag_category_idx" ON "ZoteroItemResearchTypeTag"("category");
CREATE INDEX "ZoteroItemResearchTypeTag_provenance_idx" ON "ZoteroItemResearchTypeTag"("provenance");
CREATE INDEX "ZoteroItemResearchTypeTag_generationJobId_idx" ON "ZoteroItemResearchTypeTag"("generationJobId");
CREATE INDEX "ZoteroItemResearchTypeTag_parseStatus_idx" ON "ZoteroItemResearchTypeTag"("parseStatus");
CREATE UNIQUE INDEX "ZoteroItemResearchTypeTag_itemId_rawTag_key" ON "ZoteroItemResearchTypeTag"("itemId", "rawTag");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ZoteroTagGenerationJob_status_startedAt_idx" ON "ZoteroTagGenerationJob"("status", "startedAt");

-- CreateIndex
CREATE INDEX "ZoteroTagGenerationJobItem_jobId_idx" ON "ZoteroTagGenerationJobItem"("jobId");

-- CreateIndex
CREATE INDEX "ZoteroTagGenerationJobItem_itemId_idx" ON "ZoteroTagGenerationJobItem"("itemId");

-- CreateIndex
CREATE INDEX "ZoteroTagGenerationJobItem_status_idx" ON "ZoteroTagGenerationJobItem"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ZoteroTagGenerationJobItem_jobId_itemId_key" ON "ZoteroTagGenerationJobItem"("jobId", "itemId");


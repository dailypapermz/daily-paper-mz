-- CreateTable
CREATE TABLE "ProfileSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "builtAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceLibraryVersion" INTEGER,
    "itemsCount" INTEGER NOT NULL DEFAULT 0,
    "summaryJson" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProfileSnapshotItemSignal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "snapshotId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "finalWeight" REAL NOT NULL,
    "collectionWeight" REAL NOT NULL,
    "attentionWeight" REAL NOT NULL,
    "recencyWeight" REAL NOT NULL,
    "representationSource" TEXT NOT NULL,
    "contentRecallLabel" TEXT,
    "researchCategory" TEXT,
    "representationText" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProfileSnapshotItemSignal_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "ProfileSnapshot" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProfileSnapshotItemSignal_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ZoteroItemRaw" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProfileSnapshotResearchTypePreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "snapshotId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "weight" REAL NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProfileSnapshotResearchTypePreference_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "ProfileSnapshot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ProfileSnapshot_status_builtAt_idx" ON "ProfileSnapshot"("status", "builtAt");

-- CreateIndex
CREATE INDEX "ProfileSnapshotItemSignal_snapshotId_idx" ON "ProfileSnapshotItemSignal"("snapshotId");

-- CreateIndex
CREATE INDEX "ProfileSnapshotItemSignal_itemId_idx" ON "ProfileSnapshotItemSignal"("itemId");

-- CreateIndex
CREATE INDEX "ProfileSnapshotItemSignal_segment_idx" ON "ProfileSnapshotItemSignal"("segment");

-- CreateIndex
CREATE INDEX "ProfileSnapshotResearchTypePreference_snapshotId_idx" ON "ProfileSnapshotResearchTypePreference"("snapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "ProfileSnapshotResearchTypePreference_snapshotId_category_key" ON "ProfileSnapshotResearchTypePreference"("snapshotId", "category");


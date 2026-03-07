-- CreateTable
CREATE TABLE "JournalFeedSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journalName" TEXT NOT NULL,
    "feedUrl" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "JournalFeedSource_feedUrl_key" ON "JournalFeedSource"("feedUrl");

-- CreateIndex
CREATE INDEX "JournalFeedSource_journalName_idx" ON "JournalFeedSource"("journalName");

-- CreateIndex
CREATE INDEX "JournalFeedSource_isActive_idx" ON "JournalFeedSource"("isActive");


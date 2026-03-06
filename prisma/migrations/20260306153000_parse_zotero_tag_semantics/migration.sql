-- CreateTable
CREATE TABLE "ZoteroItemTagSignal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "attentionLevel" INTEGER NOT NULL DEFAULT 0,
    "rawStarTagsJson" JSONB,
    "otherTagsJson" JSONB,
    "parsedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ZoteroItemTagSignal_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ZoteroItemRaw" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ZoteroItemContentTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "rawTag" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ZoteroItemContentTag_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ZoteroItemRaw" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ZoteroItemTagSignal_itemId_key" ON "ZoteroItemTagSignal"("itemId");

-- CreateIndex
CREATE INDEX "ZoteroItemTagSignal_attentionLevel_idx" ON "ZoteroItemTagSignal"("attentionLevel");

-- CreateIndex
CREATE INDEX "ZoteroItemContentTag_itemId_idx" ON "ZoteroItemContentTag"("itemId");

-- CreateIndex
CREATE INDEX "ZoteroItemContentTag_rawTag_idx" ON "ZoteroItemContentTag"("rawTag");

-- CreateIndex
CREATE UNIQUE INDEX "ZoteroItemContentTag_itemId_rawTag_key" ON "ZoteroItemContentTag"("itemId", "rawTag");


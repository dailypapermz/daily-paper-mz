-- CreateTable
CREATE TABLE "ZoteroItemContentRecallTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "rawTag" TEXT NOT NULL,
    "label" TEXT,
    "parseStatus" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ZoteroItemContentRecallTag_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ZoteroItemRaw" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ZoteroItemResearchTypeTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "rawTag" TEXT NOT NULL,
    "rawCategoryToken" TEXT,
    "category" TEXT,
    "primaryKeyword" TEXT,
    "secondaryKeyword" TEXT,
    "parseStatus" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ZoteroItemResearchTypeTag_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ZoteroItemRaw" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ZoteroItemContentRecallTag_itemId_idx" ON "ZoteroItemContentRecallTag"("itemId");

-- CreateIndex
CREATE INDEX "ZoteroItemContentRecallTag_parseStatus_idx" ON "ZoteroItemContentRecallTag"("parseStatus");

-- CreateIndex
CREATE UNIQUE INDEX "ZoteroItemContentRecallTag_itemId_rawTag_key" ON "ZoteroItemContentRecallTag"("itemId", "rawTag");

-- CreateIndex
CREATE INDEX "ZoteroItemResearchTypeTag_itemId_idx" ON "ZoteroItemResearchTypeTag"("itemId");

-- CreateIndex
CREATE INDEX "ZoteroItemResearchTypeTag_category_idx" ON "ZoteroItemResearchTypeTag"("category");

-- CreateIndex
CREATE INDEX "ZoteroItemResearchTypeTag_parseStatus_idx" ON "ZoteroItemResearchTypeTag"("parseStatus");

-- CreateIndex
CREATE UNIQUE INDEX "ZoteroItemResearchTypeTag_itemId_rawTag_key" ON "ZoteroItemResearchTypeTag"("itemId", "rawTag");


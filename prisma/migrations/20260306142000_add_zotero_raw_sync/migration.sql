-- CreateTable
CREATE TABLE "ZoteroSyncRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "sinceVersion" INTEGER,
    "libraryVersion" INTEGER,
    "itemsCount" INTEGER NOT NULL DEFAULT 0,
    "collectionsCount" INTEGER NOT NULL DEFAULT 0,
    "mappingsCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ZoteroItemRaw" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "zoteroItemKey" TEXT NOT NULL,
    "zoteroVersion" INTEGER,
    "title" TEXT,
    "abstractNote" TEXT,
    "dateAdded" DATETIME,
    "rawTagsJson" JSONB,
    "rawCollectionsJson" JSONB,
    "sourcePayloadJson" JSONB NOT NULL,
    "syncedAt" DATETIME NOT NULL,
    "libraryVersion" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ZoteroCollection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "zoteroCollectionKey" TEXT NOT NULL,
    "zoteroVersion" INTEGER,
    "name" TEXT NOT NULL,
    "parentCollectionKey" TEXT,
    "path" TEXT,
    "sourcePayloadJson" JSONB NOT NULL,
    "syncedAt" DATETIME NOT NULL,
    "libraryVersion" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ZoteroItemCollection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "mappedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ZoteroItemCollection_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ZoteroItemRaw" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ZoteroItemCollection_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "ZoteroCollection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ZoteroSyncRun_status_startedAt_idx" ON "ZoteroSyncRun"("status", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ZoteroItemRaw_zoteroItemKey_key" ON "ZoteroItemRaw"("zoteroItemKey");

-- CreateIndex
CREATE INDEX "ZoteroItemRaw_syncedAt_idx" ON "ZoteroItemRaw"("syncedAt");

-- CreateIndex
CREATE INDEX "ZoteroItemRaw_libraryVersion_idx" ON "ZoteroItemRaw"("libraryVersion");

-- CreateIndex
CREATE UNIQUE INDEX "ZoteroCollection_zoteroCollectionKey_key" ON "ZoteroCollection"("zoteroCollectionKey");

-- CreateIndex
CREATE INDEX "ZoteroCollection_parentCollectionKey_idx" ON "ZoteroCollection"("parentCollectionKey");

-- CreateIndex
CREATE INDEX "ZoteroCollection_syncedAt_idx" ON "ZoteroCollection"("syncedAt");

-- CreateIndex
CREATE INDEX "ZoteroItemCollection_itemId_idx" ON "ZoteroItemCollection"("itemId");

-- CreateIndex
CREATE INDEX "ZoteroItemCollection_collectionId_idx" ON "ZoteroItemCollection"("collectionId");

-- CreateIndex
CREATE UNIQUE INDEX "ZoteroItemCollection_itemId_collectionId_key" ON "ZoteroItemCollection"("itemId", "collectionId");


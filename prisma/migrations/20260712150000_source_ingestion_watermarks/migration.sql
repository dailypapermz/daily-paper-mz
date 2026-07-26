CREATE TABLE "SourceIngestionCursor" (
    "source" TEXT NOT NULL PRIMARY KEY,
    "lastSuccessfulAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "SourceSeenItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "SourceSeenItem_source_externalId_key" ON "SourceSeenItem"("source", "externalId");
CREATE INDEX "SourceSeenItem_source_firstSeenAt_idx" ON "SourceSeenItem"("source", "firstSeenAt");

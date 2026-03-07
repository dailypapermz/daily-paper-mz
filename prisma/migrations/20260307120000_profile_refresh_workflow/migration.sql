-- CreateTable
CREATE TABLE "ProfileRefreshJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "snapshotId" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProfileRefreshJob_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "ProfileSnapshot" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProfileReminderCheck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "checkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRefreshAt" DATETIME,
    "isDue" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "ProfileRefreshJob_status_startedAt_idx" ON "ProfileRefreshJob"("status", "startedAt");

-- CreateIndex
CREATE INDEX "ProfileRefreshJob_trigger_startedAt_idx" ON "ProfileRefreshJob"("trigger", "startedAt");

-- CreateIndex
CREATE INDEX "ProfileReminderCheck_checkedAt_idx" ON "ProfileReminderCheck"("checkedAt");

-- CreateIndex
CREATE INDEX "ProfileReminderCheck_isDue_checkedAt_idx" ON "ProfileReminderCheck"("isDue", "checkedAt");


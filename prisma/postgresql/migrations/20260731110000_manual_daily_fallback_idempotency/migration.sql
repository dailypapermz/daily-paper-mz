CREATE TYPE "DailyNotificationDeliveryStatus" AS ENUM ('SENDING', 'SENT', 'LEGACY_SUPPRESSED');
CREATE TYPE "DailyNotificationChannel" AS ENUM ('WECOM', 'EMAIL');

ALTER TABLE "DailyIngestionRun"
  ADD COLUMN "notificationDeliveryStatus" "DailyNotificationDeliveryStatus",
  ADD COLUMN "notificationChannel" "DailyNotificationChannel",
  ADD COLUMN "notificationSentAt" TIMESTAMP(3);

-- Notification delivery was not persisted before this migration. Conservatively
-- suppress terminal legacy runs so a retry cannot duplicate an already-delivered
-- production notification.
UPDATE "DailyIngestionRun"
SET "notificationDeliveryStatus" = 'LEGACY_SUPPRESSED'
WHERE "pipelineStatus" IN ('COMPLETE', 'COMPLETE_WITH_WARNINGS');

ALTER TABLE "DailyRerankRun" ADD COLUMN "requestKey" TEXT;

WITH "ranked" AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "runId"
      ORDER BY "startedAt" DESC, "createdAt" DESC, "id" DESC
    ) AS "position"
  FROM "DailyRerankRun"
)
UPDATE "DailyRerankRun" AS "run"
SET "requestKey" = 'daily:rerank:' || "run"."runId"
FROM "ranked"
WHERE "run"."id" = "ranked"."id" AND "ranked"."position" = 1;

CREATE UNIQUE INDEX "DailyRerankRun_requestKey_key" ON "DailyRerankRun"("requestKey");

ALTER TABLE "DailyIngestionRun" ADD COLUMN "notificationDeliveryStatus" TEXT;
ALTER TABLE "DailyIngestionRun" ADD COLUMN "notificationChannel" TEXT;
ALTER TABLE "DailyIngestionRun" ADD COLUMN "notificationSentAt" DATETIME;

-- Notification delivery was not persisted before this migration. Conservatively
-- suppress terminal legacy runs so a retry cannot duplicate an already-delivered
-- production notification.
UPDATE "DailyIngestionRun"
SET "notificationDeliveryStatus" = 'LEGACY_SUPPRESSED'
WHERE "pipelineStatus" IN ('COMPLETE', 'COMPLETE_WITH_WARNINGS');

ALTER TABLE "DailyRerankRun" ADD COLUMN "requestKey" TEXT;

UPDATE "DailyRerankRun"
SET "requestKey" = 'daily:rerank:' || "runId"
WHERE "id" IN (
  SELECT "latest"."id"
  FROM "DailyRerankRun" AS "latest"
  WHERE "latest"."id" = (
    SELECT "candidate"."id"
    FROM "DailyRerankRun" AS "candidate"
    WHERE "candidate"."runId" = "latest"."runId"
    ORDER BY "candidate"."startedAt" DESC, "candidate"."createdAt" DESC, "candidate"."id" DESC
    LIMIT 1
  )
);

CREATE UNIQUE INDEX "DailyRerankRun_requestKey_key" ON "DailyRerankRun"("requestKey");

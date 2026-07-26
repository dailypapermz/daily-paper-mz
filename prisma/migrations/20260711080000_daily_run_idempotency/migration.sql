ALTER TABLE "DailyIngestionRun" ADD COLUMN "requestKey" TEXT;
ALTER TABLE "DailyIngestionRun" ADD COLUMN "attempt" INTEGER NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX "DailyIngestionRun_requestKey_key" ON "DailyIngestionRun"("requestKey");

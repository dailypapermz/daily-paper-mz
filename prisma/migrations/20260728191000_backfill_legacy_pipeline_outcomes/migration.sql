-- Give legacy successful aggregated runs an explicit terminal pipeline outcome.
-- The result remains retryable through the existing idempotent run key when stages are incomplete.
UPDATE "DailyIngestionRun"
SET
  "pipelineStatus" = CASE
    WHEN (
      SELECT COUNT(*)
      FROM "DailyPipelineStageRun" AS "stage"
      WHERE "stage"."runId" = "DailyIngestionRun"."id"
    ) = 7
    AND NOT EXISTS (
      SELECT 1
      FROM "DailyPipelineStageRun" AS "stage"
      WHERE "stage"."runId" = "DailyIngestionRun"."id"
        AND (
          "stage"."status" NOT IN ('SUCCESS', 'PARTIAL')
          OR ("stage"."status" = 'PARTIAL' AND "stage"."stage" NOT IN ('INGESTION', 'ENRICHMENT'))
        )
    ) THEN CASE
      WHEN EXISTS (
        SELECT 1
        FROM "DailyPipelineStageRun" AS "stage"
        WHERE "stage"."runId" = "DailyIngestionRun"."id"
          AND "stage"."status" = 'PARTIAL'
      ) THEN 'COMPLETE_WITH_WARNINGS'
      ELSE 'COMPLETE'
    END
    WHEN EXISTS (
      SELECT 1
      FROM "DailyPipelineStageRun" AS "stage"
      WHERE "stage"."runId" = "DailyIngestionRun"."id"
        AND "stage"."stage" = 'RERANK'
        AND "stage"."status" = 'SUCCESS'
    ) THEN 'PARTIAL'
    ELSE 'FAILED'
  END,
  "pipelineFinishedAt" = COALESCE("pipelineFinishedAt", "finishedAt", CURRENT_TIMESTAMP)
WHERE "source" = 'AGGREGATED'
  AND "status" = 'SUCCESS'
  AND "pipelineStatus" IS NULL;

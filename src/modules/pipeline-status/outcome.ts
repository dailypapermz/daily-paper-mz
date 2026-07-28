import { STAGE_ORDER } from "./pipeline-stage.service";
import type { DailyPipelineStageRecord, DailyPipelineStageValue } from "./types";

export type DailyPipelineOutcome =
  | "complete"
  | "complete_with_warnings"
  | "partial"
  | "failed";

export type DailyPipelineDisposition =
  | "executed"
  | "resumed"
  | "already_succeeded"
  | "already_running";

export type DailyPipelineConclusion = {
  status: DailyPipelineOutcome;
  retryable: boolean;
  failedStage?: DailyPipelineStageValue;
};

const SETTLED_WARNING_STAGES = new Set<DailyPipelineStageValue>([
  "ingestion",
  "enrichment"
]);

export function concludeDailyPipeline(stages: DailyPipelineStageRecord[]): DailyPipelineConclusion {
  const failedStage = STAGE_ORDER.find((stage) => {
    const entry = stages.find((candidate) => candidate.stage === stage);
    return !entry ||
      entry.status === "failed" ||
      entry.status === "pending" ||
      entry.status === "running" ||
      entry.status === "skipped" ||
      (entry.status === "partial" && !SETTLED_WARNING_STAGES.has(stage));
  });
  const rerankSucceeded = stages.some(
    (entry) => entry.stage === "rerank" && entry.status === "success"
  );
  const retryable = failedStage !== undefined;

  if (failedStage) {
    return {
      status: rerankSucceeded ? "partial" : "failed",
      retryable: true,
      failedStage
    };
  }

  const hasWarnings = stages.some((entry) =>
    entry.status === "partial" && SETTLED_WARNING_STAGES.has(entry.stage)
  );
  return {
    status: hasWarnings ? "complete_with_warnings" : "complete",
    retryable: false
  };
}

export function findDailyResumeStage(
  stages: DailyPipelineStageRecord[]
): DailyPipelineStageValue | undefined {
  if (stages.length === 0) return "enrichment";
  return STAGE_ORDER.slice(1).find((stage) => {
    const record = stages.find((entry) => entry.stage === stage);
    if (stage === "enrichment" && record?.status === "partial") return false;
    return !record || record.status !== "success";
  });
}

export function isDailyPipelineRetryable(stages: DailyPipelineStageRecord[]): boolean {
  return concludeDailyPipeline(stages).retryable;
}

import { describe, expect, it } from "vitest";

import { concludeDailyPipeline, findDailyResumeStage } from "./outcome";
import type { DailyPipelineStageRecord } from "./types";

function stages(
  overrides: Partial<Record<DailyPipelineStageRecord["stage"], DailyPipelineStageRecord["status"]>> = {}
): DailyPipelineStageRecord[] {
  return ["ingestion", "enrichment", "normalization", "representation", "recall", "rerank", "summary"]
    .map((stage) => ({
      stage: stage as DailyPipelineStageRecord["stage"],
      status: overrides[stage as DailyPipelineStageRecord["stage"]] ?? "success"
    }));
}

describe("daily pipeline outcome policy", () => {
  it("distinguishes clean completion from settled source and enrichment warnings", () => {
    expect(concludeDailyPipeline(stages())).toEqual({ status: "complete", retryable: false });
    expect(concludeDailyPipeline(stages({ ingestion: "partial" }))).toEqual({
      status: "complete_with_warnings",
      retryable: false
    });
    expect(concludeDailyPipeline(stages({ enrichment: "partial" }))).toEqual({
      status: "complete_with_warnings",
      retryable: false
    });
  });

  it("marks usable but incomplete output partial and retryable", () => {
    expect(concludeDailyPipeline(stages({ representation: "partial" }))).toEqual({
      status: "partial",
      retryable: true
    });
    expect(concludeDailyPipeline(stages({ summary: "failed" }))).toEqual({
      status: "partial",
      retryable: true,
      failedStage: "summary"
    });
  });

  it("marks pre-rerank failure failed and resumes only actionable stages", () => {
    expect(concludeDailyPipeline(stages({ recall: "failed", rerank: "skipped", summary: "skipped" }))).toEqual({
      status: "failed",
      retryable: true,
      failedStage: "recall"
    });
    expect(findDailyResumeStage(stages({ ingestion: "partial", enrichment: "partial" }))).toBeUndefined();
    expect(findDailyResumeStage(stages({ representation: "partial" }))).toBe("representation");
  });
});

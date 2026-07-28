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
      retryable: true,
      failedStage: "representation"
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

  it("never treats missing or unsettled stages as complete", () => {
    expect(concludeDailyPipeline([])).toEqual({
      status: "failed",
      retryable: true,
      failedStage: "ingestion"
    });
    expect(concludeDailyPipeline(stages().filter((entry) => entry.stage !== "normalization"))).toEqual({
      status: "partial",
      retryable: true,
      failedStage: "normalization"
    });
    for (const status of ["pending", "running", "skipped"] as const) {
      expect(concludeDailyPipeline(stages({ representation: status }))).toEqual({
        status: "partial",
        retryable: true,
        failedStage: "representation"
      });
    }
    expect(concludeDailyPipeline(stages({ summary: "pending" }))).toEqual({
      status: "partial",
      retryable: true,
      failedStage: "summary"
    });
  });
});

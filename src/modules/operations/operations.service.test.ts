import { describe, expect, it, vi } from "vitest";

import { OperationsError, OperationsService } from "./operations.service";
import type { OperationsRepository, OperationsRunRecord } from "./types";

describe("OperationsService", () => {
  it("bounds recent reads and projects only sanitized diagnostics", async () => {
    const listRecentAggregatedRuns = vi.fn().mockResolvedValue([
      runRecord({
        errorMessage: "Bearer top-secret owner@example.test C:\\Users\\Alice\\vault\\paper.md OPERATIONS_GITHUB_TOKEN=another-secret",
        stages: [{
          stage: "ingestion",
          status: "partial",
          errorMessage: "github_pat_abcdefghijklmnop",
          details: {
            apiKey: "secret-value",
            count: 4,
            sources: [{
              source: "pubmed",
              status: "failed",
              errorMessage: "postgresql://owner:password@db.example/private"
            }]
          }
        }]
      })
    ]);
    const service = new OperationsService(repository({ listRecentAggregatedRuns }));

    const [projected] = await service.listRecentRuns(999);

    expect(listRecentAggregatedRuns).toHaveBeenCalledWith(30);
    expect(JSON.stringify(projected)).not.toMatch(/top-secret|another-secret|owner@example|Alice|secret-value|password/);
    expect(projected.stages[0]?.details).toMatchObject({ apiKey: "[redacted]", count: 4 });
    expect(projected.sourceDegradation).toEqual({
      degraded: true,
      sources: [{ source: "pubmed", status: "failed", error: "[database url]" }]
    });
  });

  it("derives the stored UTC date and enforces the default request key before retry", async () => {
    const service = new OperationsService(repository({
      getAggregatedRun: vi.fn().mockResolvedValue(runRecord())
    }));

    await expect(service.getRetryDispatch("run-1")).resolves.toEqual({ runDate: "2026-07-27" });
  });

  it.each([
    ["running", "RUN_ALREADY_RUNNING"],
    ["complete", "RUN_ALREADY_COMPLETE"],
    ["complete_with_warnings", "RUN_ALREADY_COMPLETE"],
    ["unknown", "RUN_NOT_RETRYABLE"]
  ] as const)("rejects %s runs", async (pipelineStatus, code) => {
    const service = new OperationsService(repository({
      getAggregatedRun: vi.fn().mockResolvedValue(runRecord({ pipelineStatus }))
    }));
    await expect(service.getRetryDispatch("run-1")).rejects.toMatchObject({ code });
  });

  it("rejects nonretryable partial runs and mismatched business idempotency", async () => {
    const settledPartial = new OperationsService(repository({
      getAggregatedRun: vi.fn().mockResolvedValue(runRecord({
        pipelineStatus: "partial",
        stages: [{ stage: "enrichment", status: "partial" }]
      }))
    }));
    await expect(settledPartial.getRetryDispatch("run-1")).rejects.toMatchObject({
      code: "RUN_NOT_RETRYABLE"
    });

    const mismatch = new OperationsService(repository({
      getAggregatedRun: vi.fn().mockResolvedValue(runRecord({ requestKey: "daily:v1:aggregated:pubmed:2026-07-27" }))
    }));
    await expect(mismatch.getRetryDispatch("run-1")).rejects.toMatchObject({
      code: "RUN_IDEMPOTENCY_MISMATCH"
    });
  });
});

function repository(overrides: Partial<OperationsRepository> = {}): OperationsRepository {
  return {
    listRecentAggregatedRuns: vi.fn().mockResolvedValue([]),
    getAggregatedRun: vi.fn().mockResolvedValue(null),
    ...overrides
  };
}

function runRecord(overrides: Partial<OperationsRunRecord> = {}): OperationsRunRecord {
  return {
    runDate: new Date("2026-07-27T00:00:00.000Z"),
    runId: "run-1",
    requestKey: "daily:v1:aggregated:arxiv+biorxiv+journal+pubmed:2026-07-27",
    attempt: 2,
    ingestionStatus: "success",
    pipelineStatus: "failed",
    startedAt: new Date("2026-07-28T00:00:00.000Z"),
    finishedAt: new Date("2026-07-28T00:05:00.000Z"),
    stages: [{ stage: "summary", status: "failed" }],
    ...overrides
  };
}

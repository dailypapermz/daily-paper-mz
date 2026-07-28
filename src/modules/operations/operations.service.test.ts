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

  it("allows the fixed idempotent retry path only after a running pipeline lease is stale", async () => {
    const now = new Date("2026-07-28T06:00:00.000Z");
    const stale = new OperationsService(repository({
      getAggregatedRun: vi.fn().mockResolvedValue(runRecord({
        pipelineStatus: "running",
        pipelineStartedAt: new Date("2026-07-28T02:59:59.000Z")
      }))
    }), { now: () => now });
    const active = new OperationsService(repository({
      getAggregatedRun: vi.fn().mockResolvedValue(runRecord({
        pipelineStatus: "running",
        pipelineStartedAt: new Date("2026-07-28T03:00:01.000Z")
      }))
    }), { now: () => now });

    await expect(stale.getRetryDispatch("run-1")).resolves.toEqual({ runDate: "2026-07-27" });
    await expect(active.getRetryDispatch("run-1")).rejects.toMatchObject({ code: "RUN_ALREADY_RUNNING" });
  });

  it("uses the configured lease duration and updatedAt fallback for legacy running records", async () => {
    const service = new OperationsService(repository({
      getAggregatedRun: vi.fn().mockResolvedValue(runRecord({
        pipelineStatus: "running",
        pipelineStartedAt: undefined,
        updatedAt: new Date("2026-07-28T05:58:59.000Z")
      }))
    }), {
      now: () => new Date("2026-07-28T06:00:00.000Z"),
      pipelineStaleAfterMs: 60 * 1000
    });

    await expect(service.getRetryDispatch("run-1")).resolves.toEqual({ runDate: "2026-07-27" });
  });

  it.each(["pending", "running", "skipped"] as const)(
    "allows recovery of a backfilled failed run with an unsettled %s stage",
    async (stageStatus) => {
      const service = new OperationsService(repository({
        getAggregatedRun: vi.fn().mockResolvedValue(runRecord({
          pipelineStatus: "failed",
          stages: [
            { stage: "ingestion", status: "success" },
            { stage: "enrichment", status: stageStatus }
          ]
        }))
      }));

      await expect(service.getRetryDispatch("run-1")).resolves.toEqual({ runDate: "2026-07-27" });
    }
  );

  it("allows recovery when a backfilled failed run is missing a required stage", async () => {
    const service = new OperationsService(repository({
      getAggregatedRun: vi.fn().mockResolvedValue(runRecord({
        pipelineStatus: "failed",
        stages: [{ stage: "ingestion", status: "success" }]
      }))
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
        stages: [
          { stage: "ingestion", status: "success" },
          { stage: "enrichment", status: "partial" },
          { stage: "normalization", status: "success" },
          { stage: "representation", status: "success" },
          { stage: "recall", status: "success" },
          { stage: "rerank", status: "success" },
          { stage: "summary", status: "success" }
        ]
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
    updatedAt: new Date(),
    pipelineStartedAt: new Date(),
    finishedAt: new Date("2026-07-28T00:05:00.000Z"),
    stages: [{ stage: "summary", status: "failed" }],
    ...overrides
  };
}

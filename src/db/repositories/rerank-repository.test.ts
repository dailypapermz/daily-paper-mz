import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../../generated/prisma";
import { buildDailyRerankRequestKey, PrismaRerankRepository } from "./rerank-repository";

describe("PrismaRerankRepository idempotent run acquisition", () => {
  it("upserts the same rerank row for repeated attempts of one business run", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: "rerank-1" });
    const repository = new PrismaRerankRepository({
      dailyRerankRun: { upsert }
    } as unknown as PrismaClient);
    const input = {
      runId: "daily-run-1",
      recallRunId: "recall-1",
      profileSnapshotId: "profile-1",
      requestedTopN: 20
    };

    await expect(repository.createRerankRun(input)).resolves.toEqual({ id: "rerank-1" });
    await expect(repository.createRerankRun(input)).resolves.toEqual({ id: "rerank-1" });

    expect(upsert).toHaveBeenCalledTimes(2);
    for (const [call] of upsert.mock.calls) {
      expect(call.where).toEqual({ requestKey: "daily:rerank:daily-run-1" });
      expect(call.create).toMatchObject({
        requestKey: "daily:rerank:daily-run-1",
        runId: "daily-run-1"
      });
      expect(call.update).toMatchObject({ status: "RUNNING", finishedAt: null });
    }
  });

  it("builds a deterministic request key without accepting a caller-provided rerank id", () => {
    expect(buildDailyRerankRequestKey("run-123")).toBe("daily:rerank:run-123");
  });
});

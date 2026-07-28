import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runDailyRecommendationPipeline: vi.fn()
}));

vi.mock("../../../../modules/scheduler", () => ({
  runDailyRecommendationPipeline: mocks.runDailyRecommendationPipeline
}));

import { POST } from "./route";

describe("/api/jobs/daily", () => {
  beforeEach(() => {
    mocks.runDailyRecommendationPipeline.mockReset();
  });

  it("runs daily job pipeline", async () => {
    mocks.runDailyRecommendationPipeline.mockResolvedValueOnce({
      status: "complete",
      disposition: "executed",
      retryable: false,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      sources: []
    });

    const response = await POST(
      new Request("http://localhost/api/jobs/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runDate: "2026-03-07" })
      })
    );
    const payload = (await response.json()) as { status: string };

    expect(response.status).toBe(200);
    expect(payload.status).toBe("complete");
    expect(mocks.runDailyRecommendationPipeline).toHaveBeenCalledWith({
      runDate: "2026-03-07",
      sources: undefined
    });
  });

  it.each([
    [{ status: "complete_with_warnings", disposition: "executed", retryable: false }, 200],
    [{ status: "partial", disposition: "resumed", retryable: true }, 503],
    [{ status: "failed", disposition: "executed", retryable: true }, 503],
    [{ status: "running", disposition: "already_running", retryable: false }, 409]
  ] as const)("maps semantic result %j to HTTP %i", async (result, expectedStatus) => {
    mocks.runDailyRecommendationPipeline.mockResolvedValueOnce({
      ...result,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      sources: [],
      stages: []
    });
    const response = await POST(new Request("http://localhost/api/jobs/daily", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    }));
    expect(response.status).toBe(expectedStatus);
    await expect(response.json()).resolves.toMatchObject({
      status: result.status,
      disposition: result.disposition,
      result
    });
  });
});

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
    expect(payload.status).toBe("ok");
    expect(mocks.runDailyRecommendationPipeline).toHaveBeenCalledWith({
      runDate: "2026-03-07",
      sources: undefined
    });
  });
});

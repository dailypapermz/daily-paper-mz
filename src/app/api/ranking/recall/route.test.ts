import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getLatestRecallRun: vi.fn(),
  runRecall: vi.fn()
}));

vi.mock("../../../../modules/ranking/recall", () => ({
  createRecallRankingService: () => ({
    getLatestRecallRun: mocks.getLatestRecallRun,
    runRecall: mocks.runRecall
  })
}));

import { GET, POST } from "./route";

describe("/api/ranking/recall", () => {
  beforeEach(() => {
    mocks.getLatestRecallRun.mockReset();
    mocks.runRecall.mockReset();
  });

  it("validates runId on GET", async () => {
    const response = await GET(new Request("http://localhost/api/ranking/recall"));
    expect(response.status).toBe(400);
  });

  it("returns latest recall run on GET", async () => {
    mocks.getLatestRecallRun.mockResolvedValueOnce(null);
    const response = await GET(new Request("http://localhost/api/ranking/recall?runId=run-1"));
    const payload = (await response.json()) as { status: string };

    expect(response.status).toBe(200);
    expect(payload.status).toBe("ok");
    expect(mocks.getLatestRecallRun).toHaveBeenCalledWith({ runId: "run-1" });
  });

  it("triggers recall run on POST", async () => {
    mocks.runRecall.mockResolvedValueOnce({
      run: {
        id: "recall-1",
        runId: "run-1",
        profileSnapshotId: "snap-1",
        status: "success"
      },
      results: []
    });

    const response = await POST(
      new Request("http://localhost/api/ranking/recall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: "run-1", topN: 50 })
      })
    );
    const payload = (await response.json()) as { status: string };

    expect(response.status).toBe(200);
    expect(payload.status).toBe("ok");
    expect(mocks.runRecall).toHaveBeenCalledWith({ runId: "run-1", topN: 50 });
  });
});

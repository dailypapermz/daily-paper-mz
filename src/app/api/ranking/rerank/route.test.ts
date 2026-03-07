import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getLatestRerankRun: vi.fn(),
  runRerank: vi.fn()
}));

vi.mock("../../../../modules/ranking/rerank", () => ({
  createRerankService: () => ({
    getLatestRerankRun: mocks.getLatestRerankRun,
    runRerank: mocks.runRerank
  })
}));

import { GET, POST } from "./route";

describe("/api/ranking/rerank", () => {
  beforeEach(() => {
    mocks.getLatestRerankRun.mockReset();
    mocks.runRerank.mockReset();
  });

  it("validates runId on GET", async () => {
    const response = await GET(new Request("http://localhost/api/ranking/rerank"));
    expect(response.status).toBe(400);
  });

  it("returns latest rerank run on GET", async () => {
    mocks.getLatestRerankRun.mockResolvedValueOnce(null);

    const response = await GET(new Request("http://localhost/api/ranking/rerank?runId=run-1"));
    const payload = (await response.json()) as { status: string };

    expect(response.status).toBe(200);
    expect(payload.status).toBe("ok");
    expect(mocks.getLatestRerankRun).toHaveBeenCalledWith("run-1");
  });

  it("triggers rerank on POST", async () => {
    mocks.runRerank.mockResolvedValueOnce({
      run: {
        id: "rerank-1",
        runId: "run-1",
        recallRunId: "recall-1",
        profileSnapshotId: "snap-1",
        status: "success"
      },
      results: []
    });

    const response = await POST(
      new Request("http://localhost/api/ranking/rerank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: "run-1", topN: 20 })
      })
    );
    const payload = (await response.json()) as { status: string };

    expect(response.status).toBe(200);
    expect(payload.status).toBe("ok");
    expect(mocks.runRerank).toHaveBeenCalledWith({ runId: "run-1", topN: 20 });
  });
});

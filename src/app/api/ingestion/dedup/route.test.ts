import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCanonicalCandidates: vi.fn(),
  runForIngestionRun: vi.fn()
}));

vi.mock("../../../../modules/normalize-dedupe", () => ({
  createCandidateNormalizationService: () => ({
    getCanonicalCandidates: mocks.getCanonicalCandidates,
    runForIngestionRun: mocks.runForIngestionRun
  })
}));

import { GET, POST } from "./route";

describe("/api/ingestion/dedup", () => {
  beforeEach(() => {
    mocks.getCanonicalCandidates.mockReset();
    mocks.runForIngestionRun.mockReset();
  });

  it("validates runId on GET", async () => {
    const response = await GET(new Request("http://localhost/api/ingestion/dedup"));
    expect(response.status).toBe(400);
  });

  it("returns canonical candidates on GET", async () => {
    mocks.getCanonicalCandidates.mockResolvedValueOnce([]);

    const response = await GET(new Request("http://localhost/api/ingestion/dedup?runId=run-1"));
    const payload = (await response.json()) as { status: string };

    expect(response.status).toBe(200);
    expect(payload.status).toBe("ok");
    expect(mocks.getCanonicalCandidates).toHaveBeenCalledWith("run-1");
  });

  it("triggers deduplication on POST", async () => {
    mocks.runForIngestionRun.mockResolvedValueOnce({
      runId: "run-1",
      inputCount: 2,
      canonicalCount: 1,
      mergedCount: 1,
      canonicalCandidates: []
    });

    const response = await POST(
      new Request("http://localhost/api/ingestion/dedup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: "run-1" })
      })
    );

    const payload = (await response.json()) as { status: string; result: { runId: string } };

    expect(response.status).toBe(200);
    expect(payload.status).toBe("ok");
    expect(payload.result.runId).toBe("run-1");
    expect(mocks.runForIngestionRun).toHaveBeenCalledWith("run-1");
  });
});

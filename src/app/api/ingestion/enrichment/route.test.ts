import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enrichRun: vi.fn()
}));

vi.mock("../../../../modules/candidate-enrich", () => ({
  createJournalEnrichmentService: () => ({
    enrichRun: mocks.enrichRun
  })
}));

import { POST } from "./route";

describe("/api/ingestion/enrichment", () => {
  beforeEach(() => {
    mocks.enrichRun.mockReset();
  });

  it("validates runId on POST", async () => {
    const response = await POST(
      new Request("http://localhost/api/ingestion/enrichment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      })
    );

    expect(response.status).toBe(400);
  });

  it("triggers journal enrichment on POST", async () => {
    mocks.enrichRun.mockResolvedValueOnce({
      runId: "run-1",
      provider: "easyscholar",
      processed: 4,
      enriched: 2,
      notFound: 1,
      failed: 1
    });

    const response = await POST(
      new Request("http://localhost/api/ingestion/enrichment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: "run-1" })
      })
    );

    const payload = (await response.json()) as { status: string; result: { runId: string } };

    expect(response.status).toBe(200);
    expect(payload.status).toBe("ok");
    expect(payload.result.runId).toBe("run-1");
    expect(mocks.enrichRun).toHaveBeenCalledWith("run-1");
  });
});

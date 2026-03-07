import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runMvpIntegrationFlow: vi.fn()
}));

vi.mock("../../../../modules/scheduler", () => ({
  runMvpIntegrationFlow: mocks.runMvpIntegrationFlow
}));

import { POST } from "./route";

describe("/api/jobs/mvp-flow", () => {
  beforeEach(() => {
    mocks.runMvpIntegrationFlow.mockReset();
  });

  it("runs MVP integration flow", async () => {
    mocks.runMvpIntegrationFlow.mockResolvedValueOnce({
      startedAt: "2026-03-07T00:00:00.000Z",
      finishedAt: "2026-03-07T00:01:00.000Z",
      warnings: []
    });

    const response = await POST(
      new Request("http://localhost/api/jobs/mvp-flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          syncMode: "incremental",
          runDate: "2026-03-07",
          sources: ["arxiv", "pubmed"]
        })
      })
    );
    const payload = (await response.json()) as { status: string };

    expect(response.status).toBe(200);
    expect(payload.status).toBe("ok");
    expect(mocks.runMvpIntegrationFlow).toHaveBeenCalledWith({
      syncMode: "incremental",
      runDate: "2026-03-07",
      sources: ["arxiv", "pubmed"]
    });
  });

  it("rejects invalid sources", async () => {
    const response = await POST(
      new Request("http://localhost/api/jobs/mvp-flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sources: ["arxiv", "unknown"]
        })
      })
    );
    const payload = (await response.json()) as { code: string };

    expect(response.status).toBe(400);
    expect(payload.code).toBe("INVALID_SOURCES");
  });
});

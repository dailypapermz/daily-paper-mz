import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getLatestRun: vi.fn(),
  runSourceIngestion: vi.fn()
}));

vi.mock("../../../../modules/ingestion", () => ({
  createDailyIngestionService: () => ({
    getLatestRun: mocks.getLatestRun,
    runSourceIngestion: mocks.runSourceIngestion
  })
}));

import { GET, POST } from "./route";

describe("/api/ingestion/runs", () => {
  beforeEach(() => {
    mocks.getLatestRun.mockReset();
    mocks.runSourceIngestion.mockReset();
  });

  it("returns latest ingestion run on GET", async () => {
    mocks.getLatestRun.mockResolvedValueOnce(null);

    const response = await GET(new Request("http://localhost/api/ingestion/runs?source=arxiv"));
    const payload = (await response.json()) as { status: string };

    expect(response.status).toBe(200);
    expect(payload.status).toBe("ok");
  });

  it("validates source on POST", async () => {
    const response = await POST(
      new Request("http://localhost/api/ingestion/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "unknown" })
      })
    );

    expect(response.status).toBe(400);
  });

  it("triggers source ingestion on POST", async () => {
    mocks.runSourceIngestion.mockResolvedValueOnce({
      run: {
        id: "run-1",
        source: "arxiv",
        status: "success",
        runDate: "2026-03-07T00:00:00.000Z",
        startedAt: "2026-03-07T00:00:00.000Z",
        candidatesCount: 1
      },
      candidates: []
    });

    const response = await POST(
      new Request("http://localhost/api/ingestion/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "arxiv" })
      })
    );

    const payload = (await response.json()) as { status: string; run: { id: string } };

    expect(response.status).toBe(200);
    expect(payload.status).toBe("ok");
    expect(payload.run.id).toBe("run-1");
  });
});

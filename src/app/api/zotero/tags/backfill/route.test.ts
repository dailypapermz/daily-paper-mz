import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getLatestJob: vi.fn(),
  runBackfill: vi.fn()
}));

vi.mock("../../../../../modules/tagging", () => ({
  createTagBackfillService: () => ({
    getLatestJob: mocks.getLatestJob,
    runBackfill: mocks.runBackfill
  })
}));

import { GET, POST } from "./route";

describe("/api/zotero/tags/backfill", () => {
  beforeEach(() => {
    mocks.getLatestJob.mockReset();
    mocks.runBackfill.mockReset();
  });

  it("returns latest backfill job on GET", async () => {
    mocks.getLatestJob.mockResolvedValueOnce({
      id: "job-1",
      status: "partial",
      provider: "no_provider_configured",
      startedAt: "2026-03-07T00:00:00.000Z",
      selectedItemsCount: 2,
      missingItemsCount: 2,
      generatedItemsCount: 0,
      fallbackItemsCount: 2
    });

    const response = await GET();
    const payload = (await response.json()) as {
      status: string;
      latestJob: { id: string; status: string };
    };

    expect(response.status).toBe(200);
    expect(payload.status).toBe("ok");
    expect(payload.latestJob.id).toBe("job-1");
    expect(payload.latestJob.status).toBe("partial");
  });

  it("validates payload on POST", async () => {
    const response = await POST(
      new Request("http://localhost/api/zotero/tags/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 0 })
      })
    );

    const payload = (await response.json()) as { code: string };

    expect(response.status).toBe(400);
    expect(payload.code).toBe("INVALID_PAYLOAD");
  });

  it("triggers backfill on POST", async () => {
    mocks.runBackfill.mockResolvedValueOnce({
      job: {
        id: "job-2",
        status: "success",
        provider: "fake",
        startedAt: "2026-03-07T00:00:00.000Z",
        finishedAt: "2026-03-07T00:01:00.000Z",
        selectedItemsCount: 1,
        missingItemsCount: 1,
        generatedItemsCount: 1,
        fallbackItemsCount: 0
      }
    });

    const response = await POST(
      new Request("http://localhost/api/zotero/tags/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 5 })
      })
    );

    const payload = (await response.json()) as { status: string; job: { id: string } };

    expect(response.status).toBe(200);
    expect(payload.status).toBe("ok");
    expect(payload.job.id).toBe("job-2");
    expect(mocks.runBackfill).toHaveBeenCalledWith({ limit: 5 });
  });
});

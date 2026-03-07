import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDailyFeed: vi.fn()
}));

vi.mock("../../../../modules/ranking/explain", () => ({
  createDailyRecommendationService: () => ({
    getDailyFeed: mocks.getDailyFeed
  })
}));

import { GET } from "./route";

describe("/api/recommendations/daily", () => {
  beforeEach(() => {
    mocks.getDailyFeed.mockReset();
  });

  it("returns daily feed", async () => {
    mocks.getDailyFeed.mockResolvedValueOnce(null);
    const response = await GET(new Request("http://localhost/api/recommendations/daily"));
    const payload = (await response.json()) as { status: string };

    expect(response.status).toBe(200);
    expect(payload.status).toBe("ok");
    expect(mocks.getDailyFeed).toHaveBeenCalledWith({
      runId: undefined,
      selectedOnly: true,
      source: undefined
    });
  });

  it("parses filters from query params", async () => {
    mocks.getDailyFeed.mockResolvedValueOnce(null);
    await GET(
      new Request("http://localhost/api/recommendations/daily?runId=run-1&source=arxiv&selectedOnly=false")
    );

    expect(mocks.getDailyFeed).toHaveBeenCalledWith({
      runId: "run-1",
      selectedOnly: false,
      source: "arxiv"
    });
  });
});

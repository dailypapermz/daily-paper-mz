import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listFeeds: vi.fn(),
  listActiveFeeds: vi.fn(),
  checkJournalFeedPoolHealth: vi.fn()
}));

vi.mock("../../../../../db/prisma/client", () => ({
  prisma: {}
}));

vi.mock("../../../../../db/repositories", () => ({
  PrismaJournalFeedRepository: class {
    listFeeds = mocks.listFeeds;
    listActiveFeeds = mocks.listActiveFeeds;
  }
}));

vi.mock("../../../../../modules/ingestion/journal-feed-health", () => ({
  checkJournalFeedPoolHealth: mocks.checkJournalFeedPoolHealth
}));

import { GET } from "./route";

describe("/api/journals/pool/health", () => {
  beforeEach(() => {
    mocks.listFeeds.mockReset();
    mocks.listActiveFeeds.mockReset();
    mocks.checkJournalFeedPoolHealth.mockReset();
  });

  it("checks active feeds by default", async () => {
    mocks.listActiveFeeds.mockResolvedValueOnce([
      { id: "feed-1", journalName: "Nature Methods", feedUrl: "https://example.org/feed.xml", isActive: true }
    ]);
    mocks.checkJournalFeedPoolHealth.mockResolvedValueOnce([
      { id: "feed-1", journalName: "Nature Methods", feedUrl: "https://example.org/feed.xml", isActive: true, status: "healthy", checkedAt: "2026-04-28T00:00:00.000Z", itemCount: 5 }
    ]);

    const response = await GET(new Request("http://localhost/api/journals/pool/health"));
    const payload = (await response.json()) as { status: string; reports: Array<{ id: string }> };

    expect(response.status).toBe(200);
    expect(payload.status).toBe("ok");
    expect(payload.reports).toHaveLength(1);
    expect(mocks.listActiveFeeds).toHaveBeenCalledTimes(1);
    expect(mocks.listFeeds).not.toHaveBeenCalled();
  });

  it("checks all feeds when activeOnly=false", async () => {
    mocks.listFeeds.mockResolvedValueOnce([
      { id: "feed-1", journalName: "Nature Methods", feedUrl: "https://example.org/feed.xml", isActive: false }
    ]);
    mocks.checkJournalFeedPoolHealth.mockResolvedValueOnce([]);

    const response = await GET(
      new Request("http://localhost/api/journals/pool/health?activeOnly=false")
    );

    expect(response.status).toBe(200);
    expect(mocks.listFeeds).toHaveBeenCalledTimes(1);
    expect(mocks.listActiveFeeds).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listFeeds: vi.fn(),
  upsertFeeds: vi.fn(),
  getEnv: vi.fn()
}));

vi.mock("../../../../../db/prisma/client", () => ({
  prisma: {}
}));

vi.mock("../../../../../db/repositories", () => ({
  PrismaJournalFeedRepository: class {
    listFeeds = mocks.listFeeds;
    upsertFeeds = mocks.upsertFeeds;
  }
}));

vi.mock("../../../../../lib/config", () => ({
  getEnv: mocks.getEnv
}));

import { POST } from "./route";

describe("/api/journals/pool/bootstrap", () => {
  beforeEach(() => {
    mocks.listFeeds.mockReset();
    mocks.upsertFeeds.mockReset();
    mocks.getEnv.mockReset();
  });

  it("fails when pool is not empty without explicit override", async () => {
    mocks.listFeeds.mockResolvedValueOnce([
      { id: "feed-1", journalName: "Nature", feedUrl: "https://nature.example/rss", isActive: true }
    ]);
    mocks.getEnv.mockReturnValue({
      JOURNAL_FEED_URLS: ["https://example.org/feed.xml"]
    });

    const response = await POST(
      new Request("http://localhost/api/journals/pool/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      })
    );

    expect(response.status).toBe(409);
  });

  it("fails when JOURNAL_FEED_URLS is empty", async () => {
    mocks.listFeeds.mockResolvedValueOnce([]);
    mocks.getEnv.mockReturnValue({
      JOURNAL_FEED_URLS: []
    });

    const response = await POST(
      new Request("http://localhost/api/journals/pool/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      })
    );

    expect(response.status).toBe(400);
  });

  it("bootstraps feeds from env when pool is empty", async () => {
    mocks.listFeeds.mockResolvedValueOnce([]);
    mocks.getEnv.mockReturnValue({
      JOURNAL_FEED_URLS: ["https://genome-research.example/rss.xml"]
    });
    mocks.upsertFeeds.mockResolvedValueOnce([
      {
        id: "feed-1",
        journalName: "Genome Research",
        feedUrl: "https://genome-research.example/rss.xml",
        isActive: true
      }
    ]);

    const response = await POST(
      new Request("http://localhost/api/journals/pool/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      })
    );
    const payload = (await response.json()) as { status: string; importedCount: number };

    expect(response.status).toBe(200);
    expect(payload.status).toBe("ok");
    expect(payload.importedCount).toBe(1);
    expect(mocks.upsertFeeds).toHaveBeenCalledWith([
      {
        journalName: "Genome Research",
        feedUrl: "https://genome-research.example/rss.xml",
        isActive: true
      }
    ]);
  });
});

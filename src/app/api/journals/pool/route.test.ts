import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listFeeds: vi.fn(),
  upsertFeeds: vi.fn(),
  getFeedById: vi.fn(),
  updateFeedActive: vi.fn()
}));

vi.mock("../../../../db/prisma/client", () => ({
  prisma: {}
}));

vi.mock("../../../../db/repositories", () => ({
  PrismaJournalFeedRepository: class {
    listFeeds = mocks.listFeeds;
    upsertFeeds = mocks.upsertFeeds;
    getFeedById = mocks.getFeedById;
    updateFeedActive = mocks.updateFeedActive;
  }
}));

import { GET, POST, PUT } from "./route";

describe("/api/journals/pool", () => {
  beforeEach(() => {
    mocks.listFeeds.mockReset();
    mocks.upsertFeeds.mockReset();
    mocks.getFeedById.mockReset();
    mocks.updateFeedActive.mockReset();
  });

  it("returns journal pool on GET", async () => {
    mocks.listFeeds.mockResolvedValueOnce([]);

    const response = await GET();
    const payload = (await response.json()) as { status: string };

    expect(response.status).toBe(200);
    expect(payload.status).toBe("ok");
  });

  it("validates import payload on POST", async () => {
    const response = await POST(
      new Request("http://localhost/api/journals/pool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feeds: [] })
      })
    );

    expect(response.status).toBe(400);
  });

  it("imports journal feeds on POST", async () => {
    mocks.upsertFeeds.mockResolvedValueOnce([
      {
        id: "feed-1",
        journalName: "Journal A",
        feedUrl: "https://example.org/feed.xml",
        isActive: true
      }
    ]);

    const response = await POST(
      new Request("http://localhost/api/journals/pool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feeds: [{ journalName: "Journal A", feedUrl: "https://example.org/feed.xml" }]
        })
      })
    );

    const payload = (await response.json()) as { status: string; feeds: Array<{ id: string }> };

    expect(response.status).toBe(200);
    expect(payload.status).toBe("ok");
    expect(payload.feeds[0].id).toBe("feed-1");
  });

  it("validates activation payload on PUT", async () => {
    const response = await PUT(
      new Request("http://localhost/api/journals/pool", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "", isActive: true })
      })
    );

    expect(response.status).toBe(400);
  });

  it("updates active status on PUT", async () => {
    mocks.getFeedById.mockResolvedValueOnce({
      id: "feed-1",
      journalName: "Journal A",
      feedUrl: "https://example.org/feed.xml",
      isActive: true
    });
    mocks.updateFeedActive.mockResolvedValueOnce({
      id: "feed-1",
      journalName: "Journal A",
      feedUrl: "https://example.org/feed.xml",
      isActive: false
    });

    const response = await PUT(
      new Request("http://localhost/api/journals/pool", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "feed-1", isActive: false })
      })
    );
    const payload = (await response.json()) as { status: string; feed: { isActive: boolean } };

    expect(response.status).toBe(200);
    expect(payload.status).toBe("ok");
    expect(payload.feed.isActive).toBe(false);
  });
});

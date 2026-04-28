import { afterEach, describe, expect, it, vi } from "vitest";

import { checkJournalFeedHealth, checkJournalFeedPoolHealth } from "./journal-feed-health";

describe("journal feed health", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("marks a valid RSS response as healthy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: "https://example.org/feed.xml",
        headers: new Headers({
          "content-type": "application/rss+xml"
        }),
        text: async () =>
          `<rss><channel><item><guid>x1</guid><title>T</title><pubDate>Sat, 07 Mar 2026 10:00:00 GMT</pubDate></item></channel></rss>`
      } satisfies Partial<Response>)
    );

    const report = await checkJournalFeedHealth({
      id: "feed-1",
      journalName: "Example Journal",
      feedUrl: "https://example.org/feed.xml",
      isActive: true
    });

    expect(report.status).toBe("healthy");
    expect(report.itemCount).toBe(1);
    expect(report.httpStatus).toBe(200);
  });

  it("marks HTML responses as invalid feeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: "https://example.org/feed.xml",
        headers: new Headers({
          "content-type": "text/html"
        }),
        text: async () => "<html><body>Not a feed</body></html>"
      } satisfies Partial<Response>)
    );

    const report = await checkJournalFeedHealth({
      id: "feed-1",
      journalName: "Example Journal",
      feedUrl: "https://example.org/feed.xml",
      isActive: true
    });

    expect(report.status).toBe("invalid_feed");
    expect(report.errorMessage).toContain("RSS or Atom");
  });

  it("checks multiple feeds in batches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: "https://example.org/feed.xml",
        headers: new Headers({
          "content-type": "application/atom+xml"
        }),
        text: async () => "<feed><entry><id>a</id><title>A</title></entry></feed>"
      } satisfies Partial<Response>)
    );

    const reports = await checkJournalFeedPoolHealth(
      [
        { id: "1", journalName: "A", feedUrl: "https://example.org/a.xml", isActive: true },
        { id: "2", journalName: "B", feedUrl: "https://example.org/b.xml", isActive: true }
      ],
      1
    );

    expect(reports).toHaveLength(2);
    expect(reports.every((report) => report.status === "healthy")).toBe(true);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

import { JournalFeedSourceAdapter, parseFeedXml } from "./journal-feed-adapter";

describe("JournalFeedSourceAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses RSS feed entries into unified candidates", () => {
    const xml = `
      <rss>
        <channel>
          <item>
            <guid>item-1</guid>
            <title>Journal paper</title>
            <description>Summary text</description>
            <link>https://example.org/paper-1</link>
            <pubDate>Sat, 07 Mar 2026 10:00:00 GMT</pubDate>
          </item>
        </channel>
      </rss>`;

    const candidates = parseFeedXml(xml, {
      id: "feed-1",
      journalName: "Test Journal",
      feedUrl: "https://example.org/feed.xml",
      isActive: true
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0].externalId).toBe("item-1");
    expect(candidates[0].journalName).toBe("Test Journal");
    expect(candidates[0].url).toBe("https://example.org/paper-1");
  });

  it("fetches active feeds from repository and aggregates candidates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          `<rss><channel><item><guid>x1</guid><title>T</title><pubDate>Sat, 07 Mar 2026 10:00:00 GMT</pubDate></item></channel></rss>`
      } as Response) as unknown as typeof fetch
    );

    const adapter = new JournalFeedSourceAdapter({
      async listActiveFeeds() {
        return [
          {
            id: "feed-1",
            journalName: "Journal A",
            feedUrl: "https://example.org/a.xml",
            isActive: true
          }
        ];
      }
    });

    const candidates = await adapter.fetchCandidatesForDay({
      runDate: new Date(),
      dayStart: new Date(),
      dayEnd: new Date()
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0].sourcePayload.feedUrl).toBe("https://example.org/a.xml");
  });
});

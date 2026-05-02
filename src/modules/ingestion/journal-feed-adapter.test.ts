import { afterEach, describe, expect, it, vi } from "vitest";

import {
  JournalFeedSourceAdapter,
  parseFeedXml,
  parseJournalFeedContent
} from "./journal-feed-adapter";

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

  it("continues ingestion when one feed request fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => ""
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => ""
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => ""
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `<rss><channel><item><guid>x1</guid><title>T</title><pubDate>Sat, 07 Mar 2026 10:00:00 GMT</pubDate></item></channel></rss>`
      } as Response);

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const adapter = new JournalFeedSourceAdapter({
      async listActiveFeeds() {
        return [
          {
            id: "feed-1",
            journalName: "Broken Feed",
            feedUrl: "https://example.org/broken.xml",
            isActive: true
          },
          {
            id: "feed-2",
            journalName: "Working Feed",
            feedUrl: "https://example.org/working.xml",
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

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].sourcePayload.feedUrl).toBe("https://example.org/working.xml");
  });

  it("parses Genome Research article pages into unified candidates", () => {
    const html = `
      <html>
        <body>
          <article class="article-section">
            <h5 class="title">
              <a href="/content/early/2026/04/16/gr.280372.124">Epigenetic characterization of pseudogenes across human tissues</a>
            </h5>
            <div class="article__authorname">
              <ul>
                <li>Jane Doe</li>
                <li>John Roe</li>
              </ul>
            </div>
            <span class="card-citation-value">April 15, 2026</span>
          </article>
        </body>
      </html>`;

    const candidates = parseJournalFeedContent(html, {
      id: "feed-1",
      journalName: "Genome Research",
      feedUrl: "https://genome.cshlp.org/content/early/recent",
      isActive: true
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0].externalId).toBe("/content/early/2026/04/16/gr.280372.124");
    expect(candidates[0].title).toBe(
      "Epigenetic characterization of pseudogenes across human tissues"
    );
    expect(candidates[0].url).toBe("https://genome.cshlp.org/content/early/2026/04/16/gr.280372.124");
    expect(candidates[0].journalName).toBe("Genome Research");
    expect(candidates[0].authors).toEqual(["Jane Doe", "John Roe"]);
    expect(candidates[0].publishedAt?.toISOString()).toBe("2026-04-15T00:00:00.000Z");
    expect(candidates[0].sourcePayload.parser).toBe("genome_research_page");
  });
});

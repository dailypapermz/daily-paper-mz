import { afterEach, describe, expect, it, vi } from "vitest";

import { PubmedSourceAdapter } from "./pubmed-adapter";

describe("PubmedSourceAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches summaries and abstracts for matched PMIDs", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          esearchresult: {
            idlist: ["40000001"],
            count: "1"
          }
        })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            uids: ["40000001"],
            "40000001": {
              uid: "40000001",
              title: "PubMed candidate",
              sortpubdate: "2026/03/08 00:00",
              pubdate: "2026 Mar 8",
              history: [
                {
                  pubstatus: "entrez",
                  date: "2026/03/07 15:32"
                },
                {
                  pubstatus: "pubmed",
                  date: "2026/03/07 18:40"
                },
                {
                  pubstatus: "medline",
                  date: "2026/03/07 18:55"
                }
              ],
              articleids: [
                {
                  idtype: "doi",
                  value: "10.1000/pubmed"
                }
              ],
              authors: [{ name: "Alice" }, { name: "Bob" }]
            }
          }
        })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `<?xml version="1.0"?><PubmedArticleSet><PubmedArticle><MedlineCitation><PMID>40000001</PMID><Article><Abstract><AbstractText>Detailed abstract for candidate.</AbstractText></Abstract></Article></MedlineCitation></PubmedArticle></PubmedArticleSet>`
      } as Response);

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const adapter = new PubmedSourceAdapter({ queryScope: "(genomics)" });
    const records = await adapter.fetchCandidatesForDay({
      runDate: new Date("2026-03-07T00:00:00Z"),
      dayStart: new Date("2026-03-07T00:00:00Z"),
      dayEnd: new Date("2026-03-07T23:59:59.999Z")
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("esearch.fcgi");
    expect(fetchMock.mock.calls[1]?.[0]).toContain("esummary.fcgi");
    expect(fetchMock.mock.calls[2]?.[0]).toContain("efetch.fcgi");
    expect(records).toHaveLength(1);
    expect(records[0].pmid).toBe("40000001");
    expect(records[0].doi).toBe("10.1000/pubmed");
    expect(records[0].abstractNote).toBe("Detailed abstract for candidate.");
    expect(records[0].publishedAt?.toISOString()).toBe("2026-03-08T00:00:00.000Z");
    expect(records[0].indexedAt?.toISOString()).toBe("2026-03-07T15:32:00.000Z");
    expect(records[0].sourcePayload.historyDates).toEqual({
      entrez: "2026/03/07 15:32",
      pubmed: "2026/03/07 18:40",
      medline: "2026/03/07 18:55"
    });
  });

  it("supports paginated esearch and batched follow-up requests", async () => {
    const firstPageIds = Array.from({ length: 200 }, (_, index) => `${50000000 + index}`);
    const secondPageIds = ["50000200"];

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          esearchresult: {
            idlist: firstPageIds,
            count: "201"
          }
        })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          esearchresult: {
            idlist: secondPageIds,
            count: "201"
          }
        })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            uids: [firstPageIds[0]],
            [firstPageIds[0]]: {
              uid: firstPageIds[0],
              title: "Batch 1"
            }
          }
        })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            uids: [secondPageIds[0]],
            [secondPageIds[0]]: {
              uid: secondPageIds[0],
              title: "Batch 2"
            }
          }
        })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => "<PubmedArticleSet></PubmedArticleSet>"
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => "<PubmedArticleSet></PubmedArticleSet>"
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => "<PubmedArticleSet></PubmedArticleSet>"
      } as Response);

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const adapter = new PubmedSourceAdapter();
    const records = await adapter.fetchCandidatesForDay({
      runDate: new Date("2026-03-07T00:00:00Z"),
      dayStart: new Date("2026-03-07T00:00:00Z"),
      dayEnd: new Date("2026-03-07T23:59:59.999Z")
    });

    expect(records).toHaveLength(201);
    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("retstart=200"))).toBe(true);
  });
});

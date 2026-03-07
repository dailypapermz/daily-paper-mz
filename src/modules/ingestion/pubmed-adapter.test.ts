import { afterEach, describe, expect, it, vi } from "vitest";

import { PubmedSourceAdapter } from "./pubmed-adapter";

describe("PubmedSourceAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches ids from esearch and maps summaries with PMID/DOI", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          esearchresult: {
            idlist: ["40000001"]
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
              sortpubdate: "2026-03-07",
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
      } as Response);

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const adapter = new PubmedSourceAdapter({ queryScope: "(genomics)" });
    const records = await adapter.fetchCandidatesForDay({
      runDate: new Date("2026-03-07T00:00:00Z"),
      dayStart: new Date("2026-03-07T00:00:00Z"),
      dayEnd: new Date("2026-03-07T23:59:59.999Z")
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("esearch.fcgi");
    expect(fetchMock.mock.calls[1]?.[0]).toContain("esummary.fcgi");
    expect(records).toHaveLength(1);
    expect(records[0].pmid).toBe("40000001");
    expect(records[0].doi).toBe("10.1000/pubmed");
    expect(records[0].url).toContain("pubmed.ncbi.nlm.nih.gov/40000001");
  });

  it("returns empty when esearch yields no ids", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        esearchresult: {
          idlist: []
        }
      })
    } as Response);

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const adapter = new PubmedSourceAdapter();
    const records = await adapter.fetchCandidatesForDay({
      runDate: new Date("2026-03-07T00:00:00Z"),
      dayStart: new Date("2026-03-07T00:00:00Z"),
      dayEnd: new Date("2026-03-07T23:59:59.999Z")
    });

    expect(records).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

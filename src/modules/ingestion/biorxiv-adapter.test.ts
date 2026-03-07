import { afterEach, describe, expect, it, vi } from "vitest";

import { BioRxivSourceAdapter } from "./biorxiv-adapter";

describe("BioRxivSourceAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches and maps bioRxiv records for the target day", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        collection: [
          {
            doi: "10.1101/2026.03.07.123456",
            title: "A bioRxiv paper",
            abstract: "Abstract",
            date: "2026-03-07",
            category: "bioinformatics",
            authors: "Alice; Bob",
            version: "1"
          }
        ]
      })
    } as Response);

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const adapter = new BioRxivSourceAdapter();
    const records = await adapter.fetchCandidatesForDay({
      runDate: new Date("2026-03-07T12:00:00.000Z"),
      dayStart: new Date("2026-03-07T00:00:00.000Z"),
      dayEnd: new Date("2026-03-07T23:59:59.999Z")
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.biorxiv.org/details/biorxiv/2026-03-07/2026-03-07/0",
      expect.any(Object)
    );
    expect(records).toHaveLength(1);
    expect(records[0].sourcePayload.doi).toBe("10.1101/2026.03.07.123456");
    expect(records[0].url).toContain("biorxiv.org/content/");
    expect(records[0].authors).toEqual(["Alice", "Bob"]);
  });

  it("filters records by configured subject scopes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        collection: [
          {
            doi: "10.1101/a",
            date: "2026-03-07",
            category: "genomics"
          },
          {
            doi: "10.1101/b",
            date: "2026-03-07",
            category: "microbiology"
          }
        ]
      })
    } as Response);

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const adapter = new BioRxivSourceAdapter({
      subjectScopes: ["genomics"]
    });

    const records = await adapter.fetchCandidatesForDay({
      runDate: new Date("2026-03-07T12:00:00.000Z"),
      dayStart: new Date("2026-03-07T00:00:00.000Z"),
      dayEnd: new Date("2026-03-07T23:59:59.999Z")
    });

    expect(records).toHaveLength(1);
    expect(records[0].doi).toBe("10.1101/a");
  });
});

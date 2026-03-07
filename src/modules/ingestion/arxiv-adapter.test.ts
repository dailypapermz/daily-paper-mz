import { afterEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../lib/errors";
import { ArxivSourceAdapter } from "./arxiv-adapter";

describe("ArxivSourceAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches scoped arXiv feed and maps entries", async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">
        <entry>
          <id>http://arxiv.org/abs/2603.12345v1</id>
          <updated>2026-03-07T01:00:00Z</updated>
          <published>2026-03-07T00:30:00Z</published>
          <title>  Scoped arXiv paper  </title>
          <summary>  abstract text  </summary>
          <author><name>Alice</name></author>
          <author><name>Bob</name></author>
          <arxiv:primary_category term="q-bio.GN" />
          <arxiv:doi>10.1000/test</arxiv:doi>
        </entry>
      </feed>`;

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => xml
    } as Response);
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const adapter = new ArxivSourceAdapter({
      categoryScopes: ["q-bio.GN"]
    });

    const records = await adapter.fetchCandidatesForDay({
      runDate: new Date("2026-03-07T00:00:00Z"),
      dayStart: new Date("2026-03-07T00:00:00Z"),
      dayEnd: new Date("2026-03-07T23:59:59.999Z")
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("search_query=cat:q-bio.GN"),
      expect.any(Object)
    );
    expect(records).toHaveLength(1);
    expect(records[0].arxivId).toBe("2603.12345v1");
    expect(records[0].doi).toBe("10.1000/test");
    expect(records[0].authors).toEqual(["Alice", "Bob"]);
  });

  it("fails when category scopes are missing", async () => {
    const adapter = new ArxivSourceAdapter({ categoryScopes: [] });

    await expect(
      adapter.fetchCandidatesForDay({
        runDate: new Date(),
        dayStart: new Date(),
        dayEnd: new Date()
      })
    ).rejects.toBeInstanceOf(AppError);
  });
});

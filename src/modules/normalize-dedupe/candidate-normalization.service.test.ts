import { describe, expect, it, vi } from "vitest";

import {
  buildCandidateGroups,
  DefaultCandidateNormalizationService,
  normalizeDoi,
  normalizeTitle,
  normalizeUrl
} from "./candidate-normalization.service";
import type { CanonicalDailyCandidateCreateInput, RawDailyCandidateRecord } from "./types";

describe("normalize helpers", () => {
  it("normalizes DOI/title/url values", () => {
    expect(normalizeDoi("https://doi.org/10.1000/XYZ")).toBe("10.1000/xyz");
    expect(normalizeTitle("A Study: On RNA-Seq!")).toBe("a study on rna seq");
    expect(normalizeUrl("https://Example.org/Paper/123?x=1#frag")).toBe("example.org/paper/123");
  });
});

describe("buildCandidateGroups", () => {
  it("merges candidates by DOI and preserves all entries", () => {
    const groups = buildCandidateGroups([
      makeCandidate({
        id: "c1",
        source: "arxiv",
        externalId: "a1",
        doi: "10.1000/demo"
      }),
      makeCandidate({
        id: "c2",
        source: "pubmed",
        externalId: "p1",
        doi: "https://doi.org/10.1000/DEMO"
      })
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].entries).toHaveLength(2);
    expect(groups[0].entries.map((entry) => entry.mergeReason)).toContain("doi");
  });

  it("uses title+url heuristic when DOI is missing", () => {
    const groups = buildCandidateGroups([
      makeCandidate({
        id: "c1",
        source: "biorxiv",
        externalId: "b1",
        title: "Graph neural network for scRNA",
        url: "https://example.org/papers/1"
      }),
      makeCandidate({
        id: "c2",
        source: "journal",
        externalId: "j1",
        title: "Graph neural network for scRNA",
        url: "https://example.org/papers/1?utm=abc"
      })
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].entries).toHaveLength(2);
  });
});

describe("DefaultCandidateNormalizationService", () => {
  it("persists canonical candidates and provenance after dedup", async () => {
    let stored: CanonicalDailyCandidateCreateInput[] = [];
    const repository = {
      listRunCandidates: vi.fn().mockResolvedValue([
        makeCandidate({
          id: "c1",
          source: "arxiv",
          externalId: "a1",
          title: "Benchmarking single-cell alignment",
          abstractNote: "A short abstract",
          doi: "10.1000/demo-1",
          authors: ["Alice"]
        }),
        makeCandidate({
          id: "c2",
          source: "pubmed",
          externalId: "p1",
          title: "Benchmarking single-cell alignment",
          abstractNote: "A much longer abstract for canonical merge",
          doi: "https://doi.org/10.1000/DEMO-1",
          pmid: "123456",
          authors: ["Alice", "Bob"]
        }),
        makeCandidate({
          id: "c3",
          source: "biorxiv",
          externalId: "b1",
          title: "Distinct paper title"
        })
      ]),
      replaceCanonicalCandidates: vi.fn().mockImplementation(async (input: { canonicalCandidates: CanonicalDailyCandidateCreateInput[] }) => {
        stored = input.canonicalCandidates;
      }),
      listCanonicalCandidates: vi.fn().mockImplementation(async () =>
        stored.map((candidate, index) => ({
          id: `canon-${index + 1}`,
          ...candidate
        }))
      )
    };

    const service = new DefaultCandidateNormalizationService(repository);
    const result = await service.runForIngestionRun("run-1");

    expect(result.inputCount).toBe(3);
    expect(result.canonicalCount).toBe(2);
    expect(result.mergedCount).toBe(1);
    expect(result.canonicalCandidates[0].sourceProvenance.length).toBeGreaterThanOrEqual(1);
    expect(
      result.canonicalCandidates.some(
        (candidate) =>
          candidate.sourceProvenance.length === 2 &&
          candidate.sourceProvenance.some((provenance) => provenance.source === "arxiv") &&
          candidate.sourceProvenance.some((provenance) => provenance.source === "pubmed")
      )
    ).toBe(true);
  });
});

function makeCandidate(input: Partial<RawDailyCandidateRecord> & Pick<RawDailyCandidateRecord, "id" | "source" | "externalId">): RawDailyCandidateRecord {
  return {
    id: input.id,
    runId: input.runId ?? "run-1",
    source: input.source,
    externalId: input.externalId,
    title: input.title,
    abstractNote: input.abstractNote,
    publishedAt: input.publishedAt,
    indexedAt: input.indexedAt,
    url: input.url,
    doi: input.doi,
    pmid: input.pmid,
    arxivId: input.arxivId,
    bioRxivId: input.bioRxivId,
    journalName: input.journalName,
    authors: input.authors ?? [],
    sourcePayload: input.sourcePayload ?? {}
  };
}

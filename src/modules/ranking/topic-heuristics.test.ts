import { describe, expect, it } from "vitest";

import {
  buildPreferredTopicReference,
  computeTopicHeuristicScore
} from "./topic-heuristics";

describe("computeTopicHeuristicScore", () => {
  it("requires dynamic profile evidence before strongly boosting single-cell", () => {
    const candidate = "Single-cell genomics maps cell states with scRNA-seq";
    const unsupported = computeTopicHeuristicScore(
      candidate,
      buildPreferredTopicReference(["cross-species evolutionary conservation"], [])
    );
    const supported = computeTopicHeuristicScore(
      candidate,
      buildPreferredTopicReference(["single-cell transcriptomics and cell atlas methods"], [])
    );

    expect(unsupported.positiveMatches).toContain("single-cell");
    expect(unsupported.strongPositiveMatches).not.toContain("single-cell");
    expect(unsupported.score).toBeLessThan(0.18);
    expect(supported.strongPositiveMatches).toContain("single-cell");
    expect(supported.score).toBeGreaterThan(unsupported.score + 0.2);
  });

  it("penalizes unsupported oncology context without excluding the candidate", () => {
    const score = computeTopicHeuristicScore(
      "Single-cell transcriptomics of malignant tumor evolution in cancer patients",
      buildPreferredTopicReference(["comparative genomics and regulatory genomics"], [])
    );

    expect(score.oncologyContextMatches).toEqual(
      expect.arrayContaining(["cancer", "tumor", "malignant"])
    );
    expect(score.profileSupportedMatches).toHaveLength(0);
    expect(score.penalty).toBeGreaterThanOrEqual(0.1);
    expect(score.penalty).toBeLessThan(1);
  });

  it("attenuates oncology context when the paper matches an explicit user topic", () => {
    const profile = buildPreferredTopicReference(
      ["cross-species regulatory genomics and chromatin conservation"],
      ["comparative genomics"]
    );
    const related = computeTopicHeuristicScore(
      "Cross-species regulatory genomics of chromatin conservation in cancer",
      profile
    );
    const unrelated = computeTopicHeuristicScore(
      "Single-cell tumor atlas for cancer patient stratification",
      profile
    );

    expect(related.profileSupportedMatches.length).toBeGreaterThan(0);
    expect(related.penalty).toBeGreaterThan(0);
    expect(related.penalty).toBeLessThan(unrelated.penalty);
    expect(related.score - related.penalty).toBeGreaterThan(unrelated.score - unrelated.penalty);
  });

  it("preserves comparative-genomics strength when the profile supports it", () => {
    const score = computeTopicHeuristicScore(
      "Cross-species comparative genomics reveals evolutionary conservation",
      buildPreferredTopicReference(["comparative genomics and cross-species regulation"], [])
    );

    expect(score.strongPositiveMatches).toEqual(
      expect.arrayContaining(["cross-species", "comparative genomics"])
    );
    expect(score.score).toBeGreaterThanOrEqual(0.3);
    expect(score.penalty).toBe(0);
  });

  it("keeps oncology unpenalized when the profile explicitly supports oncology", () => {
    const score = computeTopicHeuristicScore(
      "Regulatory genomics of tumor evolution in cancer",
      buildPreferredTopicReference(["cancer regulatory genomics"], [])
    );

    expect(score.oncologyContextMatches.length).toBeGreaterThan(0);
    expect(score.penalty).toBe(0);
  });
});

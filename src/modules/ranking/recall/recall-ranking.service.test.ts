import { describe, expect, it, vi } from "vitest";

import { AppError } from "../../../lib/errors";
import {
  computeRecallFeatures,
  DefaultRecallRankingService
} from "./recall-ranking.service";
import { tokenOverlapScore } from "../text-scoring";
import type { ActiveProfileSnapshotRecord } from "./types";

describe("tokenOverlapScore", () => {
  it("returns a higher score for overlapping text", () => {
    const high = tokenOverlapScore("single cell transcriptomics graph model", "graph model single cell");
    const low = tokenOverlapScore("quantum chemistry", "single cell transcriptomics");

    expect(high).toBeGreaterThan(low);
  });
});

describe("computeRecallFeatures", () => {
  it("combines explainable recall features", () => {
    const snapshot: ActiveProfileSnapshotRecord = {
      id: "snap-1",
      builtAt: new Date().toISOString(),
      representationTexts: ["single cell graph neural network inference"],
      contentRecallLabels: ["graph model for cell-state mapping"],
      researchTypePreferences: [{ category: "method", weight: 0.8 }]
    };

    const feature = computeRecallFeatures(
      {
        candidateId: "candidate-1",
        runId: "run-1",
        title: "Graph neural network for single-cell mapping",
        abstractNote: "Method for cell-state inference",
        contentRecallLabel: "graph model for single-cell mapping",
        researchCategory: "method",
        sources: ["journal"]
      },
      snapshot
    );

    expect(feature.semanticScore).toBeGreaterThan(0);
    expect(feature.recallScore).toBeGreaterThan(0);
    expect(feature.reasons.length).toBeGreaterThan(0);
  });

  it("boosts domain-aligned candidates over generic clinical AI titles", () => {
    const snapshot: ActiveProfileSnapshotRecord = {
      id: "snap-1",
      builtAt: new Date().toISOString(),
      representationTexts: ["single cell cross species transcriptomics genomics"],
      contentRecallLabels: ["single-cell atlas comparative genomics"],
      researchTypePreferences: [{ category: "method", weight: 0.8 }]
    };

    const domainFeature = computeRecallFeatures(
      {
        candidateId: "candidate-domain",
        runId: "run-1",
        title: "Single-cell transcriptomics atlas for cross-species genomics",
        abstractNote: "Comparative genomics and cell atlas analysis",
        sources: ["pubmed"]
      },
      snapshot
    );

    const noisyFeature = computeRecallFeatures(
      {
        candidateId: "candidate-noise",
        runId: "run-1",
        title: "Interpretable AI diagnostic framework for MRI-based surgical planning",
        abstractNote: "Clinical imaging workflow for diagnosis",
        sources: ["pubmed"]
      },
      snapshot
    );

    expect(domainFeature.recallScore).toBeGreaterThan(noisyFeature.recallScore);
    expect(domainFeature.reasons).toContain("domain_topic_alignment");
  });
});

describe("DefaultRecallRankingService", () => {
  it("runs recall and persists ranked results", async () => {
    const createRecallRun = vi.fn().mockResolvedValue({ id: "recall-1" });
    const saveRecallResults = vi.fn();
    const markRecallRunSucceeded = vi.fn().mockResolvedValue({
      id: "recall-1",
      runId: "run-1",
      profileSnapshotId: "snap-1",
      status: "success",
      startedAt: new Date().toISOString(),
      requestedTopN: 1,
      candidateCount: 2,
      recalledCount: 1
    });
    const getLatestRecallRun = vi.fn().mockResolvedValue(null);

    const service = new DefaultRecallRankingService({
      getActiveProfileSnapshot: vi.fn().mockResolvedValue({
        id: "snap-1",
        builtAt: new Date().toISOString(),
        representationTexts: ["single cell model"],
        contentRecallLabels: ["single cell recall"],
        researchTypePreferences: [{ category: "method", weight: 1 }]
      }),
      listRunCandidates: vi.fn().mockResolvedValue([
        {
          candidateId: "candidate-1",
          runId: "run-1",
          title: "single cell model",
          sources: ["journal"]
        },
        {
          candidateId: "candidate-2",
          runId: "run-1",
          title: "unrelated title",
          sources: ["arxiv"]
        }
      ]),
      createRecallRun,
      saveRecallResults,
      markRecallRunSucceeded,
      markRecallRunFailed: vi.fn(),
      getLatestRecallRun
    });

    const result = await service.runRecall({
      runId: "run-1",
      topN: 1
    });

    expect(createRecallRun).toHaveBeenCalledTimes(1);
    expect(saveRecallResults).toHaveBeenCalledTimes(1);
    expect(result.results[0].selected).toBe(true);
    expect(result.results[1].selected).toBe(false);
  });

  it("fails when active profile is missing", async () => {
    const service = new DefaultRecallRankingService({
      getActiveProfileSnapshot: vi.fn().mockResolvedValue(null),
      listRunCandidates: vi.fn(),
      createRecallRun: vi.fn(),
      saveRecallResults: vi.fn(),
      markRecallRunSucceeded: vi.fn(),
      markRecallRunFailed: vi.fn(),
      getLatestRecallRun: vi.fn()
    });

    await expect(service.runRecall({ runId: "run-1" })).rejects.toBeInstanceOf(AppError);
  });
});

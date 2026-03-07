import { describe, expect, it, vi } from "vitest";

import { AppError } from "../../../lib/errors";
import { computeRerankScores, DefaultRerankService } from "./rerank.service";

describe("computeRerankScores", () => {
  it("produces explainable feature breakdown and final score", () => {
    const score = computeRerankScores({
      candidate: {
        candidateId: "candidate-1",
        runId: "run-1",
        title: "single-cell graph neural network inference",
        abstractNote: "method paper",
        contentRecallLabel: "graph model for single-cell mapping",
        researchCategory: "method",
        sources: ["journal"],
        journalQuartile: "Q1",
        hasUserCorrectedOutput: true
      },
      recalled: {
        candidateId: "candidate-1",
        recallScore: 0.6,
        recallRank: 1,
        selected: true
      },
      profile: {
        id: "snap-1",
        builtAt: new Date().toISOString(),
        recentCoreTexts: ["single-cell graph model"],
        stableLongTermTexts: ["transcriptomics model"],
        highAttentionTexts: ["single-cell mapping"],
        contentRecallLabels: ["graph model for cell-state mapping"],
        researchTypePreferences: [{ category: "method", weight: 1 }],
        averageCollectionWeight: 0.8
      }
    });

    expect(score.finalScore).toBeGreaterThan(0);
    expect(score.reasons.length).toBeGreaterThan(0);
    expect(score.featureWeights.recallScore).toBeGreaterThan(0);
  });
});

describe("DefaultRerankService", () => {
  it("reranks recalled candidates and persists results", async () => {
    const repository = {
      getLatestSuccessfulRecallRun: vi.fn().mockResolvedValue({
        recallRunId: "recall-1",
        profileSnapshotId: "snap-1",
        results: [
          { candidateId: "candidate-1", recallScore: 0.6, recallRank: 1, selected: true },
          { candidateId: "candidate-2", recallScore: 0.4, recallRank: 2, selected: true }
        ]
      }),
      getProfileSnapshot: vi.fn().mockResolvedValue({
        id: "snap-1",
        builtAt: new Date().toISOString(),
        recentCoreTexts: ["single cell"],
        stableLongTermTexts: ["omics"],
        highAttentionTexts: ["single cell"],
        contentRecallLabels: ["cell mapping"],
        researchTypePreferences: [{ category: "method", weight: 1 }],
        averageCollectionWeight: 0.7
      }),
      getCandidatesForRerank: vi.fn().mockResolvedValue([
        {
          candidateId: "candidate-1",
          runId: "run-1",
          title: "single cell method",
          sources: ["journal"],
          hasUserCorrectedOutput: false
        },
        {
          candidateId: "candidate-2",
          runId: "run-1",
          title: "other paper",
          sources: ["arxiv"],
          hasUserCorrectedOutput: false
        }
      ]),
      createRerankRun: vi.fn().mockResolvedValue({ id: "rerank-1" }),
      saveRerankResults: vi.fn(),
      markRerankRunSucceeded: vi.fn().mockResolvedValue({
        id: "rerank-1",
        runId: "run-1",
        recallRunId: "recall-1",
        profileSnapshotId: "snap-1",
        status: "success",
        startedAt: new Date().toISOString(),
        requestedTopN: 1,
        candidateCount: 2,
        recommendedCount: 1
      }),
      markRerankRunFailed: vi.fn(),
      getLatestRerankRun: vi.fn().mockResolvedValue(null)
    };

    const service = new DefaultRerankService(repository);
    const result = await service.runRerank({
      runId: "run-1",
      topN: 1
    });

    expect(repository.createRerankRun).toHaveBeenCalledTimes(1);
    expect(repository.saveRerankResults).toHaveBeenCalledTimes(1);
    expect(result.results[0].selected).toBe(true);
    expect(result.results[1].selected).toBe(false);
  });

  it("errors when no successful recall run exists", async () => {
    const service = new DefaultRerankService({
      getLatestSuccessfulRecallRun: vi.fn().mockResolvedValue(null),
      getProfileSnapshot: vi.fn(),
      getCandidatesForRerank: vi.fn(),
      createRerankRun: vi.fn(),
      saveRerankResults: vi.fn(),
      markRerankRunSucceeded: vi.fn(),
      markRerankRunFailed: vi.fn(),
      getLatestRerankRun: vi.fn()
    });

    await expect(service.runRerank({ runId: "run-1" })).rejects.toBeInstanceOf(AppError);
  });
});

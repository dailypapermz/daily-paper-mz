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

  it("prefers domain-aligned omics candidates over generic clinical reviews", () => {
    const profile = {
      id: "snap-1",
      builtAt: new Date().toISOString(),
      recentCoreTexts: ["single-cell transcriptomics cross-species genomics"],
      stableLongTermTexts: ["bioinformatics regulatory genomics"],
      highAttentionTexts: ["single-cell atlas genomic prediction"],
      contentRecallLabels: ["cell atlas comparative genomics"],
      researchTypePreferences: [{ category: "method" as const, weight: 1 }],
      averageCollectionWeight: 0.8
    };

    const aligned = computeRerankScores({
      candidate: {
        candidateId: "candidate-domain",
        runId: "run-1",
        title: "Single-cell atlas enables cross-species genomic prediction",
        abstractNote: "Bioinformatics framework for comparative genomics",
        sources: ["pubmed"],
        hasUserCorrectedOutput: false
      },
      recalled: {
        candidateId: "candidate-domain",
        recallScore: 0.4,
        recallRank: 1,
        selected: true
      },
      profile
    });

    const noisy = computeRerankScores({
      candidate: {
        candidateId: "candidate-noise",
        runId: "run-1",
        title: "Literature review of MRI diagnostic workflow for surgical planning",
        abstractNote: "Clinical imaging review",
        sources: ["pubmed"],
        hasUserCorrectedOutput: false
      },
      recalled: {
        candidateId: "candidate-noise",
        recallScore: 0.4,
        recallRank: 1,
        selected: true
      },
      profile
    });

    expect(aligned.finalScore).toBeGreaterThan(noisy.finalScore);
    expect(aligned.reasons).toContain("recent_core_alignment");
    expect(noisy.reasons).not.toContain("recent_core_alignment");
  });

  it("inherits topic filtering through recall without applying a second topic adjustment", () => {
    const profile = {
      id: "snap-1",
      builtAt: new Date().toISOString(),
      recentCoreTexts: ["single-cell transcriptomics cross-species genomics"],
      stableLongTermTexts: ["bioinformatics regulatory genomics"],
      highAttentionTexts: ["single-cell atlas genomic prediction"],
      contentRecallLabels: ["cell atlas comparative genomics"],
      researchTypePreferences: [{ category: "method" as const, weight: 1 }],
      averageCollectionWeight: 0.8
    };

    const neutral = computeRerankScores({
      candidate: {
        candidateId: "candidate-neutral",
        runId: "run-1",
        title: "Machine learning benchmark for molecular phenotype inference",
        abstractNote: "Predictive framework and benchmark dataset",
        sources: ["pubmed"],
        hasUserCorrectedOutput: false
      },
      recalled: {
        candidateId: "candidate-neutral",
        recallScore: 0.4,
        recallRank: 1,
        selected: true
      },
      profile
    });

    const clinical = computeRerankScores({
      candidate: {
        candidateId: "candidate-clinical",
        runId: "run-1",
        title: "Clinical management review for patient diagnosis and triage workflow",
        abstractNote: "Systematic review of screening and clinical workflow design",
        sources: ["pubmed"],
        hasUserCorrectedOutput: false
      },
      recalled: {
        candidateId: "candidate-clinical",
        recallScore: 0.2,
        recallRank: 1,
        selected: true
      },
      profile
    });

    expect(neutral.finalScore).toBeGreaterThan(clinical.finalScore);
    expect(clinical.featureWeights.topicHeuristic).toBeUndefined();
    expect(clinical.featureWeights.genericNoisePenalty).toBeUndefined();
  });

  it("changes final score only by the recall weight when only recall score changes", () => {
    const input = {
      candidate: {
        candidateId: "candidate-1",
        runId: "run-1",
        title: "Cross-species comparative genomics",
        abstractNote: "Evolutionary conservation",
        sources: ["pubmed" as const],
        hasUserCorrectedOutput: false
      },
      profile: {
        id: "snap-1",
        builtAt: new Date().toISOString(),
        recentCoreTexts: ["cross-species comparative genomics"],
        stableLongTermTexts: ["evolutionary conservation"],
        highAttentionTexts: ["regulatory genomics"],
        contentRecallLabels: ["comparative genomics"],
        researchTypePreferences: [],
        averageCollectionWeight: 0.8
      }
    };
    const lowRecall = computeRerankScores({
      ...input,
      recalled: {
        candidateId: "candidate-1",
        recallScore: 0.3,
        recallRank: 2,
        selected: true
      }
    });
    const highRecall = computeRerankScores({
      ...input,
      recalled: {
        candidateId: "candidate-1",
        recallScore: 0.5,
        recallRank: 1,
        selected: true
      }
    });

    expect(highRecall.finalScore - lowRecall.finalScore).toBeCloseTo(0.2 * 0.22, 6);
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

  it("defaults to selecting top 20 when no topN is provided", async () => {
    const repository = {
      getLatestSuccessfulRecallRun: vi.fn().mockResolvedValue({
        recallRunId: "recall-1",
        profileSnapshotId: "snap-1",
        results: [{ candidateId: "candidate-1", recallScore: 0.6, recallRank: 1, selected: true }]
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
        requestedTopN: 20,
        candidateCount: 1,
        recommendedCount: 1
      }),
      markRerankRunFailed: vi.fn(),
      getLatestRerankRun: vi.fn().mockResolvedValue(null)
    };

    const service = new DefaultRerankService(repository);
    await service.runRerank({ runId: "run-1" });

    expect(repository.createRerankRun).toHaveBeenCalledWith({
      runId: "run-1",
      recallRunId: "recall-1",
      profileSnapshotId: "snap-1",
      requestedTopN: 20
    });
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

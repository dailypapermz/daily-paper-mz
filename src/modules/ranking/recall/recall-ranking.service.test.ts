import { describe, expect, it, vi } from "vitest";

import { AppError } from "../../../lib/errors";
import {
  computeRecallFeatures,
  DefaultRecallRankingService
} from "./recall-ranking.service";
import { tokenOverlapScore } from "../text-scoring";
import { computeNegativeFeedbackPenalty } from "../../feedback/negative-feedback";
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

  it("only grants a strong single-cell boost when the profile supports that family", () => {
    const candidate = {
      candidateId: "candidate-single-cell",
      runId: "run-1",
      title: "Single-cell transcriptomics maps cell-state trajectories",
      abstractNote: "A scRNA-seq atlas method",
      sources: ["pubmed" as const]
    };
    const unsupportedProfile: ActiveProfileSnapshotRecord = {
      id: "snap-comparative",
      builtAt: new Date().toISOString(),
      representationTexts: ["cross-species evolutionary conservation"],
      contentRecallLabels: ["comparative regulatory analysis"],
      researchTypePreferences: []
    };
    const supportedProfile: ActiveProfileSnapshotRecord = {
      ...unsupportedProfile,
      id: "snap-single-cell",
      representationTexts: ["single-cell transcriptomics and scRNA-seq methods"],
      contentRecallLabels: ["cell atlas trajectory inference"]
    };

    const unsupported = computeRecallFeatures(candidate, unsupportedProfile);
    const supported = computeRecallFeatures(candidate, supportedProfile);

    expect(unsupported.reasons).not.toContain("domain_topic_alignment");
    expect(supported.reasons).toContain("domain_topic_alignment");
    expect(supported.recallScore).toBeGreaterThan(unsupported.recallScore + 0.05);
  });

  it("ranks an explicit comparative topic above unsupported cancer single-cell content", () => {
    const profile: ActiveProfileSnapshotRecord = {
      id: "snap-comparative",
      builtAt: new Date().toISOString(),
      representationTexts: ["cross-species comparative genomics and regulatory genomics"],
      contentRecallLabels: ["evolutionary conservation of gene regulation"],
      researchTypePreferences: []
    };
    const cancerSingleCell = computeRecallFeatures(
      {
        candidateId: "candidate-cancer",
        runId: "run-1",
        title: "Single-cell tumor atlas for cancer patient stratification",
        abstractNote: "Malignant cell states across carcinoma samples",
        sources: ["pubmed"]
      },
      profile
    );
    const comparative = computeRecallFeatures(
      {
        candidateId: "candidate-comparative",
        runId: "run-1",
        title: "Cross-species comparative genomics of regulatory conservation",
        abstractNote: "Evolutionary analysis of conserved gene regulation",
        sources: ["pubmed"]
      },
      profile
    );

    expect(cancerSingleCell.reasons).toContain("oncology_context_penalty");
    expect(comparative.reasons).toContain("domain_topic_alignment");
    expect(comparative.recallScore).toBeGreaterThan(cancerSingleCell.recallScore + 0.1);
  });

  it("keeps cancer papers eligible when they match an explicit regulatory topic", () => {
    const profile: ActiveProfileSnapshotRecord = {
      id: "snap-regulatory",
      builtAt: new Date().toISOString(),
      representationTexts: ["regulatory genomics chromatin and gene regulation"],
      contentRecallLabels: ["comparative regulatory genomics"],
      researchTypePreferences: []
    };
    const related = computeRecallFeatures(
      {
        candidateId: "candidate-related-cancer",
        runId: "run-1",
        title: "Regulatory genomics of chromatin conservation in cancer",
        abstractNote: "Comparative analysis of conserved gene regulation",
        sources: ["pubmed"]
      },
      profile
    );

    expect(related.recallScore).toBeGreaterThan(0.15);
    expect(related.reasons).toContain("domain_topic_alignment");
    expect(related.reasons).toContain("oncology_context_penalty");
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
    expect(noisyFeature.reasons).not.toContain("domain_topic_alignment");
  });

  it("applies extra penalty to clinical workflow titles without omics anchors", () => {
    const snapshot: ActiveProfileSnapshotRecord = {
      id: "snap-1",
      builtAt: new Date().toISOString(),
      representationTexts: ["single cell cross species transcriptomics genomics"],
      contentRecallLabels: ["single-cell atlas comparative genomics"],
      researchTypePreferences: [{ category: "method", weight: 0.8 }]
    };

    const neutralFeature = computeRecallFeatures(
      {
        candidateId: "candidate-neutral",
        runId: "run-1",
        title: "AI model for molecular phenotype inference",
        abstractNote: "Predictive modeling benchmark",
        sources: ["pubmed"]
      },
      snapshot
    );

    const clinicalFeature = computeRecallFeatures(
      {
        candidateId: "candidate-clinical",
        runId: "run-1",
        title: "Clinical diagnostic workflow for patient management and triage",
        abstractNote: "Review of patient screening and diagnosis pipeline",
        sources: ["pubmed"]
      },
      snapshot
    );

    expect(neutralFeature.recallScore).toBeGreaterThan(clinicalFeature.recallScore);
    expect(clinicalFeature.reasons).toContain("generic_clinical_noise_penalty");
    expect(clinicalFeature.reasons).not.toContain("domain_topic_alignment");
  });

  it("applies a bounded future penalty to content similar to effective dismissals", () => {
    const snapshot: ActiveProfileSnapshotRecord = {
      id: "snap-1",
      builtAt: new Date().toISOString(),
      representationTexts: ["comparative genomics cross-species regulatory conservation"],
      contentRecallLabels: ["comparative genomics"],
      researchTypePreferences: [{ category: "biology", weight: 1 }],
      negativeFeedbackSignals: [
        {
          paperIdentityKey: "doi:10.1000/dismissed",
          sourceCandidateId: "dismissed-1",
          sourceFeedbackLogId: "feedback-1",
          representationText: "oncology single-cell tumor atlas",
          contentRecallLabel: "single-cell tumor atlas",
          effectiveAt: "2026-08-01T00:00:00.000Z"
        }
      ]
    };
    const candidate = {
      candidateId: "candidate-oncology",
      runId: "run-2",
      title: "Oncology single-cell tumor atlas",
      abstractNote: "Single-cell tumor atlas",
      contentRecallLabel: "single-cell tumor atlas",
      researchCategory: "biology" as const,
      sources: ["pubmed" as const]
    };

    const penalized = computeRecallFeatures(candidate, snapshot);
    const baseline = computeRecallFeatures(candidate, {
      ...snapshot,
      negativeFeedbackSignals: []
    });

    expect(penalized.recallScore).toBeLessThan(baseline.recallScore);
    expect(penalized.recallScore).toBeGreaterThan(0);
    expect(penalized.reasons).toContain("dismiss_similarity_penalty");
  });

  it("combines profile-supported comparative genomics with bounded dismiss learning", () => {
    const negativeFeedbackSignals = [
      {
        paperIdentityKey: "doi:10.1000/oncology-1",
        sourceCandidateId: "dismissed-oncology-1",
        sourceFeedbackLogId: "feedback-oncology-1",
        representationText: "oncology single-cell tumor atlas",
        contentRecallLabel: "single-cell tumor atlas",
        effectiveAt: "2026-08-01T00:00:00.000Z"
      },
      {
        paperIdentityKey: "doi:10.1000/oncology-2",
        sourceCandidateId: "dismissed-oncology-2",
        sourceFeedbackLogId: "feedback-oncology-2",
        representationText: "oncology single-cell tumor atlas",
        contentRecallLabel: "single-cell tumor atlas",
        effectiveAt: "2026-08-02T00:00:00.000Z"
      }
    ];
    const profile: ActiveProfileSnapshotRecord = {
      id: "snap-comparative",
      builtAt: new Date().toISOString(),
      representationTexts: ["cross-species comparative genomics regulatory conservation"],
      contentRecallLabels: ["comparative genomics"],
      researchTypePreferences: [{ category: "biology", weight: 1 }]
    };
    const comparativeCandidate = {
      candidateId: "candidate-comparative",
      runId: "run-2",
      title: "Cross-species comparative genomics of regulatory conservation",
      abstractNote: "Evolutionary conservation across mammals",
      contentRecallLabel: "comparative genomics",
      researchCategory: "biology" as const,
      sources: ["pubmed" as const]
    };
    const oncologyCandidate = {
      candidateId: "candidate-oncology",
      runId: "run-2",
      title: "Oncology single-cell tumor atlas",
      abstractNote: "Single-cell tumor atlas",
      contentRecallLabel: "single-cell tumor atlas",
      researchCategory: "biology" as const,
      sources: ["pubmed" as const]
    };

    const comparativeBaseline = computeRecallFeatures(comparativeCandidate, profile);
    const comparativeWithDismiss = computeRecallFeatures(comparativeCandidate, {
      ...profile,
      negativeFeedbackSignals
    });
    const oncologyBaseline = computeRecallFeatures(oncologyCandidate, profile);
    const oncologyWithDismiss = computeRecallFeatures(oncologyCandidate, {
      ...profile,
      negativeFeedbackSignals
    });
    const expectedDismissPenalty = computeNegativeFeedbackPenalty({
      candidateText: `${oncologyCandidate.title} ${oncologyCandidate.abstractNote}`,
      contentRecallLabel: oncologyCandidate.contentRecallLabel,
      signals: negativeFeedbackSignals
    }).penalty;

    expect(comparativeWithDismiss.recallScore).toBe(comparativeBaseline.recallScore);
    expect(comparativeWithDismiss.reasons).toContain("domain_topic_alignment");
    expect(comparativeWithDismiss.reasons).not.toContain("dismiss_similarity_penalty");
    expect(oncologyWithDismiss.recallScore).toBeGreaterThan(0);
    expect(oncologyBaseline.recallScore - oncologyWithDismiss.recallScore).toBeCloseTo(
      expectedDismissPenalty,
      6
    );
    expect(oncologyWithDismiss.reasons).toContain("oncology_context_penalty");
    expect(oncologyWithDismiss.reasons).toContain("dismiss_similarity_penalty");
    expect(comparativeWithDismiss.recallScore).toBeGreaterThan(oncologyWithDismiss.recallScore);
  });

  it("preserves explicit positive profile alignment for unrelated candidates", () => {
    const baseSnapshot: ActiveProfileSnapshotRecord = {
      id: "snap-1",
      builtAt: new Date().toISOString(),
      representationTexts: ["comparative genomics cross-species regulatory conservation"],
      contentRecallLabels: ["comparative genomics"],
      researchTypePreferences: [{ category: "biology", weight: 1 }]
    };
    const candidate = {
      candidateId: "candidate-comparative",
      runId: "run-2",
      title: "Comparative genomics of cross-species enhancer conservation",
      abstractNote: "Evolutionary regulatory conservation across mammals",
      contentRecallLabel: "comparative genomics",
      researchCategory: "biology" as const,
      sources: ["pubmed" as const]
    };
    const signal = {
      paperIdentityKey: "doi:10.1000/dismissed",
      sourceCandidateId: "dismissed-1",
      sourceFeedbackLogId: "feedback-1",
      representationText: "oncology single-cell tumor atlas",
      contentRecallLabel: "single-cell tumor atlas",
      effectiveAt: "2026-08-01T00:00:00.000Z"
    };

    const withoutDismiss = computeRecallFeatures(candidate, baseSnapshot);
    const withDismiss = computeRecallFeatures(candidate, {
      ...baseSnapshot,
      negativeFeedbackSignals: [signal]
    });

    expect(withDismiss.recallScore).toBe(withoutDismiss.recallScore);
    expect(withDismiss.reasons).not.toContain("dismiss_similarity_penalty");
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

    const getProfileSnapshot = vi.fn().mockResolvedValue({
      id: "snap-1",
      builtAt: new Date().toISOString(),
      representationTexts: ["single cell model"],
      contentRecallLabels: ["single cell recall"],
      researchTypePreferences: [{ category: "method", weight: 1 }]
    });
    const service = new DefaultRecallRankingService({
      getProfileSnapshot,
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
      topN: 1,
      expectedProfileSnapshotId: "snap-1"
    });

    expect(getProfileSnapshot).toHaveBeenCalledWith("snap-1");
    expect(createRecallRun).toHaveBeenCalledTimes(1);
    expect(createRecallRun).toHaveBeenCalledWith({
      runId: "run-1",
      profileSnapshotId: "snap-1",
      requestedTopN: 1
    });
    expect(saveRecallResults).toHaveBeenCalledTimes(1);
    expect(result.results[0].selected).toBe(true);
    expect(result.results[1].selected).toBe(false);
  });

  it("fails when active profile is missing", async () => {
    const service = new DefaultRecallRankingService({
      getProfileSnapshot: vi.fn().mockResolvedValue(null),
      listRunCandidates: vi.fn(),
      createRecallRun: vi.fn(),
      saveRecallResults: vi.fn(),
      markRecallRunSucceeded: vi.fn(),
      markRecallRunFailed: vi.fn(),
      getLatestRecallRun: vi.fn()
    });

    await expect(service.runRecall({ runId: "run-1" })).rejects.toBeInstanceOf(AppError);
  });

  it("fails closed when the expected refreshed snapshot is no longer active", async () => {
    const getProfileSnapshot = vi.fn().mockResolvedValue(null);
    const createRecallRun = vi.fn();
    const service = new DefaultRecallRankingService({
      getProfileSnapshot,
      listRunCandidates: vi.fn(),
      createRecallRun,
      saveRecallResults: vi.fn(),
      markRecallRunSucceeded: vi.fn(),
      markRecallRunFailed: vi.fn(),
      getLatestRecallRun: vi.fn()
    });

    await expect(
      service.runRecall({ runId: "run-1", expectedProfileSnapshotId: "snapshot-refreshed" })
    ).rejects.toMatchObject({ code: "PROFILE_SNAPSHOT_NOT_ACTIVE" });
    expect(getProfileSnapshot).toHaveBeenCalledWith("snapshot-refreshed");
    expect(createRecallRun).not.toHaveBeenCalled();
  });
});

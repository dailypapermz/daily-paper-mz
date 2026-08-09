import type { ResearchTypeCategoryValue } from "../../tagging/types";
import type { NegativeFeedbackSignal } from "../../feedback/types";

export type RecallRunStatusValue = "running" | "success" | "failed";

export type ActiveProfileSnapshotRecord = {
  id: string;
  builtAt: string;
  representationTexts: string[];
  contentRecallLabels: string[];
  researchTypePreferences: Array<{
    category: ResearchTypeCategoryValue;
    weight: number;
  }>;
  negativeFeedbackSignals?: NegativeFeedbackSignal[];
};

export type RecallCandidateRecord = {
  candidateId: string;
  runId: string;
  title?: string;
  abstractNote?: string;
  contentRecallLabel?: string;
  researchCategory?: ResearchTypeCategoryValue;
  sources: Array<"biorxiv" | "arxiv" | "pubmed" | "journal">;
};

export type RecallFeatureScores = {
  semanticScore: number;
  tagOverlapScore: number;
  researchTypeScore: number;
  sourceScopeScore: number;
  recallScore: number;
  reasons: string[];
};

export type RecallResultRecord = {
  candidateId: string;
  rank: number;
  selected: boolean;
  scores: RecallFeatureScores;
};

export type RecallRunSummary = {
  id: string;
  runId: string;
  profileSnapshotId: string;
  status: RecallRunStatusValue;
  startedAt: string;
  finishedAt?: string;
  requestedTopN: number;
  candidateCount: number;
  recalledCount: number;
  errorMessage?: string;
};

export type RecallRunOutput = {
  run: RecallRunSummary;
  results: RecallResultRecord[];
};

export interface RecallRankingRepository {
  getActiveProfileSnapshot(): Promise<ActiveProfileSnapshotRecord | null>;
  listRunCandidates(runId: string): Promise<RecallCandidateRecord[]>;
  createRecallRun(input: { runId: string; profileSnapshotId: string; requestedTopN: number }): Promise<{ id: string }>;
  saveRecallResults(input: {
    recallRunId: string;
    results: RecallResultRecord[];
  }): Promise<void>;
  markRecallRunSucceeded(input: {
    recallRunId: string;
    candidateCount: number;
    recalledCount: number;
  }): Promise<RecallRunSummary>;
  markRecallRunFailed(input: { recallRunId: string; errorMessage: string }): Promise<RecallRunSummary>;
  getLatestRecallRun(input: { runId: string }): Promise<RecallRunOutput | null>;
}

export interface RecallRankingService {
  runRecall(input: { runId: string; topN?: number }): Promise<RecallRunOutput>;
  getLatestRecallRun(input: { runId: string }): Promise<RecallRunOutput | null>;
}

import type { ResearchTypeCategoryValue } from "../../tagging/types";

export type RerankRunStatusValue = "running" | "success" | "failed";

export type RerankProfileSnapshotRecord = {
  id: string;
  builtAt: string;
  recentCoreTexts: string[];
  stableLongTermTexts: string[];
  highAttentionTexts: string[];
  contentRecallLabels: string[];
  researchTypePreferences: Array<{
    category: ResearchTypeCategoryValue;
    weight: number;
  }>;
  averageCollectionWeight: number;
};

export type RecalledCandidateRecord = {
  candidateId: string;
  recallScore: number;
  recallRank: number;
  selected: boolean;
};

export type RerankCandidateRecord = {
  candidateId: string;
  runId: string;
  title?: string;
  abstractNote?: string;
  publishedAt?: Date;
  indexedAt?: Date;
  contentRecallLabel?: string;
  researchCategory?: ResearchTypeCategoryValue;
  sources: Array<"biorxiv" | "arxiv" | "pubmed" | "journal">;
  journalQuartile?: string;
  journalImpactScore?: number;
  hasUserCorrectedOutput: boolean;
};

export type RerankScoreBreakdown = {
  finalScore: number;
  recallScore: number;
  recentCoreScore: number;
  stableLongTermScore: number;
  highAttentionScore: number;
  contentTagScore: number;
  researchTypeScore: number;
  collectionWeightScore: number;
  sourcePriorityScore: number;
  journalQualityScore: number;
  userCorrectedScore: number;
  recencyScore: number;
  reasons: string[];
  featureWeights: Record<string, number>;
};

export type RerankResultRecord = {
  candidateId: string;
  rank: number;
  selected: boolean;
  scores: RerankScoreBreakdown;
};

export type RerankRunSummary = {
  id: string;
  runId: string;
  recallRunId: string;
  profileSnapshotId: string;
  status: RerankRunStatusValue;
  startedAt: string;
  finishedAt?: string;
  requestedTopN: number;
  candidateCount: number;
  recommendedCount: number;
  errorMessage?: string;
};

export type RerankRunOutput = {
  run: RerankRunSummary;
  results: RerankResultRecord[];
};

export interface RerankRepository {
  getLatestSuccessfulRecallRun(runId: string): Promise<{
    recallRunId: string;
    profileSnapshotId: string;
    results: RecalledCandidateRecord[];
  } | null>;
  getProfileSnapshot(profileSnapshotId: string): Promise<RerankProfileSnapshotRecord | null>;
  getCandidatesForRerank(candidateIds: string[]): Promise<RerankCandidateRecord[]>;
  createRerankRun(input: {
    runId: string;
    recallRunId: string;
    profileSnapshotId: string;
    requestedTopN: number;
  }): Promise<{ id: string }>;
  saveRerankResults(input: {
    rerankRunId: string;
    results: RerankResultRecord[];
  }): Promise<void>;
  markRerankRunSucceeded(input: {
    rerankRunId: string;
    candidateCount: number;
    recommendedCount: number;
  }): Promise<RerankRunSummary>;
  markRerankRunFailed(input: { rerankRunId: string; errorMessage: string }): Promise<RerankRunSummary>;
  getLatestRerankRun(runId: string): Promise<RerankRunOutput | null>;
}

export interface RerankService {
  runRerank(input: { runId: string; topN?: number }): Promise<RerankRunOutput>;
  getLatestRerankRun(runId: string): Promise<RerankRunOutput | null>;
}

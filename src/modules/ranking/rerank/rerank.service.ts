import { AppError } from "../../../lib/errors";
import {
  buildPreferredTopicReference,
  computeTopicHeuristicScore
} from "../topic-heuristics";
import { tokenOverlapScore } from "../text-scoring";
import type {
  RecalledCandidateRecord,
  RerankCandidateRecord,
  RerankProfileSnapshotRecord,
  RerankRepository,
  RerankResultRecord,
  RerankScoreBreakdown,
  RerankService
} from "./types";

const FEATURE_WEIGHTS = {
  recallScore: 0.22,
  recentCoreScore: 0.14,
  stableLongTermScore: 0.1,
  highAttentionScore: 0.1,
  contentTagScore: 0.1,
  researchTypeScore: 0.08,
  collectionWeightScore: 0.08,
  sourcePriorityScore: 0.08,
  journalQualityScore: 0.06,
  userCorrectedScore: 0.08,
  recencyScore: 0.06
} as const;

export class DefaultRerankService implements RerankService {
  constructor(private readonly repository: RerankRepository) {}

  async runRerank(input: { runId: string; topN?: number }) {
    const topN = input.topN && input.topN > 0 ? input.topN : 50;

    const recallRun = await this.repository.getLatestSuccessfulRecallRun(input.runId);
    if (!recallRun) {
      throw new AppError("RECALL_RUN_NOT_FOUND", "No successful recall run available for reranking", 400);
    }

    const profile = await this.repository.getProfileSnapshot(recallRun.profileSnapshotId);
    if (!profile) {
      throw new AppError("PROFILE_SNAPSHOT_NOT_FOUND", "Profile snapshot for reranking was not found", 400);
    }

    const rerankRun = await this.repository.createRerankRun({
      runId: input.runId,
      recallRunId: recallRun.recallRunId,
      profileSnapshotId: recallRun.profileSnapshotId,
      requestedTopN: topN
    });

    try {
      const recalled = recallRun.results.filter((result) => result.selected);
      const candidates = await this.repository.getCandidatesForRerank(
        recalled.map((result) => result.candidateId)
      );
      const candidateMap = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));

      const scored = recalled
        .map((recalledItem) => {
          const candidate = candidateMap.get(recalledItem.candidateId);
          if (!candidate) {
            return null;
          }

          return {
            candidateId: candidate.candidateId,
            scores: computeRerankScores({
              candidate,
              recalled: recalledItem,
              profile
            })
          };
        })
        .filter((entry): entry is { candidateId: string; scores: RerankScoreBreakdown } => Boolean(entry));

      scored.sort((left, right) => right.scores.finalScore - left.scores.finalScore);

      const results: RerankResultRecord[] = scored.map((entry, index) => ({
        candidateId: entry.candidateId,
        rank: index + 1,
        selected: index < topN,
        scores: entry.scores
      }));

      await this.repository.saveRerankResults({
        rerankRunId: rerankRun.id,
        results
      });

      const summary = await this.repository.markRerankRunSucceeded({
        rerankRunId: rerankRun.id,
        candidateCount: results.length,
        recommendedCount: Math.min(topN, results.length)
      });

      const persisted = await this.repository.getLatestRerankRun(input.runId);
      return (
        persisted ?? {
          run: summary,
          results
        }
      );
    } catch (error) {
      await this.repository.markRerankRunFailed({
        rerankRunId: rerankRun.id,
        errorMessage: error instanceof Error ? error.message : "Unknown rerank error"
      });
      throw error;
    }
  }

  async getLatestRerankRun(runId: string) {
    return this.repository.getLatestRerankRun(runId);
  }
}

export function computeRerankScores(input: {
  candidate: RerankCandidateRecord;
  recalled: RecalledCandidateRecord;
  profile: RerankProfileSnapshotRecord;
}): RerankScoreBreakdown {
  const candidateText = `${input.candidate.title ?? ""} ${input.candidate.abstractNote ?? ""}`;
  const preferredTopicReference = buildPreferredTopicReference(
    [
      ...input.profile.recentCoreTexts,
      ...input.profile.stableLongTermTexts,
      ...input.profile.highAttentionTexts
    ],
    input.profile.contentRecallLabels
  );
  const topicHeuristic = computeTopicHeuristicScore(candidateText, preferredTopicReference);

  const recentCoreScore = tokenOverlapScore(candidateText, input.profile.recentCoreTexts.join(" "));
  const stableLongTermScore = tokenOverlapScore(
    candidateText,
    input.profile.stableLongTermTexts.join(" ")
  );
  const highAttentionScore = tokenOverlapScore(
    candidateText,
    input.profile.highAttentionTexts.join(" ")
  );
  const contentTagScore = tokenOverlapScore(
    input.candidate.contentRecallLabel ?? "",
    input.profile.contentRecallLabels.join(" ")
  );
  const researchTypeScore = computeResearchTypeScore(input.candidate.researchCategory, input.profile);
  const collectionWeightScore = clampScore(input.profile.averageCollectionWeight);
  const sourcePriorityScore = computeSourcePriority(input.candidate.sources);
  const journalQualityScore = computeJournalQuality(input.candidate.journalQuartile, input.candidate.journalImpactScore);
  const userCorrectedScore = input.candidate.hasUserCorrectedOutput ? 1 : 0;
  const recencyScore = computeRecencyScore(input.candidate.publishedAt ?? input.candidate.indexedAt);
  const recallScore = clampScore(input.recalled.recallScore);

  const baseFinalScore =
    recallScore * FEATURE_WEIGHTS.recallScore +
      recentCoreScore * FEATURE_WEIGHTS.recentCoreScore +
      stableLongTermScore * FEATURE_WEIGHTS.stableLongTermScore +
      highAttentionScore * FEATURE_WEIGHTS.highAttentionScore +
      contentTagScore * FEATURE_WEIGHTS.contentTagScore +
      researchTypeScore * FEATURE_WEIGHTS.researchTypeScore +
      collectionWeightScore * FEATURE_WEIGHTS.collectionWeightScore +
      sourcePriorityScore * FEATURE_WEIGHTS.sourcePriorityScore +
      journalQualityScore * FEATURE_WEIGHTS.journalQualityScore +
      userCorrectedScore * FEATURE_WEIGHTS.userCorrectedScore +
      recencyScore * FEATURE_WEIGHTS.recencyScore;

  const finalScore = clampScore(
    baseFinalScore + topicHeuristic.score * 0.12 - topicHeuristic.penalty * 0.12
  );

  return {
    finalScore,
    recallScore,
    recentCoreScore,
    stableLongTermScore,
    highAttentionScore,
    contentTagScore,
    researchTypeScore,
    collectionWeightScore,
    sourcePriorityScore,
    journalQualityScore,
    userCorrectedScore,
    recencyScore,
    reasons: buildReasons({
      recallScore,
      recentCoreScore,
      highAttentionScore,
      researchTypeScore,
      journalQualityScore,
      userCorrectedScore,
      topicHeuristic
    }),
    featureWeights: {
      ...FEATURE_WEIGHTS,
      topicHeuristic: 0.12,
      genericNoisePenalty: -0.12
    }
  };
}

function buildReasons(input: {
  recallScore: number;
  recentCoreScore: number;
  highAttentionScore: number;
  researchTypeScore: number;
  journalQualityScore: number;
  userCorrectedScore: number;
  topicHeuristic: ReturnType<typeof computeTopicHeuristicScore>;
}) {
  const reasons: string[] = [];
  if (input.recallScore >= 0.2) {
    reasons.push("strong_recall_score");
  }
  if (input.recentCoreScore >= 0.15) {
    reasons.push("recent_core_alignment");
  }
  if (input.highAttentionScore >= 0.1) {
    reasons.push("high_attention_similarity");
  }
  if (input.researchTypeScore >= 0.2) {
    reasons.push("research_type_alignment");
  }
  if (input.journalQualityScore >= 0.7) {
    reasons.push("high_journal_quality");
  }
  if (input.userCorrectedScore >= 1) {
    reasons.push("user_corrected_signal");
  }
  if (input.topicHeuristic.score >= 0.18) {
    reasons.push("domain_topic_alignment");
  }
  if (input.topicHeuristic.penalty >= 0.07) {
    reasons.push("generic_clinical_noise_penalty");
  }
  if (reasons.length === 0) {
    reasons.push("baseline_rerank_score");
  }
  return reasons;
}

function computeResearchTypeScore(
  category: "method" | "biology" | "resource" | "benchmark" | undefined,
  profile: RerankProfileSnapshotRecord
) {
  if (!category || profile.researchTypePreferences.length === 0) {
    return 0;
  }

  const pref = profile.researchTypePreferences.find((entry) => entry.category === category)?.weight;
  if (!pref) {
    return 0;
  }

  const max = Math.max(...profile.researchTypePreferences.map((entry) => entry.weight), 1);
  return clampScore(pref / max);
}

function computeSourcePriority(sources: Array<"biorxiv" | "arxiv" | "pubmed" | "journal">) {
  if (sources.length === 0) {
    return 0.4;
  }

  const scores = sources.map((source) => {
    if (source === "journal") {
      return 1;
    }
    if (source === "pubmed") {
      return 0.9;
    }
    if (source === "biorxiv") {
      return 0.8;
    }
    return 0.75;
  });

  return clampScore(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

function computeJournalQuality(quartile?: string, impactScore?: number) {
  const normalizedQuartile = quartile?.toUpperCase().match(/Q[1-4]/)?.[0];
  if (normalizedQuartile === "Q1") {
    return 1;
  }
  if (normalizedQuartile === "Q2") {
    return 0.8;
  }
  if (normalizedQuartile === "Q3") {
    return 0.6;
  }
  if (normalizedQuartile === "Q4") {
    return 0.45;
  }

  if (!impactScore || impactScore <= 0) {
    return 0;
  }

  return clampScore(Math.log10(impactScore + 1));
}

function computeRecencyScore(date?: Date) {
  if (!date) {
    return 0;
  }

  const now = Date.now();
  const diffDays = Math.max(0, (now - date.getTime()) / (24 * 60 * 60 * 1000));
  return clampScore(1 / (1 + diffDays));
}

function clampScore(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return Number(value.toFixed(6));
}

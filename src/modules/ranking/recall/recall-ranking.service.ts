import { AppError } from "../../../lib/errors";
import type {
  ActiveProfileSnapshotRecord,
  RecallCandidateRecord,
  RecallFeatureScores,
  RecallRankingRepository,
  RecallRankingService,
  RecallResultRecord
} from "./types";

export class DefaultRecallRankingService implements RecallRankingService {
  constructor(private readonly repository: RecallRankingRepository) {}

  async runRecall(input: { runId: string; topN?: number }) {
    const topN = input.topN && input.topN > 0 ? input.topN : 100;

    const snapshot = await this.repository.getActiveProfileSnapshot();
    if (!snapshot) {
      throw new AppError("ACTIVE_PROFILE_NOT_FOUND", "No active profile snapshot available", 400);
    }

    const run = await this.repository.createRecallRun({
      runId: input.runId,
      profileSnapshotId: snapshot.id,
      requestedTopN: topN
    });

    try {
      const candidates = await this.repository.listRunCandidates(input.runId);
      const scored = candidates.map((candidate) => ({
        candidateId: candidate.candidateId,
        scores: computeRecallFeatures(candidate, snapshot)
      }));

      scored.sort((left, right) => right.scores.recallScore - left.scores.recallScore);

      const results: RecallResultRecord[] = scored.map((entry, index) => ({
        candidateId: entry.candidateId,
        rank: index + 1,
        selected: index < topN,
        scores: entry.scores
      }));

      await this.repository.saveRecallResults({
        recallRunId: run.id,
        results
      });

      const summary = await this.repository.markRecallRunSucceeded({
        recallRunId: run.id,
        candidateCount: candidates.length,
        recalledCount: Math.min(topN, results.length)
      });

      const persisted = await this.repository.getLatestRecallRun({
        runId: input.runId
      });

      return (
        persisted ?? {
          run: summary,
          results
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown recall ranking error";
      await this.repository.markRecallRunFailed({
        recallRunId: run.id,
        errorMessage: message
      });
      throw error;
    }
  }

  async getLatestRecallRun(input: { runId: string }) {
    return this.repository.getLatestRecallRun(input);
  }
}

export function computeRecallFeatures(
  candidate: RecallCandidateRecord,
  snapshot: ActiveProfileSnapshotRecord
): RecallFeatureScores {
  const profileText = `${snapshot.representationTexts.join(" ")} ${snapshot.contentRecallLabels.join(" ")}`;
  const candidateText = `${candidate.title ?? ""} ${candidate.abstractNote ?? ""}`;

  const semanticScore = tokenOverlapScore(candidateText, profileText);
  const tagOverlapScore = tokenOverlapScore(candidate.contentRecallLabel ?? "", snapshot.contentRecallLabels.join(" "));

  const researchPreference = candidate.researchCategory
    ? snapshot.researchTypePreferences.find((entry) => entry.category === candidate.researchCategory)?.weight
    : undefined;
  const maxPreference = Math.max(
    1,
    ...snapshot.researchTypePreferences.map((entry) => entry.weight)
  );
  const researchTypeScore = researchPreference ? clampScore(researchPreference / maxPreference) : 0;

  const sourceScopeScore = computeSourceScopeScore(candidate.sources);

  const recallScore = clampScore(
    semanticScore * 0.55 +
      tagOverlapScore * 0.2 +
      researchTypeScore * 0.15 +
      sourceScopeScore * 0.1
  );

  const reasons = buildReasons({
    semanticScore,
    tagOverlapScore,
    researchTypeScore,
    sourceScopeScore
  });

  return {
    semanticScore,
    tagOverlapScore,
    researchTypeScore,
    sourceScopeScore,
    recallScore,
    reasons
  };
}

function buildReasons(input: {
  semanticScore: number;
  tagOverlapScore: number;
  researchTypeScore: number;
  sourceScopeScore: number;
}) {
  const reasons: string[] = [];
  if (input.semanticScore >= 0.15) {
    reasons.push("semantic_profile_overlap");
  }
  if (input.tagOverlapScore >= 0.15) {
    reasons.push("content_tag_overlap");
  }
  if (input.researchTypeScore >= 0.25) {
    reasons.push("research_type_preference_match");
  }
  if (input.sourceScopeScore >= 0.7) {
    reasons.push("source_scope_priority");
  }

  if (reasons.length === 0) {
    reasons.push("weak_profile_match");
  }

  return reasons;
}

export function tokenOverlapScore(leftText: string, rightText: string): number {
  const leftTokens = toTokenSet(leftText);
  const rightTokens = toTokenSet(rightText);
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  }

  return clampScore(intersection / Math.max(leftTokens.size, rightTokens.size));
}

function toTokenSet(value: string): Set<string> {
  const normalized = value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);

  return new Set(normalized);
}

function computeSourceScopeScore(
  sources: Array<"biorxiv" | "arxiv" | "pubmed" | "journal">
): number {
  if (sources.length === 0) {
    return 0.4;
  }

  const sourceScores = sources.map((source) => {
    if (source === "journal") {
      return 1;
    }
    if (source === "pubmed") {
      return 0.9;
    }
    if (source === "biorxiv" || source === "arxiv") {
      return 0.8;
    }
    return 0.6;
  });

  return clampScore(sourceScores.reduce((sum, score) => sum + score, 0) / sourceScores.length);
}

function clampScore(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return Number(value.toFixed(6));
}

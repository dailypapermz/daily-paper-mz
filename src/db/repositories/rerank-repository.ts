import { Prisma, type PrismaClient } from "../../generated/prisma";
import type {
  RerankProfileSnapshotRecord,
  RerankRepository,
  RerankResultRecord,
  RerankRunOutput,
  RerankRunSummary
} from "../../modules/ranking/rerank/types";
import type { ResearchTypeCategoryValue } from "../../modules/tagging/types";

export class PrismaRerankRepository implements RerankRepository {
  constructor(private readonly db: PrismaClient) {}

  async getLatestSuccessfulRecallRun(runId: string) {
    const recallRun = await this.db.dailyRecallRun.findFirst({
      where: {
        runId,
        status: "SUCCESS"
      },
      include: {
        results: {
          orderBy: [{ rank: "asc" }]
        }
      },
      orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }]
    });

    if (!recallRun) {
      return null;
    }

    return {
      recallRunId: recallRun.id,
      profileSnapshotId: recallRun.profileSnapshotId,
      results: recallRun.results.map((result) => ({
        candidateId: result.canonicalCandidateId,
        recallScore: result.recallScore,
        recallRank: result.rank,
        selected: result.selected
      }))
    };
  }

  async getProfileSnapshot(profileSnapshotId: string): Promise<RerankProfileSnapshotRecord | null> {
    const snapshot = await this.db.profileSnapshot.findUnique({
      where: {
        id: profileSnapshotId
      },
      include: {
        itemSignals: true,
        researchTypePreferences: true
      }
    });

    if (!snapshot) {
      return null;
    }

    const recentCore = snapshot.itemSignals.filter((signal) => signal.segment === "RECENT_CORE");
    const stable = snapshot.itemSignals.filter((signal) => signal.segment === "STABLE_LONG_TERM");
    const highAttention = snapshot.itemSignals.filter((signal) => signal.attentionWeight >= 1.5);

    const averageCollectionWeight =
      snapshot.itemSignals.length === 0
        ? 0
        : snapshot.itemSignals.reduce((sum, signal) => sum + signal.collectionWeight, 0) /
          snapshot.itemSignals.length;

    return {
      id: snapshot.id,
      builtAt: snapshot.builtAt.toISOString(),
      recentCoreTexts: recentCore.map((signal) => signal.representationText),
      stableLongTermTexts: stable.map((signal) => signal.representationText),
      highAttentionTexts: highAttention.map((signal) => signal.representationText),
      contentRecallLabels: snapshot.itemSignals
        .map((signal) => signal.contentRecallLabel ?? undefined)
        .filter((value): value is string => Boolean(value)),
      researchTypePreferences: snapshot.researchTypePreferences.map((pref) => ({
        category: fromDbResearchCategory(pref.category),
        weight: pref.weight
      })),
      averageCollectionWeight
    };
  }

  async getCandidatesForRerank(candidateIds: string[]) {
    if (candidateIds.length === 0) {
      return [];
    }

    const rows = await this.db.dailyCanonicalCandidate.findMany({
      where: {
        id: {
          in: candidateIds
        }
      },
      include: {
        labels: true,
        summary: true,
        provenances: {
          include: {
            sourceCandidate: {
              include: {
                journalEnrichment: true
              }
            }
          }
        }
      }
    });

    return rows.map((row) => {
      const contentLabel = row.labels.find((label) => label.labelType === "CONTENT_RECALL");
      const researchType = row.labels.find((label) => label.labelType === "RESEARCH_TYPE");

      const enriched = row.provenances
        .map((provenance) => provenance.sourceCandidate.journalEnrichment)
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
        .filter((entry) => entry.status === "ENRICHED")
        .sort((left, right) => (right.impactScore ?? 0) - (left.impactScore ?? 0));
      const bestEnriched = enriched[0];

      return {
        candidateId: row.id,
        runId: row.runId,
        title: row.title ?? undefined,
        abstractNote: row.abstractNote ?? undefined,
        publishedAt: row.publishedAt ?? undefined,
        indexedAt: row.indexedAt ?? undefined,
        contentRecallLabel: contentLabel?.contentRecallLabel ?? undefined,
        researchCategory: researchType?.researchCategory
          ? fromDbResearchCategory(researchType.researchCategory)
          : undefined,
        sources: [...new Set(row.provenances.map((provenance) => fromDbSource(provenance.source)))],
        journalQuartile: bestEnriched?.quartile ?? undefined,
        journalImpactScore: bestEnriched?.impactScore ?? undefined,
        hasUserCorrectedOutput:
          row.summary?.provenance === "USER_CORRECTED" ||
          row.labels.some((label) => label.provenance === "USER_CORRECTED")
      };
    });
  }

  async createRerankRun(input: {
    runId: string;
    recallRunId: string;
    profileSnapshotId: string;
    requestedTopN: number;
  }) {
    const run = await this.db.dailyRerankRun.create({
      data: {
        runId: input.runId,
        recallRunId: input.recallRunId,
        profileSnapshotId: input.profileSnapshotId,
        requestedTopN: input.requestedTopN,
        status: "RUNNING"
      },
      select: {
        id: true
      }
    });

    return {
      id: run.id
    };
  }

  async saveRerankResults(input: { rerankRunId: string; results: RerankResultRecord[] }) {
    await this.db.$transaction(async (tx) => {
      await tx.dailyRecommendationResult.deleteMany({
        where: {
          rerankRunId: input.rerankRunId
        }
      });

      for (const result of input.results) {
        await tx.dailyRecommendationResult.create({
          data: {
            rerankRunId: input.rerankRunId,
            canonicalCandidateId: result.candidateId,
            rank: result.rank,
            selected: result.selected,
            finalScore: result.scores.finalScore,
            recallScore: result.scores.recallScore,
            recentCoreScore: result.scores.recentCoreScore,
            stableLongTermScore: result.scores.stableLongTermScore,
            highAttentionScore: result.scores.highAttentionScore,
            contentTagScore: result.scores.contentTagScore,
            researchTypeScore: result.scores.researchTypeScore,
            collectionWeightScore: result.scores.collectionWeightScore,
            sourcePriorityScore: result.scores.sourcePriorityScore,
            journalQualityScore: result.scores.journalQualityScore,
            userCorrectedScore: result.scores.userCorrectedScore,
            recencyScore: result.scores.recencyScore,
            reasonsJson: result.scores.reasons as unknown as Prisma.InputJsonValue,
            featureWeightsJson: result.scores.featureWeights as unknown as Prisma.InputJsonValue
          }
        });
      }
    });
  }

  async markRerankRunSucceeded(input: {
    rerankRunId: string;
    candidateCount: number;
    recommendedCount: number;
  }): Promise<RerankRunSummary> {
    const run = await this.db.dailyRerankRun.update({
      where: {
        id: input.rerankRunId
      },
      data: {
        status: "SUCCESS",
        candidateCount: input.candidateCount,
        recommendedCount: input.recommendedCount,
        finishedAt: new Date(),
        errorMessage: null
      }
    });

    return mapRunSummary(run);
  }

  async markRerankRunFailed(input: { rerankRunId: string; errorMessage: string }): Promise<RerankRunSummary> {
    const run = await this.db.dailyRerankRun.update({
      where: {
        id: input.rerankRunId
      },
      data: {
        status: "FAILED",
        errorMessage: input.errorMessage,
        finishedAt: new Date()
      }
    });

    return mapRunSummary(run);
  }

  async getLatestRerankRun(runId: string): Promise<RerankRunOutput | null> {
    const run = await this.db.dailyRerankRun.findFirst({
      where: {
        runId
      },
      include: {
        results: {
          orderBy: [{ rank: "asc" }]
        }
      },
      orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }]
    });

    if (!run) {
      return null;
    }

    return {
      run: mapRunSummary(run),
      results: run.results.map((result) => ({
        candidateId: result.canonicalCandidateId,
        rank: result.rank,
        selected: result.selected,
        scores: {
          finalScore: result.finalScore,
          recallScore: result.recallScore,
          recentCoreScore: result.recentCoreScore,
          stableLongTermScore: result.stableLongTermScore,
          highAttentionScore: result.highAttentionScore,
          contentTagScore: result.contentTagScore,
          researchTypeScore: result.researchTypeScore,
          collectionWeightScore: result.collectionWeightScore,
          sourcePriorityScore: result.sourcePriorityScore,
          journalQualityScore: result.journalQualityScore,
          userCorrectedScore: result.userCorrectedScore,
          recencyScore: result.recencyScore,
          reasons: toStringArray(result.reasonsJson),
          featureWeights: toObject(result.featureWeightsJson)
        }
      }))
    };
  }
}

function mapRunSummary(run: {
  id: string;
  runId: string;
  recallRunId: string;
  profileSnapshotId: string;
  status: "RUNNING" | "SUCCESS" | "FAILED";
  startedAt: Date;
  finishedAt: Date | null;
  requestedTopN: number;
  candidateCount: number;
  recommendedCount: number;
  errorMessage: string | null;
}): RerankRunSummary {
  return {
    id: run.id,
    runId: run.runId,
    recallRunId: run.recallRunId,
    profileSnapshotId: run.profileSnapshotId,
    status: fromDbStatus(run.status),
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString(),
    requestedTopN: run.requestedTopN,
    candidateCount: run.candidateCount,
    recommendedCount: run.recommendedCount,
    errorMessage: run.errorMessage ?? undefined
  };
}

function fromDbStatus(value: "RUNNING" | "SUCCESS" | "FAILED") {
  if (value === "RUNNING") {
    return "running";
  }
  if (value === "SUCCESS") {
    return "success";
  }
  return "failed";
}

function fromDbSource(value: "BIORXIV" | "ARXIV" | "PUBMED" | "JOURNAL") {
  if (value === "BIORXIV") {
    return "biorxiv";
  }
  if (value === "ARXIV") {
    return "arxiv";
  }
  if (value === "PUBMED") {
    return "pubmed";
  }
  return "journal";
}

function fromDbResearchCategory(
  value: "METHOD" | "BIOLOGY" | "RESOURCE" | "BENCHMARK"
): ResearchTypeCategoryValue {
  if (value === "METHOD") {
    return "method";
  }
  if (value === "BIOLOGY") {
    return "biology";
  }
  if (value === "RESOURCE") {
    return "resource";
  }
  return "benchmark";
}

function toStringArray(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function toObject(value: Prisma.JsonValue): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const object = value as Record<string, unknown>;
  const result: Record<string, number> = {};
  for (const [key, entry] of Object.entries(object)) {
    if (typeof entry === "number" && Number.isFinite(entry)) {
      result[key] = entry;
    }
  }
  return result;
}

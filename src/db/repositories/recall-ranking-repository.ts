import { Prisma, type PrismaClient } from "../../generated/prisma";
import type {
  ActiveProfileSnapshotRecord,
  RecallRankingRepository,
  RecallResultRecord,
  RecallRunOutput,
  RecallRunSummary
} from "../../modules/ranking/recall/types";
import type { ResearchTypeCategoryValue } from "../../modules/tagging/types";

export class PrismaRecallRankingRepository implements RecallRankingRepository {
  constructor(private readonly db: PrismaClient) {}

  async getActiveProfileSnapshot(): Promise<ActiveProfileSnapshotRecord | null> {
    const snapshot = await this.db.profileSnapshot.findFirst({
      where: {
        status: "ACTIVE"
      },
      include: {
        itemSignals: {
          select: {
            representationText: true,
            contentRecallLabel: true
          }
        },
        researchTypePreferences: {
          select: {
            category: true,
            weight: true
          }
        }
      },
      orderBy: [{ builtAt: "desc" }, { createdAt: "desc" }]
    });

    if (!snapshot) {
      return null;
    }

    return {
      id: snapshot.id,
      builtAt: snapshot.builtAt.toISOString(),
      representationTexts: snapshot.itemSignals
        .map((signal) => signal.representationText)
        .filter((value): value is string => Boolean(value)),
      contentRecallLabels: snapshot.itemSignals
        .map((signal) => signal.contentRecallLabel ?? undefined)
        .filter((value): value is string => Boolean(value)),
      researchTypePreferences: snapshot.researchTypePreferences.map((preference) => ({
        category: fromDbResearchCategory(preference.category),
        weight: preference.weight
      }))
    };
  }

  async listRunCandidates(runId: string) {
    const rows = await this.db.dailyCanonicalCandidate.findMany({
      where: {
        runId
      },
      include: {
        labels: true
      },
      orderBy: [{ createdAt: "asc" }]
    });

    return rows.map((row) => {
      const contentRecall = row.labels.find((label) => label.labelType === "CONTENT_RECALL");
      const researchType = row.labels.find((label) => label.labelType === "RESEARCH_TYPE");

      return {
        candidateId: row.id,
        runId: row.runId,
        title: row.title ?? undefined,
        abstractNote: row.abstractNote ?? undefined,
        contentRecallLabel: contentRecall?.contentRecallLabel ?? undefined,
        researchCategory: researchType?.researchCategory
          ? fromDbResearchCategory(researchType.researchCategory)
          : undefined,
        sources: toSourceList(row.sourceProvenanceJson)
      };
    });
  }

  async createRecallRun(input: { runId: string; profileSnapshotId: string; requestedTopN: number }) {
    const run = await this.db.dailyRecallRun.create({
      data: {
        runId: input.runId,
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

  async saveRecallResults(input: { recallRunId: string; results: RecallResultRecord[] }) {
    if (input.results.length === 0) {
      return;
    }

    await this.db.$transaction(async (tx) => {
      await tx.dailyRecallResult.deleteMany({
        where: {
          recallRunId: input.recallRunId
        }
      });

      for (const result of input.results) {
        await tx.dailyRecallResult.create({
          data: {
            recallRunId: input.recallRunId,
            canonicalCandidateId: result.candidateId,
            rank: result.rank,
            selected: result.selected,
            recallScore: result.scores.recallScore,
            semanticScore: result.scores.semanticScore,
            tagOverlapScore: result.scores.tagOverlapScore,
            researchTypeScore: result.scores.researchTypeScore,
            sourceScopeScore: result.scores.sourceScopeScore,
            reasonsJson: result.scores.reasons as unknown as Prisma.InputJsonValue
          }
        });
      }
    }, { timeout: 60_000 });
  }

  async markRecallRunSucceeded(input: {
    recallRunId: string;
    candidateCount: number;
    recalledCount: number;
  }): Promise<RecallRunSummary> {
    const run = await this.db.dailyRecallRun.update({
      where: {
        id: input.recallRunId
      },
      data: {
        status: "SUCCESS",
        candidateCount: input.candidateCount,
        recalledCount: input.recalledCount,
        finishedAt: new Date(),
        errorMessage: null
      }
    });

    return mapRun(run);
  }

  async markRecallRunFailed(input: { recallRunId: string; errorMessage: string }): Promise<RecallRunSummary> {
    const run = await this.db.dailyRecallRun.update({
      where: {
        id: input.recallRunId
      },
      data: {
        status: "FAILED",
        errorMessage: input.errorMessage,
        finishedAt: new Date()
      }
    });

    return mapRun(run);
  }

  async getLatestRecallRun(input: { runId: string }): Promise<RecallRunOutput | null> {
    const run = await this.db.dailyRecallRun.findFirst({
      where: {
        runId: input.runId
      },
      orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
      include: {
        results: {
          orderBy: [{ rank: "asc" }]
        }
      }
    });

    if (!run) {
      return null;
    }

    return {
      run: mapRun(run),
      results: run.results.map((result) => ({
        candidateId: result.canonicalCandidateId,
        rank: result.rank,
        selected: result.selected,
        scores: {
          recallScore: result.recallScore,
          semanticScore: result.semanticScore,
          tagOverlapScore: result.tagOverlapScore,
          researchTypeScore: result.researchTypeScore,
          sourceScopeScore: result.sourceScopeScore,
          reasons: toStringArray(result.reasonsJson)
        }
      }))
    };
  }
}

function mapRun(run: {
  id: string;
  runId: string;
  profileSnapshotId: string;
  status: "RUNNING" | "SUCCESS" | "FAILED";
  startedAt: Date;
  finishedAt: Date | null;
  requestedTopN: number;
  candidateCount: number;
  recalledCount: number;
  errorMessage: string | null;
}): RecallRunSummary {
  return {
    id: run.id,
    runId: run.runId,
    profileSnapshotId: run.profileSnapshotId,
    status: fromDbStatus(run.status),
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt ? run.finishedAt.toISOString() : undefined,
    requestedTopN: run.requestedTopN,
    candidateCount: run.candidateCount,
    recalledCount: run.recalledCount,
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

  return value.filter((entry): entry is string => typeof entry === "string");
}

function toSourceList(value: Prisma.JsonValue): Array<"biorxiv" | "arxiv" | "pubmed" | "journal"> {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique = new Set<"biorxiv" | "arxiv" | "pubmed" | "journal">();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const source = (item as Record<string, unknown>).source;
    if (source === "biorxiv" || source === "arxiv" || source === "pubmed" || source === "journal") {
      unique.add(source);
    }
  }

  return [...unique];
}

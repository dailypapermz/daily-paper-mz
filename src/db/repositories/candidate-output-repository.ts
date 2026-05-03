import { Prisma, type PrismaClient } from "../../generated/prisma";
import type {
  CandidateGeneratedOutput,
  CandidateOutputRecord,
  CandidateOutputRepository,
  CandidateStructuredLabels,
  CandidateSummaryFields
} from "../../modules/summary/types";

export class PrismaCandidateOutputRepository implements CandidateOutputRepository {
  constructor(private readonly db: PrismaClient) {}

  async listCandidatesForGeneration(input: { runId: string; limit: number; selectedOnly?: boolean }) {
    const rows = input.selectedOnly
      ? await this.listSelectedCandidatesForGeneration(input.runId, input.limit)
      : await this.db.dailyCanonicalCandidate.findMany({
          where: {
            runId: input.runId
          },
          orderBy: [{ mergedSourceCount: "desc" }, { createdAt: "asc" }],
          take: input.limit
        });

    return rows.map((row) => ({
      candidateId: row.id,
      runId: row.runId,
      canonicalKey: row.canonicalKey,
      title: row.title ?? undefined,
      abstractNote: row.abstractNote ?? undefined,
      journalName: row.journalName ?? undefined,
      doi: row.doi ?? undefined,
      sourceProvenance: toSourceProvenance(row.sourceProvenanceJson)
    }));
  }

  private async listSelectedCandidatesForGeneration(runId: string, limit: number) {
    const latestRerank = await this.db.dailyRerankRun.findFirst({
      where: {
        runId,
        status: "SUCCESS"
      },
      orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true
      }
    });

    if (!latestRerank) {
      return [];
    }

    const rows = await this.db.dailyRecommendationResult.findMany({
      where: {
        rerankRunId: latestRerank.id,
        selected: true
      },
      orderBy: [{ rank: "asc" }],
      take: limit,
      select: {
        canonicalCandidate: true
      }
    });

    return rows.map((row) => row.canonicalCandidate);
  }

  async saveGeneratedOutput(input: {
    candidateId: string;
    provider: string;
    output: CandidateGeneratedOutput;
  }) {
    await this.db.$transaction(async (tx) => {
      const existingSummary = await tx.dailyCandidateSummary.findUnique({
        where: {
          canonicalCandidateId: input.candidateId
        }
      });
      if (!existingSummary || existingSummary.provenance === "GENERATED") {
        await tx.dailyCandidateSummary.upsert({
          where: {
            canonicalCandidateId: input.candidateId
          },
          create: {
            canonicalCandidateId: input.candidateId,
            researchQuestion: input.output.summary.researchQuestion,
            method: input.output.summary.method,
            mainFinding: input.output.summary.mainFinding,
            relevanceToUser: input.output.summary.relevanceToUser,
            provenance: "GENERATED",
            provider: input.provider
          },
          update: {
            researchQuestion: input.output.summary.researchQuestion,
            method: input.output.summary.method,
            mainFinding: input.output.summary.mainFinding,
            relevanceToUser: input.output.summary.relevanceToUser,
            provenance: "GENERATED",
            provider: input.provider
          }
        });
      }

      const contentLabel = input.output.labels.contentRecallLabel?.trim();
      if (contentLabel) {
        const existingContentLabel = await tx.dailyCandidateStructuredLabel.findUnique({
          where: {
            canonicalCandidateId_labelType: {
              canonicalCandidateId: input.candidateId,
              labelType: "CONTENT_RECALL"
            }
          }
        });

        if (!existingContentLabel || existingContentLabel.provenance === "GENERATED") {
          await tx.dailyCandidateStructuredLabel.upsert({
            where: {
              canonicalCandidateId_labelType: {
                canonicalCandidateId: input.candidateId,
                labelType: "CONTENT_RECALL"
              }
            },
            create: {
              canonicalCandidateId: input.candidateId,
              labelType: "CONTENT_RECALL",
              contentRecallLabel: contentLabel,
              provenance: "GENERATED",
              provider: input.provider
            },
            update: {
              contentRecallLabel: contentLabel,
              provenance: "GENERATED",
              provider: input.provider
            }
          });
        }
      }

      const research = input.output.labels.researchType;
      const hasResearchLabel =
        research && (research.category || research.primaryKeyword || research.secondaryKeyword || research.rawText);
      if (hasResearchLabel) {
        const existingResearchLabel = await tx.dailyCandidateStructuredLabel.findUnique({
          where: {
            canonicalCandidateId_labelType: {
              canonicalCandidateId: input.candidateId,
              labelType: "RESEARCH_TYPE"
            }
          }
        });

        if (!existingResearchLabel || existingResearchLabel.provenance === "GENERATED") {
          await tx.dailyCandidateStructuredLabel.upsert({
            where: {
              canonicalCandidateId_labelType: {
                canonicalCandidateId: input.candidateId,
                labelType: "RESEARCH_TYPE"
              }
            },
            create: {
              canonicalCandidateId: input.candidateId,
              labelType: "RESEARCH_TYPE",
              researchCategory: research?.category ? toDbResearchCategory(research.category) : null,
              primaryKeyword: research?.primaryKeyword ?? null,
              secondaryKeyword: research?.secondaryKeyword ?? null,
              rawLabelText: research?.rawText ?? null,
              provenance: "GENERATED",
              provider: input.provider
            },
            update: {
              researchCategory: research?.category ? toDbResearchCategory(research.category) : null,
              primaryKeyword: research?.primaryKeyword ?? null,
              secondaryKeyword: research?.secondaryKeyword ?? null,
              rawLabelText: research?.rawText ?? null,
              provenance: "GENERATED",
              provider: input.provider
            }
          });
        }
      }
    });
  }

  async saveUserCorrectedOutput(input: {
    candidateId: string;
    provider: string;
    summary?: CandidateSummaryFields;
    labels?: CandidateStructuredLabels;
  }) {
    await this.db.$transaction(async (tx) => {
      if (input.summary) {
        await tx.dailyCandidateSummary.upsert({
          where: {
            canonicalCandidateId: input.candidateId
          },
          create: {
            canonicalCandidateId: input.candidateId,
            researchQuestion: input.summary.researchQuestion,
            method: input.summary.method,
            mainFinding: input.summary.mainFinding,
            relevanceToUser: input.summary.relevanceToUser,
            provenance: "USER_CORRECTED",
            provider: input.provider
          },
          update: {
            researchQuestion: input.summary.researchQuestion,
            method: input.summary.method,
            mainFinding: input.summary.mainFinding,
            relevanceToUser: input.summary.relevanceToUser,
            provenance: "USER_CORRECTED",
            provider: input.provider
          }
        });
      }

      if (input.labels?.contentRecallLabel !== undefined) {
        const contentLabel = input.labels.contentRecallLabel?.trim();
        if (!contentLabel) {
          await tx.dailyCandidateStructuredLabel.deleteMany({
            where: {
              canonicalCandidateId: input.candidateId,
              labelType: "CONTENT_RECALL"
            }
          });
        } else {
          await tx.dailyCandidateStructuredLabel.upsert({
            where: {
              canonicalCandidateId_labelType: {
                canonicalCandidateId: input.candidateId,
                labelType: "CONTENT_RECALL"
              }
            },
            create: {
              canonicalCandidateId: input.candidateId,
              labelType: "CONTENT_RECALL",
              contentRecallLabel: contentLabel,
              provenance: "USER_CORRECTED",
              provider: input.provider
            },
            update: {
              contentRecallLabel: contentLabel,
              provenance: "USER_CORRECTED",
              provider: input.provider
            }
          });
        }
      }

      if (input.labels?.researchType !== undefined) {
        const research = input.labels.researchType;
        const hasResearchContent =
          research &&
          (research.category || research.primaryKeyword || research.secondaryKeyword || research.rawText);

        if (!hasResearchContent) {
          await tx.dailyCandidateStructuredLabel.deleteMany({
            where: {
              canonicalCandidateId: input.candidateId,
              labelType: "RESEARCH_TYPE"
            }
          });
        } else {
          await tx.dailyCandidateStructuredLabel.upsert({
            where: {
              canonicalCandidateId_labelType: {
                canonicalCandidateId: input.candidateId,
                labelType: "RESEARCH_TYPE"
              }
            },
            create: {
              canonicalCandidateId: input.candidateId,
              labelType: "RESEARCH_TYPE",
              researchCategory: research?.category ? toDbResearchCategory(research.category) : null,
              primaryKeyword: research?.primaryKeyword ?? null,
              secondaryKeyword: research?.secondaryKeyword ?? null,
              rawLabelText: research?.rawText ?? null,
              provenance: "USER_CORRECTED",
              provider: input.provider
            },
            update: {
              researchCategory: research?.category ? toDbResearchCategory(research.category) : null,
              primaryKeyword: research?.primaryKeyword ?? null,
              secondaryKeyword: research?.secondaryKeyword ?? null,
              rawLabelText: research?.rawText ?? null,
              provenance: "USER_CORRECTED",
              provider: input.provider
            }
          });
        }
      }
    });
  }

  async listRunOutputs(runId: string): Promise<CandidateOutputRecord[]> {
    const rows = await this.db.dailyCanonicalCandidate.findMany({
      where: {
        runId
      },
      include: {
        summary: true,
        labels: true
      },
      orderBy: [{ createdAt: "asc" }]
    });

    return rows.map((row) => mapCandidateOutput(row));
  }

  async listRunOutputsByCandidateId(candidateId: string): Promise<CandidateOutputRecord[]> {
    const row = await this.db.dailyCanonicalCandidate.findUnique({
      where: {
        id: candidateId
      },
      include: {
        summary: true,
        labels: true
      }
    });

    if (!row) {
      return [];
    }

    return [mapCandidateOutput(row)];
  }
}

function mapCandidateOutput(row: {
  id: string;
  runId: string;
  canonicalKey: string;
  title: string | null;
  summary: {
    researchQuestion: string;
    method: string;
    mainFinding: string;
    relevanceToUser: string;
    provenance: "GENERATED" | "USER_CORRECTED";
    provider: string;
  } | null;
  labels: Array<{
    labelType: "CONTENT_RECALL" | "RESEARCH_TYPE";
    contentRecallLabel: string | null;
    researchCategory: "METHOD" | "BIOLOGY" | "RESOURCE" | "BENCHMARK" | null;
    primaryKeyword: string | null;
    secondaryKeyword: string | null;
    rawLabelText: string | null;
    provenance: "GENERATED" | "USER_CORRECTED";
    provider: string;
  }>;
}): CandidateOutputRecord {
  const contentRecall = row.labels.find((label) => label.labelType === "CONTENT_RECALL");
  const researchType = row.labels.find((label) => label.labelType === "RESEARCH_TYPE");

  return {
    candidateId: row.id,
    runId: row.runId,
    canonicalKey: row.canonicalKey,
    title: row.title ?? undefined,
    summary: row.summary
      ? {
          researchQuestion: row.summary.researchQuestion,
          method: row.summary.method,
          mainFinding: row.summary.mainFinding,
          relevanceToUser: row.summary.relevanceToUser,
          provenance: fromDbProvenance(row.summary.provenance),
          provider: row.summary.provider
        }
      : undefined,
    labels: {
      contentRecall:
        contentRecall?.contentRecallLabel
          ? {
              label: contentRecall.contentRecallLabel,
              provenance: fromDbProvenance(contentRecall.provenance),
              provider: contentRecall.provider
            }
          : undefined,
      researchType: researchType
        ? {
            category: researchType.researchCategory
              ? fromDbResearchCategory(researchType.researchCategory)
              : undefined,
            primaryKeyword: researchType.primaryKeyword ?? undefined,
            secondaryKeyword: researchType.secondaryKeyword ?? undefined,
            rawText: researchType.rawLabelText ?? undefined,
            provenance: fromDbProvenance(researchType.provenance),
            provider: researchType.provider
          }
        : undefined
    }
  };
}

function toSourceProvenance(
  value: Prisma.JsonValue
): Array<{ source: "biorxiv" | "arxiv" | "pubmed" | "journal"; externalId: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  const records: Array<{ source: "biorxiv" | "arxiv" | "pubmed" | "journal"; externalId: string }> = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const source = toSourceValue((item as Record<string, unknown>).source);
    const externalId = toStringValue((item as Record<string, unknown>).externalId);
    if (!source || !externalId) {
      continue;
    }

    records.push({
      source,
      externalId
    });
  }

  return records;
}

function toSourceValue(value: unknown): "biorxiv" | "arxiv" | "pubmed" | "journal" | undefined {
  if (value === "biorxiv" || value === "arxiv" || value === "pubmed" || value === "journal") {
    return value;
  }
  return undefined;
}

function toStringValue(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toDbResearchCategory(value: "method" | "biology" | "resource" | "benchmark") {
  if (value === "method") {
    return "METHOD";
  }
  if (value === "biology") {
    return "BIOLOGY";
  }
  if (value === "resource") {
    return "RESOURCE";
  }
  return "BENCHMARK";
}

function fromDbResearchCategory(value: "METHOD" | "BIOLOGY" | "RESOURCE" | "BENCHMARK") {
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

function fromDbProvenance(value: "GENERATED" | "USER_CORRECTED") {
  if (value === "GENERATED") {
    return "generated";
  }
  return "user_corrected";
}

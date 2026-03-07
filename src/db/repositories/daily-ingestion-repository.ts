import type { Prisma, PrismaClient } from "../../generated/prisma";
import { toIsoDate } from "../../lib/utils";
import type {
  DailyCandidateRecord,
  DailyCandidateSourceValue,
  DailyIngestionRepository,
  DailyIngestionRunSummary,
  DailySourceAdapterCandidate
} from "../../modules/ingestion/types";

export class PrismaDailyIngestionRepository implements DailyIngestionRepository {
  constructor(private readonly db: PrismaClient) {}

  async createRun(input: { source: DailyCandidateSourceValue; runDate: Date }) {
    const run = await this.db.dailyIngestionRun.create({
      data: {
        source: toDbSource(input.source),
        status: "RUNNING",
        runDate: input.runDate
      },
      select: {
        id: true
      }
    });

    return { id: run.id };
  }

  async saveCandidates(input: {
    runId: string;
    source: DailyCandidateSourceValue;
    candidates: DailySourceAdapterCandidate[];
  }) {
    if (input.candidates.length === 0) {
      return 0;
    }

    await this.db.dailyCandidate.createMany({
      data: input.candidates.map((candidate) => ({
        runId: input.runId,
        source: toDbSource(input.source),
        externalId: candidate.externalId,
        title: candidate.title ?? null,
        abstractNote: candidate.abstractNote ?? null,
        publishedAt: candidate.publishedAt ?? null,
        indexedAt: candidate.indexedAt ?? null,
        url: candidate.url ?? null,
        doi: candidate.doi ?? null,
        pmid: candidate.pmid ?? null,
        arxivId: candidate.arxivId ?? null,
        bioRxivId: candidate.bioRxivId ?? null,
        journalName: candidate.journalName ?? null,
        authorsJson: candidate.authors as unknown as Prisma.InputJsonValue,
        sourcePayloadJson: candidate.sourcePayload as Prisma.InputJsonValue,
        ingestedAt: new Date()
      }))
    });

    return input.candidates.length;
  }

  async markRunSucceeded(input: { runId: string; candidatesCount: number }) {
    const run = await this.db.dailyIngestionRun.update({
      where: { id: input.runId },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        candidatesCount: input.candidatesCount,
        errorMessage: null
      }
    });

    return mapRunSummary(run);
  }

  async markRunFailed(input: { runId: string; errorMessage: string }) {
    const run = await this.db.dailyIngestionRun.update({
      where: { id: input.runId },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        errorMessage: input.errorMessage
      }
    });

    return mapRunSummary(run);
  }

  async getLatestRun(input?: { source?: DailyCandidateSourceValue }) {
    const run = await this.db.dailyIngestionRun.findFirst({
      where: input?.source
        ? {
            source: toDbSource(input.source)
          }
        : undefined,
      orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }]
    });

    if (!run) {
      return null;
    }

    return mapRunSummary(run);
  }

  async listCandidatesByRun(runId: string): Promise<DailyCandidateRecord[]> {
    const rows = await this.db.dailyCandidate.findMany({
      where: { runId },
      orderBy: [{ createdAt: "desc" }]
    });

    return rows.map((row) => ({
      id: row.id,
      runId: row.runId,
      source: fromDbSource(row.source),
      externalId: row.externalId,
      title: row.title ?? undefined,
      abstractNote: row.abstractNote ?? undefined,
      publishedAt: row.publishedAt ?? undefined,
      indexedAt: row.indexedAt ?? undefined,
      url: row.url ?? undefined,
      doi: row.doi ?? undefined,
      pmid: row.pmid ?? undefined,
      arxivId: row.arxivId ?? undefined,
      bioRxivId: row.bioRxivId ?? undefined,
      journalName: row.journalName ?? undefined,
      authors: toStringArray(row.authorsJson),
      sourcePayload: row.sourcePayloadJson as Record<string, unknown>
    }));
  }
}

function toDbSource(source: DailyCandidateSourceValue) {
  if (source === "biorxiv") {
    return "BIORXIV";
  }
  if (source === "arxiv") {
    return "ARXIV";
  }
  if (source === "pubmed") {
    return "PUBMED";
  }
  return "JOURNAL";
}

function fromDbSource(source: "BIORXIV" | "ARXIV" | "PUBMED" | "JOURNAL") {
  if (source === "BIORXIV") {
    return "biorxiv";
  }
  if (source === "ARXIV") {
    return "arxiv";
  }
  if (source === "PUBMED") {
    return "pubmed";
  }
  return "journal";
}

function fromDbStatus(status: "RUNNING" | "SUCCESS" | "FAILED") {
  if (status === "RUNNING") {
    return "running";
  }
  if (status === "SUCCESS") {
    return "success";
  }
  return "failed";
}

function mapRunSummary(run: {
  id: string;
  source: "BIORXIV" | "ARXIV" | "PUBMED" | "JOURNAL";
  status: "RUNNING" | "SUCCESS" | "FAILED";
  runDate: Date;
  startedAt: Date;
  finishedAt: Date | null;
  candidatesCount: number;
  errorMessage: string | null;
}): DailyIngestionRunSummary {
  return {
    id: run.id,
    source: fromDbSource(run.source),
    status: fromDbStatus(run.status),
    runDate: toIsoDate(run.runDate),
    startedAt: toIsoDate(run.startedAt),
    finishedAt: run.finishedAt ? toIsoDate(run.finishedAt) : undefined,
    candidatesCount: run.candidatesCount,
    errorMessage: run.errorMessage ?? undefined
  };
}

function toStringArray(value: Prisma.JsonValue | null): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

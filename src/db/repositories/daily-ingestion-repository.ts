import type { Prisma, PrismaClient } from "../../generated/prisma";
import { toIsoDate } from "../../lib/utils";
import type {
  DailyCandidateRecord,
  DailyCandidateSourceValue,
  DailyIngestionRunSourceValue,
  DailyIngestionRepository,
  DailyIngestionRunSummary,
  DailySourceAdapterCandidate
} from "../../modules/ingestion/types";

export class PrismaDailyIngestionRepository implements DailyIngestionRepository {
  private readonly staleAfterMs: number;
  private readonly now: () => Date;

  constructor(
    private readonly db: PrismaClient,
    options?: { staleAfterMs?: number; now?: () => Date }
  ) {
    this.staleAfterMs = options?.staleAfterMs ?? 180 * 60 * 1000;
    this.now = options?.now ?? (() => new Date());
  }

  async acquireRun(input: {
    source: DailyIngestionRunSourceValue;
    runDate: Date;
    requestKey: string;
  }) {
    const existing = await this.db.dailyIngestionRun.findUnique({
      where: { requestKey: input.requestKey }
    });
    if (existing) return this.resolveExistingRun(existing);

    try {
      const run = await this.db.dailyIngestionRun.create({
        data: {
          requestKey: input.requestKey,
          source: toDbRunSource(input.source),
          status: "RUNNING",
          runDate: input.runDate
        }
      });
      return { run: mapRunSummary(run), disposition: "acquired" as const };
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      const winner = await this.db.dailyIngestionRun.findUnique({
        where: { requestKey: input.requestKey }
      });
      if (!winner) throw error;
      return this.resolveExistingRun(winner);
    }
  }

  private async resolveExistingRun(existing: Parameters<typeof mapRunSummary>[0]) {
    if (existing.status === "SUCCESS") {
      return { run: mapRunSummary(existing), disposition: "already_succeeded" as const };
    }
    const now = this.now();
    const staleBefore = new Date(now.getTime() - this.staleAfterMs);
    const canReclaim = existing.status === "FAILED" || existing.startedAt <= staleBefore;
    if (!canReclaim) {
      return { run: mapRunSummary(existing), disposition: "already_running" as const };
    }

    const expectedStatus = existing.status;
    const claimed = await this.db.$transaction(async (tx) => {
      const updated = await tx.dailyIngestionRun.updateMany({
        where: {
          id: existing.id,
          status: expectedStatus,
          ...(expectedStatus === "RUNNING" ? { startedAt: { lte: staleBefore } } : {})
        },
        data: {
          status: "RUNNING",
          startedAt: now,
          finishedAt: null,
          candidatesCount: 0,
          errorMessage: null,
          attempt: { increment: 1 }
        }
      });
      if (updated.count !== 1) return false;
      await tx.dailyPipelineStageRun.deleteMany({ where: { runId: existing.id } });
      await tx.candidateFeedbackLog.deleteMany({ where: { runId: existing.id } });
      await tx.dailyRecallRun.deleteMany({ where: { runId: existing.id } });
      await tx.dailyCanonicalCandidate.deleteMany({ where: { runId: existing.id } });
      await tx.dailyCandidate.deleteMany({ where: { runId: existing.id } });
      return true;
    });

    const current = await this.db.dailyIngestionRun.findUniqueOrThrow({
      where: { id: existing.id }
    });
    return {
      run: mapRunSummary(current),
      disposition: claimed ? ("retry" as const) : dispositionForStatus(current.status)
    };
  }

  async finalizeRunSuccess(input: {
    runId: string;
    entries: Array<{
      source: DailyCandidateSourceValue;
      candidate: DailySourceAdapterCandidate;
    }>;
    checkpoints: Array<{
      source: DailyCandidateSourceValue;
      successfulAt: Date;
      seenExternalIds?: string[];
    }>;
  }) {
    const finishedAt = this.now();
    return this.db.$transaction(async (tx) => {
      if (input.entries.length > 0) {
        await tx.dailyCandidate.createMany({
          data: input.entries.map((entry) => ({
            runId: input.runId,
            source: toDbCandidateSource(entry.source),
            externalId: entry.candidate.externalId,
            title: entry.candidate.title ?? null,
            abstractNote: entry.candidate.abstractNote ?? null,
            publishedAt: entry.candidate.publishedAt ?? null,
            indexedAt: entry.candidate.indexedAt ?? null,
            url: entry.candidate.url ?? null,
            doi: entry.candidate.doi ?? null,
            pmid: entry.candidate.pmid ?? null,
            arxivId: entry.candidate.arxivId ?? null,
            bioRxivId: entry.candidate.bioRxivId ?? null,
            journalName: entry.candidate.journalName ?? null,
            authorsJson: entry.candidate.authors as unknown as Prisma.InputJsonValue,
            sourcePayloadJson: entry.candidate.sourcePayload as Prisma.InputJsonValue,
            ingestedAt: finishedAt
          }))
        });
      }

      for (const checkpoint of input.checkpoints) {
        const source = toDbCandidateSource(checkpoint.source);
        await tx.sourceIngestionCursor.upsert({
          where: { source },
          create: { source, lastSuccessfulAt: checkpoint.successfulAt },
          update: {}
        });
        await tx.sourceIngestionCursor.updateMany({
          where: { source, lastSuccessfulAt: { lt: checkpoint.successfulAt } },
          data: { lastSuccessfulAt: checkpoint.successfulAt }
        });
        for (const externalId of new Set(checkpoint.seenExternalIds ?? [])) {
          await tx.sourceSeenItem.upsert({
            where: { source_externalId: { source, externalId } },
            create: { source, externalId },
            update: {}
          });
        }
      }

      const run = await tx.dailyIngestionRun.update({
        where: { id: input.runId },
        data: {
          status: "SUCCESS",
          finishedAt,
          candidatesCount: input.entries.length,
          errorMessage: null
        }
      });
      return mapRunSummary(run);
    });
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

  async getLatestRun(input?: { source?: DailyIngestionRunSourceValue }) {
    const run = await this.db.dailyIngestionRun.findFirst({
      where: input?.source
        ? {
            source: toDbRunSource(input.source)
          }
        : undefined,
      orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }]
    });

    if (!run) {
      return null;
    }

    return mapRunSummary(run);
  }

  async getRun(runId: string) {
    const run = await this.db.dailyIngestionRun.findUnique({ where: { id: runId } });
    return run ? mapRunSummary(run) : null;
  }

  async listCandidatesByRun(runId: string): Promise<DailyCandidateRecord[]> {
    const rows = await this.db.dailyCandidate.findMany({
      where: { runId },
      orderBy: [{ createdAt: "desc" }]
    });

    return rows.map((row) => ({
      id: row.id,
      runId: row.runId,
      source: fromDbCandidateSource(row.source),
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

  async getSourceCursor(source: DailyCandidateSourceValue) {
    const cursor = await this.db.sourceIngestionCursor.findUnique({
      where: { source: toDbCandidateSource(source) },
      select: { lastSuccessfulAt: true }
    });
    return cursor?.lastSuccessfulAt;
  }

  async listSeenExternalIds(source: DailyCandidateSourceValue, externalIds: string[]) {
    if (externalIds.length === 0) return new Set<string>();
    const rows = await this.db.sourceSeenItem.findMany({
      where: {
        source: toDbCandidateSource(source),
        externalId: { in: Array.from(new Set(externalIds)) }
      },
      select: { externalId: true }
    });
    return new Set(rows.map((row) => row.externalId));
  }

}

function toDbRunSource(source: DailyIngestionRunSourceValue) {
  if (source === "aggregated") {
    return "AGGREGATED";
  }
  return toDbCandidateSource(source);
}

function toDbCandidateSource(source: DailyCandidateSourceValue) {
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

function fromDbRunSource(source: "BIORXIV" | "ARXIV" | "PUBMED" | "JOURNAL" | "AGGREGATED") {
  if (source === "AGGREGATED") {
    return "aggregated";
  }
  return fromDbCandidateSource(source);
}

function fromDbCandidateSource(source: "BIORXIV" | "ARXIV" | "PUBMED" | "JOURNAL") {
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
  requestKey: string | null;
  attempt: number;
  source: "BIORXIV" | "ARXIV" | "PUBMED" | "JOURNAL" | "AGGREGATED";
  status: "RUNNING" | "SUCCESS" | "FAILED";
  runDate: Date;
  startedAt: Date;
  finishedAt: Date | null;
  candidatesCount: number;
  errorMessage: string | null;
}): DailyIngestionRunSummary {
  return {
    id: run.id,
    requestKey: run.requestKey ?? undefined,
    attempt: run.attempt,
    source: fromDbRunSource(run.source),
    status: fromDbStatus(run.status),
    runDate: toIsoDate(run.runDate),
    startedAt: toIsoDate(run.startedAt),
    finishedAt: run.finishedAt ? toIsoDate(run.finishedAt) : undefined,
    candidatesCount: run.candidatesCount,
    errorMessage: run.errorMessage ?? undefined
  };
}

function dispositionForStatus(status: "RUNNING" | "SUCCESS" | "FAILED") {
  return status === "SUCCESS" ? ("already_succeeded" as const) : ("already_running" as const);
}

function isUniqueConflict(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === "P2002");
}

function toStringArray(value: Prisma.JsonValue | null): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

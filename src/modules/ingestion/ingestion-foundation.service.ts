import { AppError } from "../../lib/errors";
import { isCandidateInUtcDay, normalizeAdapterCandidate, resolveUtcDayWindow } from "./new-today";
import type {
  AggregatedSourceIngestionSummary,
  DailyCandidateSourceValue,
  DailyIngestionRepository,
  DailyIngestionService,
  DailySourceAdapter,
  DailySourceAdapterCandidate
} from "./types";

const DEFAULT_SOURCES: DailyCandidateSourceValue[] = ["biorxiv", "arxiv", "pubmed", "journal"];

export class DefaultDailyIngestionService implements DailyIngestionService {
  constructor(
    private readonly adapters: Map<string, DailySourceAdapter>,
    private readonly repository: DailyIngestionRepository
  ) {}

  async runSourceIngestion(input: { source: DailyCandidateSourceValue; runDate?: string }) {
    const adapter = this.getAdapterOrThrow(input.source);
    const window = resolveUtcDayWindow(input.runDate);
    const runRecord = await this.repository.createRun({
      source: input.source,
      runDate: window.runDate
    });

    try {
      const candidates = await this.fetchValidCandidates(adapter, window);
      const candidatesCount = await this.repository.saveCandidates({
        runId: runRecord.id,
        entries: candidates.map((candidate) => ({
          source: input.source,
          candidate
        }))
      });

      const run = await this.repository.markRunSucceeded({
        runId: runRecord.id,
        candidatesCount
      });

      const persistedCandidates = await this.repository.listCandidatesByRun(runRecord.id);

      return {
        run,
        candidates: persistedCandidates
      };
    } catch (error) {
      await this.handleRunFailure(runRecord.id, error);
      throw error;
    }
  }

  async runAggregatedIngestion(input?: {
    runDate?: string;
    sources?: DailyCandidateSourceValue[];
  }) {
    const sources = input?.sources?.length ? input.sources : DEFAULT_SOURCES;
    const window = resolveUtcDayWindow(input?.runDate);
    const runRecord = await this.repository.createRun({
      source: "aggregated",
      runDate: window.runDate
    });

    const sourceSummaries: AggregatedSourceIngestionSummary[] = [];
    const entries: Array<{ source: DailyCandidateSourceValue; candidate: DailySourceAdapterCandidate }> = [];

    try {
      for (const source of sources) {
        const adapter = this.getAdapterOrThrow(source);
        const candidates = await this.fetchValidCandidates(adapter, window);
        sourceSummaries.push({
          source,
          candidatesCount: candidates.length
        });

        for (const candidate of candidates) {
          entries.push({
            source,
            candidate
          });
        }
      }

      const candidatesCount = await this.repository.saveCandidates({
        runId: runRecord.id,
        entries
      });

      const run = await this.repository.markRunSucceeded({
        runId: runRecord.id,
        candidatesCount
      });

      const persistedCandidates = await this.repository.listCandidatesByRun(runRecord.id);

      return {
        run,
        candidates: persistedCandidates,
        sourceSummaries
      };
    } catch (error) {
      await this.handleRunFailure(runRecord.id, error);
      throw error;
    }
  }

  async getLatestRun(input?: { source?: DailyCandidateSourceValue | "aggregated" }) {
    return this.repository.getLatestRun(input);
  }

  private getAdapterOrThrow(source: DailyCandidateSourceValue) {
    const adapter = this.adapters.get(source);
    if (!adapter) {
      throw new AppError(
        "INGESTION_ADAPTER_NOT_CONFIGURED",
        `No adapter configured for source '${source}'`,
        400
      );
    }
    return adapter;
  }

  private async fetchValidCandidates(adapter: DailySourceAdapter, window: ReturnType<typeof resolveUtcDayWindow>) {
    const fetched = await adapter.fetchCandidatesForDay(window);
    const filtered = fetched
      .map((candidate) => normalizeAdapterCandidate(candidate))
      .filter((candidate) => isCandidateInUtcDay(candidate, window, adapter.source));

    return filtered.filter((candidate) => candidate.externalId.length > 0);
  }

  private async handleRunFailure(runId: string, error: unknown) {
    const appError =
      error instanceof AppError
        ? error
        : new AppError(
            "INGESTION_RUN_FAILED",
            error instanceof Error ? error.message : "Unknown ingestion error"
          );

    await this.repository.markRunFailed({
      runId,
      errorMessage: appError.message
    });
  }
}

export function createAdapterMap(adapters: DailySourceAdapter[]): Map<string, DailySourceAdapter> {
  return new Map(adapters.map((adapter) => [adapter.source, adapter]));
}

export function toCandidateDate(value: unknown): Date | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function makeAdapterCandidate(input: {
  externalId: string;
  sourcePayload: Record<string, unknown>;
  title?: string;
  abstractNote?: string;
  publishedAt?: Date;
  indexedAt?: Date;
  url?: string;
  doi?: string;
  pmid?: string;
  arxivId?: string;
  bioRxivId?: string;
  journalName?: string;
  authors?: string[];
}): DailySourceAdapterCandidate {
  return {
    externalId: input.externalId,
    sourcePayload: input.sourcePayload,
    title: input.title,
    abstractNote: input.abstractNote,
    publishedAt: input.publishedAt,
    indexedAt: input.indexedAt,
    url: input.url,
    doi: input.doi,
    pmid: input.pmid,
    arxivId: input.arxivId,
    bioRxivId: input.bioRxivId,
    journalName: input.journalName,
    authors: input.authors ?? []
  };
}

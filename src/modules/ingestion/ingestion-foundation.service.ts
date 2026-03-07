import { AppError } from "../../lib/errors";
import {
  isCandidateInUtcDay,
  normalizeAdapterCandidate,
  resolveUtcDayWindow
} from "./new-today";
import type {
  DailyIngestionRepository,
  DailyIngestionService,
  DailySourceAdapter,
  DailySourceAdapterCandidate
} from "./types";

export class DefaultDailyIngestionService implements DailyIngestionService {
  constructor(
    private readonly adapters: Map<string, DailySourceAdapter>,
    private readonly repository: DailyIngestionRepository
  ) {}

  async runSourceIngestion(input: { source: "biorxiv" | "arxiv" | "pubmed" | "journal"; runDate?: string }) {
    const adapter = this.adapters.get(input.source);

    if (!adapter) {
      throw new AppError(
        "INGESTION_ADAPTER_NOT_CONFIGURED",
        `No adapter configured for source '${input.source}'`,
        400
      );
    }

    const window = resolveUtcDayWindow(input.runDate);
    const runRecord = await this.repository.createRun({
      source: input.source,
      runDate: window.runDate
    });

    try {
      const fetched = await adapter.fetchCandidatesForDay(window);
      const filtered = fetched
        .map((candidate) => normalizeAdapterCandidate(candidate))
        .filter((candidate) => isCandidateInUtcDay(candidate, window));

      const valid = filtered.filter((candidate) => candidate.externalId.length > 0);

      const candidatesCount = await this.repository.saveCandidates({
        runId: runRecord.id,
        source: input.source,
        candidates: valid
      });

      const run = await this.repository.markRunSucceeded({
        runId: runRecord.id,
        candidatesCount
      });

      const candidates = await this.repository.listCandidatesByRun(runRecord.id);

      return {
        run,
        candidates
      };
    } catch (error) {
      const appError =
        error instanceof AppError
          ? error
          : new AppError(
              "INGESTION_RUN_FAILED",
              error instanceof Error ? error.message : "Unknown ingestion error"
            );

      await this.repository.markRunFailed({
        runId: runRecord.id,
        errorMessage: appError.message
      });

      throw appError;
    }
  }

  async getLatestRun(input?: { source?: "biorxiv" | "arxiv" | "pubmed" | "journal" }) {
    return this.repository.getLatestRun(input);
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

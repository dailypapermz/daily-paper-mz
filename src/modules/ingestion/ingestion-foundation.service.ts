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
const INITIAL_INCREMENTAL_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

export class DefaultDailyIngestionService implements DailyIngestionService {
  constructor(
    private readonly adapters: Map<string, DailySourceAdapter>,
    private readonly repository: DailyIngestionRepository
  ) {}

  async runSourceIngestion(input: { source: DailyCandidateSourceValue; runDate?: string }) {
    const adapter = this.getAdapterOrThrow(input.source);
    const window = resolveUtcDayWindow(input.runDate);
    const lease = await this.repository.acquireRun({
      source: input.source,
      runDate: window.dayStart,
      requestKey: buildDailyRunRequestKey(window.dayStart, [input.source])
    });
    if (lease.disposition === "already_running") {
      throw new AppError("DAILY_RUN_ALREADY_RUNNING", `Daily run is already active: ${lease.run.requestKey}`, 409, {
        runId: lease.run.id
      });
    }
    if (lease.disposition === "already_succeeded") {
      return {
        run: lease.run,
        candidates: await this.repository.listCandidatesByRun(lease.run.id),
        disposition: lease.disposition
      };
    }
    const runRecord = lease.run;

    try {
      const fetched = await this.fetchCandidates(adapter, window);
      const candidates = fetched.candidates;
      const run = await this.repository.finalizeRunSuccess({
        runId: runRecord.id,
        attempt: runRecord.attempt,
        entries: candidates.map((candidate) => ({
          source: input.source,
          candidate
        })),
        checkpoints: [{
          source: input.source,
          successfulAt: fetched.windowEnd,
          seenExternalIds: usesFirstSeenIds(input.source) ? fetched.fetchedExternalIds : undefined
        }]
      });

      const persistedCandidates = await this.repository.listCandidatesByRun(runRecord.id);

      return {
        run,
        candidates: persistedCandidates,
        disposition: lease.disposition
      };
    } catch (error) {
      await this.handleRunFailure(runRecord.id, runRecord.attempt, error);
      throw withRunId(error, runRecord.id);
    }
  }

  async runAggregatedIngestion(input?: {
    runDate?: string;
    sources?: DailyCandidateSourceValue[];
  }) {
    const sources = uniqueSources(input?.sources?.length ? input.sources : DEFAULT_SOURCES);
    const window = resolveUtcDayWindow(input?.runDate);
    const lease = await this.repository.acquireRun({
      source: "aggregated",
      runDate: window.dayStart,
      requestKey: buildDailyRunRequestKey(window.dayStart, sources, true)
    });
    if (lease.disposition === "already_running") {
      throw new AppError("DAILY_RUN_ALREADY_RUNNING", `Daily run is already active: ${lease.run.requestKey}`, 409, {
        runId: lease.run.id
      });
    }
    if (lease.disposition === "already_succeeded") {
      const candidates = await this.repository.listCandidatesByRun(lease.run.id);
      return {
        run: lease.run,
        candidates,
        sourceSummaries: summarizePersistedSources(sources, candidates),
        disposition: lease.disposition
      };
    }
    const runRecord = lease.run;

    const sourceSummaries: AggregatedSourceIngestionSummary[] = [];
    const entries: Array<{ source: DailyCandidateSourceValue; candidate: DailySourceAdapterCandidate }> = [];
    const successfulFetches: Array<{
      source: DailyCandidateSourceValue;
      windowEnd: Date;
      fetchedExternalIds: string[];
    }> = [];
    let succeededSourceCount = 0;

    try {
      const outcomes = await Promise.all(sources.map(async (source) => {
        try {
          const adapter = this.getAdapterOrThrow(source);
          const fetched = await this.fetchCandidates(adapter, window);
          return { source, fetched } as const;
        } catch (error) {
          return { source, error } as const;
        }
      }));

      for (const outcome of outcomes) {
        if ("error" in outcome) {
          sourceSummaries.push({
            source: outcome.source,
            status: "failed",
            candidatesCount: 0,
            errorMessage: errorToMessage(outcome.error)
          });
          continue;
        }
        const { source, fetched } = outcome;
        const candidates = fetched.candidates;
          succeededSourceCount += 1;
          sourceSummaries.push({
            source,
            status: "success",
            candidatesCount: candidates.length,
            fetchedCount: fetched.fetchedCount,
            filteredCount: fetched.fetchedCount - candidates.length,
            windowStart: fetched.windowStart.toISOString(),
            windowEnd: fetched.windowEnd.toISOString(),
            filterMode: fetched.filterMode
          });
          successfulFetches.push({
            source,
            windowEnd: fetched.windowEnd,
            fetchedExternalIds: fetched.fetchedExternalIds
          });

          for (const candidate of candidates) {
            entries.push({
              source,
              candidate
            });
          }
      }

      if (succeededSourceCount === 0) {
        throw new AppError(
          "AGGREGATED_INGESTION_FAILED",
          sourceSummaries.find((summary) => summary.errorMessage)?.errorMessage ??
            "All configured daily sources failed"
        );
      }

      const run = await this.repository.finalizeRunSuccess({
        runId: runRecord.id,
        attempt: runRecord.attempt,
        entries,
        checkpoints: successfulFetches.map((fetched) => ({
          source: fetched.source,
          successfulAt: fetched.windowEnd,
          seenExternalIds: usesFirstSeenIds(fetched.source) ? fetched.fetchedExternalIds : undefined
        })),
        pipelineInitialization: {
          ingestionStatus: sourceSummaries.some((summary) => summary.status === "failed")
            ? "partial"
            : "success",
          ingestionDetails: { sources: sourceSummaries }
        }
      });

      const persistedCandidates = await this.repository.listCandidatesByRun(runRecord.id);

      return {
        run,
        candidates: persistedCandidates,
        sourceSummaries,
        disposition: lease.disposition
      };
    } catch (error) {
      await this.handleRunFailure(runRecord.id, runRecord.attempt, error);
      throw withRunId(error, runRecord.id);
    }
  }

  async getLatestRun(input?: { source?: DailyCandidateSourceValue | "aggregated" }) {
    return this.repository.getLatestRun(input);
  }

  async getRun(runId: string) {
    return this.repository.getRun(runId);
  }

  async setPipelineOutcome(input: {
    runId: string;
    status: "complete" | "complete_with_warnings" | "partial" | "failed";
  }) {
    return this.repository.setPipelineOutcome(input);
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

  private async fetchCandidates(adapter: DailySourceAdapter, dayWindow: ReturnType<typeof resolveUtcDayWindow>) {
    const cursor = await this.repository.getSourceCursor(adapter.source);
    const windowEnd = minDate(dayWindow.dayEnd, new Date());
    const fallbackStart = startOfUtcDate(
      new Date(windowEnd.getTime() - INITIAL_INCREMENTAL_LOOKBACK_MS)
    );
    const watermarkStart = cursor && cursor < windowEnd ? cursor : fallbackStart;
    const windowStart = adapter.source === "biorxiv" ? fallbackStart : watermarkStart;
    const window = { ...dayWindow, sourceStart: windowStart, sourceEnd: windowEnd };
    const fetched = (await adapter.fetchCandidatesForDay(window))
      .map((candidate) => normalizeAdapterCandidate(candidate))
      .filter((candidate) => candidate.externalId.length > 0);
    const uniqueFetched = dedupeByExternalId(fetched);

    if (usesFirstSeenIds(adapter.source)) {
      const seen = await this.repository.listSeenExternalIds(
        adapter.source,
        uniqueFetched.map((candidate) => candidate.externalId)
      );
      const unseen = uniqueFetched.filter((candidate) => !seen.has(candidate.externalId));
      const candidates = cursor
        ? unseen
        : unseen.filter((candidate) => isCandidateInRange(candidate, windowStart, windowEnd));
      return makeFetchResult(candidates, uniqueFetched, windowStart, windowEnd, "first_seen");
    }

    if (adapter.source === "pubmed") {
      const candidates = uniqueFetched.filter((candidate) =>
        isCandidateInUtcDay(candidate, dayWindow, adapter.source)
      );
      return makeFetchResult(candidates, uniqueFetched, dayWindow.dayStart, dayWindow.dayEnd, "indexed_day");
    }

    const candidates = uniqueFetched.filter((candidate) =>
      isCandidateInRange(candidate, windowStart, windowEnd)
    );
    return makeFetchResult(candidates, uniqueFetched, windowStart, windowEnd, "watermark");
  }

  private async handleRunFailure(runId: string, attempt: number, error: unknown) {
    const appError =
      error instanceof AppError
        ? error
        : new AppError(
            "INGESTION_RUN_FAILED",
            error instanceof Error ? error.message : "Unknown ingestion error"
          );

    await this.repository.markRunFailed({
      runId,
      attempt,
      errorMessage: appError.message
    });
  }
}

function usesFirstSeenIds(source: DailyCandidateSourceValue) {
  return source === "biorxiv" || source === "journal";
}

function withRunId(error: unknown, runId: string) {
  if (error instanceof AppError) {
    error.details = { ...error.details, runId };
    return error;
  }
  return new AppError(
    "INGESTION_RUN_FAILED",
    error instanceof Error ? error.message : "Unknown ingestion error",
    500,
    { runId }
  );
}

function isCandidateInRange(
  candidate: Pick<DailySourceAdapterCandidate, "publishedAt" | "indexedAt">,
  start: Date,
  end: Date
) {
  const reference = candidate.publishedAt ?? candidate.indexedAt;
  return Boolean(reference && reference >= start && reference <= end);
}

function minDate(left: Date, right: Date) {
  return left <= right ? left : right;
}

function startOfUtcDate(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function makeFetchResult(
  candidates: DailySourceAdapterCandidate[],
  fetched: DailySourceAdapterCandidate[],
  windowStart: Date,
  windowEnd: Date,
  filterMode: "indexed_day" | "watermark" | "first_seen"
) {
  return {
    candidates,
    fetchedCount: fetched.length,
    fetchedExternalIds: fetched.map((candidate) => candidate.externalId),
    windowStart,
    windowEnd,
    filterMode
  };
}

export function buildDailyRunRequestKey(
  runDate: Date,
  sources: DailyCandidateSourceValue[],
  aggregated = false
): string {
  const day = runDate.toISOString().slice(0, 10);
  const sourceKey = [...uniqueSources(sources)].sort().join("+");
  return `daily:v1:${aggregated ? "aggregated:" : ""}${sourceKey}:${day}`;
}

function uniqueSources(sources: readonly DailyCandidateSourceValue[]): DailyCandidateSourceValue[] {
  return [...new Set(sources)];
}

function summarizePersistedSources(
  requestedSources: DailyCandidateSourceValue[],
  candidates: Array<{ source: DailyCandidateSourceValue }>
): AggregatedSourceIngestionSummary[] {
  return requestedSources.map((source) => ({
    source,
    status: "success",
    candidatesCount: candidates.filter((candidate) => candidate.source === source).length
  }));
}

function errorToMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown source ingestion error";
}

function dedupeByExternalId(candidates: DailySourceAdapterCandidate[]): DailySourceAdapterCandidate[] {
  const seen = new Set<string>();
  const deduped: DailySourceAdapterCandidate[] = [];

  for (const candidate of candidates) {
    if (seen.has(candidate.externalId)) {
      continue;
    }

    seen.add(candidate.externalId);
    deduped.push(candidate);
  }

  return deduped;
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

export type DailyCandidateSourceValue = "biorxiv" | "arxiv" | "pubmed" | "journal";
export type DailyIngestionRunSourceValue = DailyCandidateSourceValue | "aggregated";
export type DailyIngestionRunStatusValue = "running" | "success" | "failed";
export type DailyRunDisposition =
  | "acquired"
  | "retry"
  | "already_running"
  | "already_succeeded";

export type DailySourceAdapterCandidate = {
  externalId: string;
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
  authors: string[];
  sourcePayload: Record<string, unknown>;
};

export type DailyCandidateRecord = {
  id: string;
  runId: string;
  source: DailyCandidateSourceValue;
  externalId: string;
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
  authors: string[];
  sourcePayload: Record<string, unknown>;
};

export type DailyIngestionRunSummary = {
  id: string;
  requestKey?: string;
  attempt: number;
  source: DailyIngestionRunSourceValue;
  status: DailyIngestionRunStatusValue;
  runDate: string;
  startedAt: string;
  finishedAt?: string;
  candidatesCount: number;
  errorMessage?: string;
};

export type AggregatedSourceIngestionSummary = {
  source: DailyCandidateSourceValue;
  status?: "success" | "failed";
  candidatesCount: number;
  fetchedCount?: number;
  filteredCount?: number;
  windowStart?: string;
  windowEnd?: string;
  filterMode?: "indexed_day" | "watermark" | "first_seen";
  errorMessage?: string;
};

export type JournalFeedSourceRecord = {
  id: string;
  journalName: string;
  feedUrl: string;
  isActive: boolean;
};

export type UtcDayWindow = {
  runDate: Date;
  dayStart: Date;
  dayEnd: Date;
  sourceStart?: Date;
  sourceEnd?: Date;
};

export interface DailySourceAdapter {
  readonly source: DailyCandidateSourceValue;
  fetchCandidatesForDay(input: UtcDayWindow): Promise<DailySourceAdapterCandidate[]>;
}

export interface JournalFeedRepository {
  listActiveFeeds(): Promise<JournalFeedSourceRecord[]>;
}

export interface DailyIngestionRepository {
  acquireRun(input: {
    source: DailyIngestionRunSourceValue;
    runDate: Date;
    requestKey: string;
  }): Promise<{ run: DailyIngestionRunSummary; disposition: DailyRunDisposition }>;
  finalizeRunSuccess(input: {
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
  }): Promise<DailyIngestionRunSummary>;
  markRunFailed(input: { runId: string; errorMessage: string }): Promise<DailyIngestionRunSummary>;
  getLatestRun(input?: { source?: DailyIngestionRunSourceValue }): Promise<DailyIngestionRunSummary | null>;
  getRun(runId: string): Promise<DailyIngestionRunSummary | null>;
  listCandidatesByRun(runId: string): Promise<DailyCandidateRecord[]>;
  getSourceCursor(source: DailyCandidateSourceValue): Promise<Date | undefined>;
  listSeenExternalIds(source: DailyCandidateSourceValue, externalIds: string[]): Promise<Set<string>>;
}

export interface DailyIngestionService {
  runSourceIngestion(input: {
    source: DailyCandidateSourceValue;
    runDate?: string;
  }): Promise<{
    run: DailyIngestionRunSummary;
    candidates: DailyCandidateRecord[];
    disposition: DailyRunDisposition;
  }>;
  runAggregatedIngestion(input?: {
    runDate?: string;
    sources?: DailyCandidateSourceValue[];
  }): Promise<{
    run: DailyIngestionRunSummary;
    candidates: DailyCandidateRecord[];
    sourceSummaries: AggregatedSourceIngestionSummary[];
    disposition: DailyRunDisposition;
  }>;
  getLatestRun(input?: { source?: DailyIngestionRunSourceValue }): Promise<DailyIngestionRunSummary | null>;
  getRun(runId: string): Promise<DailyIngestionRunSummary | null>;
}

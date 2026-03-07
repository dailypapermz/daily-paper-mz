export type DailyCandidateSourceValue = "biorxiv" | "arxiv" | "pubmed" | "journal";
export type DailyIngestionRunSourceValue = DailyCandidateSourceValue | "aggregated";
export type DailyIngestionRunStatusValue = "running" | "success" | "failed";

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
  candidatesCount: number;
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
};

export interface DailySourceAdapter {
  readonly source: DailyCandidateSourceValue;
  fetchCandidatesForDay(input: UtcDayWindow): Promise<DailySourceAdapterCandidate[]>;
}

export interface JournalFeedRepository {
  listActiveFeeds(): Promise<JournalFeedSourceRecord[]>;
}

export interface DailyIngestionRepository {
  createRun(input: { source: DailyIngestionRunSourceValue; runDate: Date }): Promise<{ id: string }>;
  saveCandidates(input: {
    runId: string;
    entries: Array<{
      source: DailyCandidateSourceValue;
      candidate: DailySourceAdapterCandidate;
    }>;
  }): Promise<number>;
  markRunSucceeded(input: { runId: string; candidatesCount: number }): Promise<DailyIngestionRunSummary>;
  markRunFailed(input: { runId: string; errorMessage: string }): Promise<DailyIngestionRunSummary>;
  getLatestRun(input?: { source?: DailyIngestionRunSourceValue }): Promise<DailyIngestionRunSummary | null>;
  listCandidatesByRun(runId: string): Promise<DailyCandidateRecord[]>;
}

export interface DailyIngestionService {
  runSourceIngestion(input: {
    source: DailyCandidateSourceValue;
    runDate?: string;
  }): Promise<{ run: DailyIngestionRunSummary; candidates: DailyCandidateRecord[] }>;
  runAggregatedIngestion(input?: {
    runDate?: string;
    sources?: DailyCandidateSourceValue[];
  }): Promise<{
    run: DailyIngestionRunSummary;
    candidates: DailyCandidateRecord[];
    sourceSummaries: AggregatedSourceIngestionSummary[];
  }>;
  getLatestRun(input?: { source?: DailyIngestionRunSourceValue }): Promise<DailyIngestionRunSummary | null>;
}

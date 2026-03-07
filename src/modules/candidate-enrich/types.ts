export type JournalEnrichmentStatusValue = "enriched" | "not_found" | "failed";

export type JournalMetricRecord = {
  quartile?: string;
  impactScore?: number;
  rawPayload?: Record<string, unknown>;
  normalized?: Record<string, unknown>;
};

export type CandidateJournalRecord = {
  candidateId: string;
  journalName?: string;
};

export type JournalEnrichmentResult = {
  runId: string;
  provider: string;
  processed: number;
  enriched: number;
  notFound: number;
  failed: number;
};

export interface JournalEnrichmentProvider {
  name: string;
  fetchJournalMetric(journalName: string): Promise<JournalMetricRecord | null>;
}

export interface JournalEnrichmentRepository {
  listCandidatesForRun(runId: string): Promise<CandidateJournalRecord[]>;
  getFreshCache(input: {
    provider: string;
    journalName: string;
    now?: Date;
  }): Promise<JournalMetricRecord | null>;
  upsertCache(input: {
    provider: string;
    journalName: string;
    metric: JournalMetricRecord;
    expiresAt: Date;
  }): Promise<void>;
  saveCandidateEnrichment(input: {
    candidateId: string;
    provider: string;
    status: JournalEnrichmentStatusValue;
    metric?: JournalMetricRecord;
    errorMessage?: string;
  }): Promise<void>;
}

export interface JournalEnrichmentService {
  enrichRun(runId: string): Promise<JournalEnrichmentResult>;
}

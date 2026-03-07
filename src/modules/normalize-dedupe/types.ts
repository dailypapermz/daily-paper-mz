import type { DailyCandidateSourceValue } from "../ingestion/types";

export type CandidateMergeReasonValue = "doi" | "title_url" | "title" | "source_external_id";

export type RawDailyCandidateRecord = {
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

export type CanonicalCandidateProvenanceRecord = {
  sourceCandidateId: string;
  source: DailyCandidateSourceValue;
  externalId: string;
  mergeReason: CandidateMergeReasonValue;
};

export type CanonicalDailyCandidateRecord = {
  id: string;
  runId: string;
  canonicalKey: string;
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
  mergedSourceCount: number;
  sourceProvenance: CanonicalCandidateProvenanceRecord[];
};

export type CanonicalDailyCandidateCreateInput = Omit<CanonicalDailyCandidateRecord, "id">;

export type CandidateDedupRunResult = {
  runId: string;
  inputCount: number;
  canonicalCount: number;
  mergedCount: number;
  canonicalCandidates: CanonicalDailyCandidateRecord[];
};

export interface CandidateNormalizationRepository {
  listRunCandidates(runId: string): Promise<RawDailyCandidateRecord[]>;
  replaceCanonicalCandidates(input: {
    runId: string;
    canonicalCandidates: CanonicalDailyCandidateCreateInput[];
  }): Promise<void>;
  listCanonicalCandidates(runId: string): Promise<CanonicalDailyCandidateRecord[]>;
}

export interface CandidateNormalizationService {
  runForIngestionRun(runId: string): Promise<CandidateDedupRunResult>;
  getCanonicalCandidates(runId: string): Promise<CanonicalDailyCandidateRecord[]>;
}

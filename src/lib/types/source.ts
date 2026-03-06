export type SourceName = "biorxiv" | "arxiv" | "pubmed" | "journal";

export type SourceCandidate = {
  source: SourceName;
  externalId: string;
  title: string;
  abstract?: string;
  publishedAt?: string;
  url?: string;
  authors?: string[];
  metadata?: Record<string, unknown>;
};

export type SourceFetchContext = {
  runDate: string;
  scopes?: string[];
};

export interface SourceAdapter {
  readonly source: SourceName;
  fetchTodayCandidates(context: SourceFetchContext): Promise<SourceCandidate[]>;
}

export type ResearchTypeCategoryValue = "method" | "biology" | "resource" | "benchmark";
export type StructuredTagParseStatusValue =
  | "parsed"
  | "partial"
  | "invalid_category"
  | "unparsed";
export type TagProvenanceValue = "original" | "generated";
export type TagGenerationJobStatusValue = "running" | "success" | "partial" | "failed";
export type TagGenerationItemStatusValue = "generated" | "skipped_unavailable" | "failed";

export type ParsedTagSemantics = {
  attentionLevel: number;
  rawStarTags: string[];
  contentTags: string[];
  otherTags: string[];
};

export type ParsedStructuredContentTag = {
  rawTag: string;
  tagType: "content_recall" | "research_type";
  parseStatus: StructuredTagParseStatusValue;
  provenance?: TagProvenanceValue;
  generationJobId?: string;
  contentRecallLabel?: string;
  rawCategoryToken?: string;
  researchCategory?: ResearchTypeCategoryValue;
  primaryKeyword?: string;
  secondaryKeyword?: string;
};

export type TagParseItem = {
  itemId: string;
  zoteroItemKey: string;
  rawTags: string[];
};

export type TagParseResult = {
  itemsProcessed: number;
  signalsUpdated: number;
  contentTagsStored: number;
  contentRecallTagsStored: number;
  researchTypeTagsStored: number;
  invalidResearchTypeTags: number;
};

export type TagParseSummary = {
  itemsWithSignals: number;
  contentTags: number;
  maxAttentionLevel: number;
  contentRecallTags: number;
  researchTypeTags: number;
  invalidResearchTypeTags: number;
};

export type TagBackfillCandidateItem = {
  itemId: string;
  zoteroItemKey: string;
  title?: string;
  abstractNote?: string;
};

export type GeneratedStructuredTags = {
  contentRecallLabel: string;
  researchCategory: ResearchTypeCategoryValue;
  primaryKeyword: string;
  secondaryKeyword?: string;
};

export type TagGenerationJobSummary = {
  id: string;
  status: TagGenerationJobStatusValue;
  provider: string;
  startedAt: string;
  finishedAt?: string;
  selectedItemsCount: number;
  missingItemsCount: number;
  generatedItemsCount: number;
  fallbackItemsCount: number;
  errorMessage?: string;
};

export type TagBackfillRunResult = {
  job: TagGenerationJobSummary;
};

export interface TagSemanticsRepository {
  listItemsForParsing(input?: { zoteroItemKeys?: string[] }): Promise<TagParseItem[]>;
  upsertTagSignal(input: {
    itemId: string;
    attentionLevel: number;
    rawStarTags: string[];
    otherTags: string[];
  }): Promise<void>;
  replaceContentTags(input: { itemId: string; contentTags: string[] }): Promise<void>;
  replaceStructuredTags(input: {
    itemId: string;
    tags: ParsedStructuredContentTag[];
  }): Promise<void>;
  getSummary(): Promise<TagParseSummary>;
}

export interface TagSemanticsService {
  parseAndPersist(input?: { zoteroItemKeys?: string[] }): Promise<TagParseResult>;
  getSummary(): Promise<TagParseSummary>;
}

export interface TagGenerationProvider {
  name: string;
  generateStructuredTags(input: {
    zoteroItemKey: string;
    title?: string;
    abstractNote?: string;
  }): Promise<GeneratedStructuredTags>;
}

export interface TagGenerationRepository {
  listSelectedItemsMissingContentTags(input?: { limit?: number }): Promise<TagBackfillCandidateItem[]>;
  createGenerationJob(input: { provider: string }): Promise<{ id: string }>;
  appendGenerationJobItem(input: {
    jobId: string;
    itemId: string;
    status: TagGenerationItemStatusValue;
    usedFallback: boolean;
    errorMessage?: string;
  }): Promise<void>;
  replaceGeneratedStructuredTags(input: {
    itemId: string;
    jobId: string;
    generated: GeneratedStructuredTags;
  }): Promise<void>;
  markGenerationJobFinished(input: {
    jobId: string;
    status: TagGenerationJobStatusValue;
    selectedItemsCount: number;
    missingItemsCount: number;
    generatedItemsCount: number;
    fallbackItemsCount: number;
    errorMessage?: string;
  }): Promise<TagGenerationJobSummary>;
  getLatestGenerationJob(): Promise<TagGenerationJobSummary | null>;
}

export interface TagBackfillService {
  runBackfill(input?: { limit?: number }): Promise<TagBackfillRunResult>;
  getLatestJob(): Promise<TagGenerationJobSummary | null>;
}

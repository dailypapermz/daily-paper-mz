export type ResearchTypeCategoryValue = "method" | "biology" | "resource" | "benchmark";
export type StructuredTagParseStatusValue =
  | "parsed"
  | "partial"
  | "invalid_category"
  | "unparsed";

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

export type ParsedTagSemantics = {
  attentionLevel: number;
  rawStarTags: string[];
  contentTags: string[];
  otherTags: string[];
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
};

export type TagParseSummary = {
  itemsWithSignals: number;
  contentTags: number;
  maxAttentionLevel: number;
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
  getSummary(): Promise<TagParseSummary>;
}

export interface TagSemanticsService {
  parseAndPersist(input?: { zoteroItemKeys?: string[] }): Promise<TagParseResult>;
  getSummary(): Promise<TagParseSummary>;
}

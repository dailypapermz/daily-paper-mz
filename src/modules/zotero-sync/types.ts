import type { ZoteroSyncRun } from "../../generated/prisma";

export type ZoteroSyncModeValue = "full" | "incremental";
export type ZoteroSyncStatusValue = "running" | "success" | "failed";

export type ZoteroApiTag = {
  tag: string;
  type?: number;
};

export type ZoteroApiItemData = {
  title?: string;
  abstractNote?: string;
  dateAdded?: string;
  tags?: ZoteroApiTag[];
  collections?: string[];
  [key: string]: unknown;
};

export type ZoteroApiItem = {
  key: string;
  version?: number;
  data: ZoteroApiItemData;
};

export type ZoteroApiCollectionData = {
  name?: string;
  parentCollection?: string;
  [key: string]: unknown;
};

export type ZoteroApiCollection = {
  key: string;
  version?: number;
  data: ZoteroApiCollectionData;
};

export type ZoteroFetchOptions = {
  sinceVersion?: number;
};

export type ZoteroFetchResult<T> = {
  records: T[];
  libraryVersion: number | null;
};

export type RawZoteroItemRecord = {
  zoteroItemKey: string;
  zoteroVersion?: number;
  title?: string;
  abstractNote?: string;
  dateAdded?: Date;
  rawTags: string[];
  rawCollections: string[];
  sourcePayload: Record<string, unknown>;
};

export type RawZoteroCollectionRecord = {
  zoteroCollectionKey: string;
  zoteroVersion?: number;
  name: string;
  parentCollectionKey?: string;
  path?: string;
  sourcePayload: Record<string, unknown>;
};

export type SyncRunCounts = {
  itemsCount: number;
  collectionsCount: number;
  mappingsCount: number;
};

export type SyncRunSummary = {
  id: string;
  mode: ZoteroSyncModeValue;
  status: ZoteroSyncStatusValue;
  startedAt: string;
  finishedAt?: string;
  sinceVersion?: number;
  libraryVersion?: number;
  counts: SyncRunCounts;
  errorMessage?: string;
};

export interface ZoteroClient {
  fetchItems(options?: ZoteroFetchOptions): Promise<ZoteroFetchResult<ZoteroApiItem>>;
  fetchCollections(
    options?: ZoteroFetchOptions
  ): Promise<ZoteroFetchResult<ZoteroApiCollection>>;
}

export interface ZoteroSyncRepository {
  createRun(input: { mode: ZoteroSyncModeValue; sinceVersion?: number }): Promise<ZoteroSyncRun>;
  markRunSucceeded(
    runId: string,
    payload: SyncRunCounts & { libraryVersion?: number | null }
  ): Promise<ZoteroSyncRun>;
  markRunFailed(runId: string, errorMessage: string): Promise<ZoteroSyncRun>;
  getLatestRun(): Promise<ZoteroSyncRun | null>;
  getLatestSuccessfulRun(): Promise<ZoteroSyncRun | null>;
  upsertRawItems(
    items: RawZoteroItemRecord[],
    context: { syncedAt: Date; libraryVersion?: number | null }
  ): Promise<number>;
  upsertCollections(
    collections: RawZoteroCollectionRecord[],
    context: { syncedAt: Date; libraryVersion?: number | null }
  ): Promise<number>;
  replaceItemCollectionMappings(
    mappingByItem: Array<{ zoteroItemKey: string; zoteroCollectionKeys: string[] }>
  ): Promise<number>;
}

export interface ZoteroSyncService {
  runSync(requestedMode?: ZoteroSyncModeValue): Promise<SyncRunSummary>;
  getLatestRun(): Promise<SyncRunSummary | null>;
}

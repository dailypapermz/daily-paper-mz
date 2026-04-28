import { AppError } from "../../lib/errors";
import { logger } from "../../lib/logging";
import { toIsoDate } from "../../lib/utils";
import { fromDbMode, fromDbStatus } from "../../db/repositories";
import type {
  RawZoteroCollectionRecord,
  RawZoteroItemRecord,
  SyncRunSummary,
  ZoteroApiCollection,
  ZoteroApiItem,
  ZoteroClient,
  ZoteroSyncModeValue,
  ZoteroSyncRepository,
  ZoteroSyncService
} from "./types";

export class DefaultZoteroSyncService implements ZoteroSyncService {
  constructor(
    private readonly client: ZoteroClient,
    private readonly repository: ZoteroSyncRepository
  ) {}

  async runSync(requestedMode?: ZoteroSyncModeValue): Promise<SyncRunSummary> {
    const latestSuccess = await this.repository.getLatestSuccessfulRun();
    const mode = this.resolveMode(requestedMode, latestSuccess?.libraryVersion ?? null);
    const sinceVersion = mode === "incremental" ? latestSuccess?.libraryVersion ?? undefined : undefined;

    const run = await this.repository.createRun({ mode, sinceVersion });

    try {
      const [itemsResult, collectionsResult] = await Promise.all([
        this.client.fetchItems({ sinceVersion }),
        this.client.fetchCollections({ sinceVersion })
      ]);

      const syncedAt = new Date();
      const finalLibraryVersion = selectLibraryVersion(
        itemsResult.libraryVersion,
        collectionsResult.libraryVersion,
        sinceVersion
      );

      const rawCollections = collectionsResult.records.map(mapCollectionRecord);
      const rawItems = itemsResult.records.map(mapItemRecord);

      const collectionsCount = await this.repository.upsertCollections(rawCollections, {
        syncedAt,
        libraryVersion: finalLibraryVersion
      });
      const itemsCount = await this.repository.upsertRawItems(rawItems, {
        syncedAt,
        libraryVersion: finalLibraryVersion
      });
      const mappingsCount = await this.repository.replaceItemCollectionMappings(
        rawItems.map((item) => ({
          zoteroItemKey: item.zoteroItemKey,
          zoteroCollectionKeys: item.rawCollections
        }))
      );

      const successRun = await this.repository.markRunSucceeded(run.id, {
        itemsCount,
        collectionsCount,
        mappingsCount,
        libraryVersion: finalLibraryVersion
      });

      return mapRunSummary(successRun);
    } catch (error) {
      const appError =
        error instanceof AppError
          ? error
          : new AppError(
              "ZOTERO_SYNC_FAILED",
              error instanceof Error ? error.message : "Unknown sync error"
            );

      await this.repository.markRunFailed(run.id, appError.message);

      logger.error("Zotero sync failed", {
        runId: run.id,
        mode,
        error: appError.message
      });

      throw appError;
    }
  }

  async getLatestRun(): Promise<SyncRunSummary | null> {
    const run = await this.repository.getLatestRun();
    if (!run) {
      return null;
    }
    return mapRunSummary(run);
  }

  private resolveMode(
    requestedMode: ZoteroSyncModeValue | undefined,
    latestLibraryVersion: number | null
  ): ZoteroSyncModeValue {
    if (requestedMode === "full") {
      return "full";
    }

    if (requestedMode === "incremental") {
      return latestLibraryVersion ? "incremental" : "full";
    }

    return latestLibraryVersion ? "incremental" : "full";
  }
}

function mapItemRecord(item: ZoteroApiItem): RawZoteroItemRecord {
  return {
    zoteroItemKey: item.key,
    zoteroVersion: item.version,
    title: typeof item.data.title === "string" ? item.data.title : undefined,
    abstractNote: typeof item.data.abstractNote === "string" ? item.data.abstractNote : undefined,
    dateAdded: parseDate(item.data.dateAdded),
    rawTags: extractRawTags(item),
    rawCollections: extractRawCollectionKeys(item),
    sourcePayload: item as unknown as Record<string, unknown>
  };
}

function mapCollectionRecord(collection: ZoteroApiCollection): RawZoteroCollectionRecord {
  return {
    zoteroCollectionKey: collection.key,
    zoteroVersion: collection.version,
    name: collection.data.name ?? collection.key,
    parentCollectionKey:
      typeof collection.data.parentCollection === "string"
        ? collection.data.parentCollection
        : undefined,
    path: undefined,
    sourcePayload: collection as unknown as Record<string, unknown>
  };
}

function extractRawTags(item: ZoteroApiItem): string[] {
  if (!Array.isArray(item.data.tags)) {
    return [];
  }

  return item.data.tags
    .map((entry) => entry?.tag)
    .filter((tag): tag is string => typeof tag === "string" && tag.trim() !== "")
    .map((tag) => tag.trim());
}

function extractRawCollectionKeys(item: ZoteroApiItem): string[] {
  if (!Array.isArray(item.data.collections)) {
    return [];
  }

  return item.data.collections.filter(
    (collectionKey): collectionKey is string =>
      typeof collectionKey === "string" && collectionKey.trim() !== ""
  );
}

function parseDate(value: unknown): Date | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function selectLibraryVersion(
  itemVersion: number | null,
  collectionVersion: number | null,
  fallbackVersion?: number
): number | null {
  const all = [itemVersion, collectionVersion, fallbackVersion].filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value)
  );

  if (all.length === 0) {
    return null;
  }

  return Math.max(...all);
}

function mapRunSummary(run: {
  id: string;
  mode: "FULL" | "INCREMENTAL";
  status: "RUNNING" | "SUCCESS" | "FAILED";
  startedAt: Date;
  finishedAt: Date | null;
  sinceVersion: number | null;
  libraryVersion: number | null;
  itemsCount: number;
  collectionsCount: number;
  mappingsCount: number;
  errorMessage: string | null;
}): SyncRunSummary {
  return {
    id: run.id,
    mode: fromDbMode(run.mode),
    status: fromDbStatus(run.status),
    startedAt: toIsoDate(run.startedAt),
    finishedAt: run.finishedAt ? toIsoDate(run.finishedAt) : undefined,
    sinceVersion: run.sinceVersion ?? undefined,
    libraryVersion: run.libraryVersion ?? undefined,
    counts: {
      itemsCount: run.itemsCount,
      collectionsCount: run.collectionsCount,
      mappingsCount: run.mappingsCount
    },
    errorMessage: run.errorMessage ?? undefined
  };
}

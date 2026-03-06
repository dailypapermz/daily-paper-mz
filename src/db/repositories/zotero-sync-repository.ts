import type {
  Prisma,
  PrismaClient,
  ZoteroCollection,
  ZoteroItemRaw,
  ZoteroSyncMode,
  ZoteroSyncRun,
  ZoteroSyncStatus
} from "../../generated/prisma";

import type {
  RawZoteroCollectionRecord,
  RawZoteroItemRecord,
  SyncRunCounts,
  ZoteroSyncRepository
} from "../../modules/zotero-sync/types";

export class PrismaZoteroSyncRepository implements ZoteroSyncRepository {
  constructor(private readonly db: PrismaClient) {}

  async createRun(input: {
    mode: "full" | "incremental";
    sinceVersion?: number;
  }): Promise<ZoteroSyncRun> {
    return this.db.zoteroSyncRun.create({
      data: {
        mode: toDbMode(input.mode),
        status: "RUNNING",
        sinceVersion: input.sinceVersion ?? null
      }
    });
  }

  async markRunSucceeded(
    runId: string,
    payload: SyncRunCounts & { libraryVersion?: number | null }
  ): Promise<ZoteroSyncRun> {
    return this.db.zoteroSyncRun.update({
      where: { id: runId },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        libraryVersion: payload.libraryVersion ?? null,
        itemsCount: payload.itemsCount,
        collectionsCount: payload.collectionsCount,
        mappingsCount: payload.mappingsCount,
        errorMessage: null
      }
    });
  }

  async markRunFailed(runId: string, errorMessage: string): Promise<ZoteroSyncRun> {
    return this.db.zoteroSyncRun.update({
      where: { id: runId },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        errorMessage
      }
    });
  }

  async getLatestRun(): Promise<ZoteroSyncRun | null> {
    return this.db.zoteroSyncRun.findFirst({
      orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }]
    });
  }

  async getLatestSuccessfulRun(): Promise<ZoteroSyncRun | null> {
    return this.db.zoteroSyncRun.findFirst({
      where: { status: "SUCCESS" },
      orderBy: [{ finishedAt: "desc" }, { startedAt: "desc" }]
    });
  }

  async upsertRawItems(
    items: RawZoteroItemRecord[],
    context: { syncedAt: Date; libraryVersion?: number | null }
  ): Promise<number> {
    if (items.length === 0) {
      return 0;
    }

    for (const item of items) {
      const data: Prisma.ZoteroItemRawUncheckedCreateInput = {
        zoteroItemKey: item.zoteroItemKey,
        zoteroVersion: item.zoteroVersion,
        title: item.title,
        abstractNote: item.abstractNote,
        dateAdded: item.dateAdded,
        rawTagsJson: item.rawTags,
        rawCollectionsJson: item.rawCollections,
        sourcePayloadJson: toJsonValue(item.sourcePayload),
        syncedAt: context.syncedAt,
        libraryVersion: context.libraryVersion ?? null
      };

      await this.db.zoteroItemRaw.upsert({
        where: { zoteroItemKey: item.zoteroItemKey },
        create: data,
        update: data
      });
    }

    return items.length;
  }

  async upsertCollections(
    collections: RawZoteroCollectionRecord[],
    context: { syncedAt: Date; libraryVersion?: number | null }
  ): Promise<number> {
    if (collections.length === 0) {
      return 0;
    }

    for (const collection of collections) {
      const data: Prisma.ZoteroCollectionUncheckedCreateInput = {
        zoteroCollectionKey: collection.zoteroCollectionKey,
        zoteroVersion: collection.zoteroVersion,
        name: collection.name,
        parentCollectionKey: collection.parentCollectionKey,
        path: collection.path,
        sourcePayloadJson: toJsonValue(collection.sourcePayload),
        syncedAt: context.syncedAt,
        libraryVersion: context.libraryVersion ?? null
      };

      await this.db.zoteroCollection.upsert({
        where: { zoteroCollectionKey: collection.zoteroCollectionKey },
        create: data,
        update: data
      });
    }

    return collections.length;
  }

  async replaceItemCollectionMappings(
    mappingByItem: Array<{ zoteroItemKey: string; zoteroCollectionKeys: string[] }>
  ): Promise<number> {
    if (mappingByItem.length === 0) {
      return 0;
    }

    const itemKeys = mappingByItem.map((entry) => entry.zoteroItemKey);
    const collectionKeys = Array.from(
      new Set(mappingByItem.flatMap((entry) => entry.zoteroCollectionKeys))
    );

    const [items, collections] = await Promise.all([
      this.db.zoteroItemRaw.findMany({
        where: { zoteroItemKey: { in: itemKeys } },
        select: { id: true, zoteroItemKey: true }
      }),
      this.db.zoteroCollection.findMany({
        where: { zoteroCollectionKey: { in: collectionKeys } },
        select: { id: true, zoteroCollectionKey: true }
      })
    ]);

    const itemIdByKey = new Map(items.map((item) => [item.zoteroItemKey, item.id]));
    const collectionIdByKey = new Map(
      collections.map((collection) => [collection.zoteroCollectionKey, collection.id])
    );

    let total = 0;

    await this.db.$transaction(async (tx) => {
      for (const entry of mappingByItem) {
        const itemId = itemIdByKey.get(entry.zoteroItemKey);
        if (!itemId) {
          continue;
        }

        await tx.zoteroItemCollection.deleteMany({ where: { itemId } });

        const rows = entry.zoteroCollectionKeys
          .map((collectionKey) => collectionIdByKey.get(collectionKey))
          .filter((value): value is string => Boolean(value))
          .map((collectionId) => ({ itemId, collectionId }));

        if (rows.length > 0) {
          await tx.zoteroItemCollection.createMany({
            data: rows
          });
          total += rows.length;
        }
      }
    });

    return total;
  }
}

function toDbMode(mode: "full" | "incremental"): ZoteroSyncMode {
  return mode === "full" ? "FULL" : "INCREMENTAL";
}

export function fromDbMode(mode: ZoteroSyncMode): "full" | "incremental" {
  return mode === "FULL" ? "full" : "incremental";
}

export function fromDbStatus(status: ZoteroSyncStatus): "running" | "success" | "failed" {
  if (status === "RUNNING") {
    return "running";
  }
  if (status === "SUCCESS") {
    return "success";
  }
  return "failed";
}

export type { ZoteroCollection, ZoteroItemRaw, ZoteroSyncRun };

function toJsonValue(value: Record<string, unknown>): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}


import type { PrismaClient } from "../../generated/prisma";

import {
  fromDbCollectionPriority,
  toDbCollectionPriority,
  type CollectionPriorityRepository
} from "../../modules/collections/types";

export class PrismaCollectionPriorityRepository implements CollectionPriorityRepository {
  constructor(private readonly db: PrismaClient) {}

  async getCollections() {
    const collections = await this.db.zoteroCollection.findMany({
      select: {
        id: true,
        zoteroCollectionKey: true,
        name: true,
        parentCollectionKey: true,
        path: true
      }
    });

    return collections.map((collection) => ({
      collectionId: collection.id,
      zoteroCollectionKey: collection.zoteroCollectionKey,
      name: collection.name,
      parentCollectionKey: collection.parentCollectionKey ?? undefined,
      path: collection.path ?? undefined
    }));
  }

  async findCollectionByKey(zoteroCollectionKey: string) {
    const collection = await this.db.zoteroCollection.findUnique({
      where: { zoteroCollectionKey },
      select: {
        id: true,
        zoteroCollectionKey: true,
        name: true,
        parentCollectionKey: true,
        path: true
      }
    });

    if (!collection) {
      return null;
    }

    return {
      collectionId: collection.id,
      zoteroCollectionKey: collection.zoteroCollectionKey,
      name: collection.name,
      parentCollectionKey: collection.parentCollectionKey ?? undefined,
      path: collection.path ?? undefined
    };
  }

  async getExplicitSelections() {
    const selections = await this.db.zoteroCollectionPrioritySelection.findMany({
      select: {
        collectionId: true,
        priority: true,
        collection: {
          select: {
            zoteroCollectionKey: true
          }
        }
      }
    });

    return selections.map((selection) => ({
      collectionId: selection.collectionId,
      zoteroCollectionKey: selection.collection.zoteroCollectionKey,
      priority: fromDbCollectionPriority(selection.priority)
    }));
  }

  async upsertExplicitSelection(input: { collectionId: string; priority: "primary" | "secondary" | "excluded" }) {
    await this.db.zoteroCollectionPrioritySelection.upsert({
      where: { collectionId: input.collectionId },
      create: {
        collectionId: input.collectionId,
        priority: toDbCollectionPriority(input.priority)
      },
      update: {
        priority: toDbCollectionPriority(input.priority),
        selectedAt: new Date()
      }
    });
  }

  async deleteExplicitSelection(collectionId: string) {
    await this.db.zoteroCollectionPrioritySelection.deleteMany({
      where: { collectionId }
    });
  }

  async replaceEffectivePriorities(
    entries: Array<{
      collectionId: string;
      priority: "primary" | "secondary" | "excluded";
      isExplicitOverride: boolean;
    }>
  ) {
    await this.db.$transaction(async (tx) => {
      await tx.zoteroCollectionEffectivePriority.deleteMany({});

      if (entries.length > 0) {
        await tx.zoteroCollectionEffectivePriority.createMany({
          data: entries.map((entry) => ({
            collectionId: entry.collectionId,
            priority: toDbCollectionPriority(entry.priority),
            isExplicitOverride: entry.isExplicitOverride,
            computedAt: new Date()
          }))
        });
      }
    });
  }

  async getEffectivePriorities() {
    const rows = await this.db.zoteroCollectionEffectivePriority.findMany({
      select: {
        collectionId: true,
        priority: true,
        isExplicitOverride: true,
        collection: {
          select: {
            zoteroCollectionKey: true
          }
        }
      }
    });

    return rows.map((row) => ({
      collectionId: row.collectionId,
      zoteroCollectionKey: row.collection.zoteroCollectionKey,
      priority: fromDbCollectionPriority(row.priority),
      isExplicitOverride: row.isExplicitOverride
    }));
  }
}

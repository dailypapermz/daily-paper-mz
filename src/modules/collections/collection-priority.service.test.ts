import { describe, expect, it } from "vitest";

import { AppError } from "../../lib/errors";
import { DefaultCollectionPriorityService } from "./collection-priority.service";
import type {
  CollectionPriorityRepository,
  CollectionPriorityValue,
  CollectionRecord,
  EffectivePriorityRecord,
  ExplicitPriorityRecord
} from "./types";

class FakeCollectionPriorityRepository implements CollectionPriorityRepository {
  private readonly collections: CollectionRecord[];
  private explicit = new Map<string, CollectionPriorityValue>();
  private effective = new Map<
    string,
    { priority: CollectionPriorityValue; isExplicitOverride: boolean }
  >();

  constructor(collections: CollectionRecord[]) {
    this.collections = collections;
  }

  async getCollections() {
    return this.collections;
  }

  async findCollectionByKey(zoteroCollectionKey: string) {
    return this.collections.find((collection) => collection.zoteroCollectionKey === zoteroCollectionKey) ?? null;
  }

  async getExplicitSelections(): Promise<ExplicitPriorityRecord[]> {
    return this.collections
      .filter((collection) => this.explicit.has(collection.collectionId))
      .map((collection) => ({
        collectionId: collection.collectionId,
        zoteroCollectionKey: collection.zoteroCollectionKey,
        priority: this.explicit.get(collection.collectionId) as CollectionPriorityValue
      }));
  }

  async upsertExplicitSelection(input: {
    collectionId: string;
    priority: CollectionPriorityValue;
  }): Promise<void> {
    this.explicit.set(input.collectionId, input.priority);
  }

  async deleteExplicitSelection(collectionId: string): Promise<void> {
    this.explicit.delete(collectionId);
  }

  async replaceEffectivePriorities(
    entries: Array<{
      collectionId: string;
      priority: CollectionPriorityValue;
      isExplicitOverride: boolean;
    }>
  ): Promise<void> {
    this.effective = new Map(
      entries.map((entry) => [
        entry.collectionId,
        {
          priority: entry.priority,
          isExplicitOverride: entry.isExplicitOverride
        }
      ])
    );
  }

  async getEffectivePriorities(): Promise<EffectivePriorityRecord[]> {
    return this.collections
      .filter((collection) => this.effective.has(collection.collectionId))
      .map((collection) => {
        const effective = this.effective.get(collection.collectionId) as {
          priority: CollectionPriorityValue;
          isExplicitOverride: boolean;
        };

        return {
          collectionId: collection.collectionId,
          zoteroCollectionKey: collection.zoteroCollectionKey,
          priority: effective.priority,
          isExplicitOverride: effective.isExplicitOverride
        };
      });
  }
}

describe("DefaultCollectionPriorityService", () => {
  const collections: CollectionRecord[] = [
    {
      collectionId: "root",
      zoteroCollectionKey: "ROOT",
      name: "Root"
    },
    {
      collectionId: "child",
      zoteroCollectionKey: "CHILD",
      name: "Child",
      parentCollectionKey: "ROOT"
    }
  ];

  it("applies explicit priorities and recomputes effective states", async () => {
    const repository = new FakeCollectionPriorityRepository(collections);
    const service = new DefaultCollectionPriorityService(repository);

    await service.updateCollectionPriority({
      zoteroCollectionKey: "ROOT",
      priority: "primary"
    });

    let tree = await service.getPriorityTree();
    expect(tree[0].effectivePriority).toBe("primary");
    expect(tree[0].children[0].effectivePriority).toBe("primary");

    await service.updateCollectionPriority({
      zoteroCollectionKey: "CHILD",
      priority: "excluded"
    });

    tree = await service.getPriorityTree();
    expect(tree[0].children[0].effectivePriority).toBe("excluded");
    expect(tree[0].children[0].isExplicitOverride).toBe(true);

    await service.updateCollectionPriority({
      zoteroCollectionKey: "CHILD",
      priority: null
    });

    tree = await service.getPriorityTree();
    expect(tree[0].children[0].effectivePriority).toBe("primary");
    expect(tree[0].children[0].isExplicitOverride).toBe(false);
  });

  it("throws controlled error for unknown collection key", async () => {
    const repository = new FakeCollectionPriorityRepository(collections);
    const service = new DefaultCollectionPriorityService(repository);

    await expect(
      service.updateCollectionPriority({
        zoteroCollectionKey: "UNKNOWN",
        priority: "primary"
      })
    ).rejects.toBeInstanceOf(AppError);
  });
});

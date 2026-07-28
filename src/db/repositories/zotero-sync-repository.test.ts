import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../generated/prisma";

import { PrismaZoteroSyncRepository } from "./zotero-sync-repository";

describe("PrismaZoteroSyncRepository", () => {
  it("replaces large item-collection mapping sets with bounded batch transactions", async () => {
    const itemCount = 401;
    const items = Array.from({ length: itemCount }, (_, index) => ({
      id: `item-id-${index}`,
      zoteroItemKey: `item-key-${index}`
    }));
    const collections = [{ id: "collection-id", zoteroCollectionKey: "collection-key" }];
    const deleteMany = vi.fn(() => Promise.resolve({ count: 0 }));
    const createMany = vi.fn((input: { data: unknown[] }) =>
      Promise.resolve({ count: input.data.length })
    );
    const transaction = vi.fn((operations: Array<Promise<unknown>>) => Promise.all(operations));
    const db = {
      zoteroItemRaw: {
        findMany: vi.fn(() => Promise.resolve(items))
      },
      zoteroCollection: {
        findMany: vi.fn(() => Promise.resolve(collections))
      },
      zoteroItemCollection: {
        deleteMany,
        createMany
      },
      $transaction: transaction
    } as unknown as PrismaClient;
    const repository = new PrismaZoteroSyncRepository(db);

    const total = await repository.replaceItemCollectionMappings(
      items.map((item) => ({
        zoteroItemKey: item.zoteroItemKey,
        zoteroCollectionKeys: ["collection-key"]
      }))
    );

    expect(total).toBe(itemCount);
    expect(transaction).toHaveBeenCalledTimes(3);
    expect(transaction.mock.calls.every(([operations]) => Array.isArray(operations))).toBe(true);
    expect(deleteMany).toHaveBeenCalledTimes(3);
    expect(createMany).toHaveBeenCalledTimes(3);
    expect(createMany.mock.calls.map(([input]) => input.data.length)).toEqual([200, 200, 1]);
  });
});

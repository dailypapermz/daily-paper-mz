import { describe, expect, it } from "vitest";
import type { ZoteroSyncRun } from "../../generated/prisma";

import { AppError } from "../../lib/errors";
import { DefaultZoteroSyncService } from "./zotero-sync.service";
import type {
  RawZoteroCollectionRecord,
  RawZoteroItemRecord,
  SyncRunCounts,
  ZoteroApiCollection,
  ZoteroApiItem,
  ZoteroClient,
  ZoteroSyncRepository
} from "./types";

class FakeZoteroClient implements ZoteroClient {
  itemSinceVersion: number | undefined;
  collectionSinceVersion: number | undefined;

  constructor(
    private readonly itemsResult: { records: ZoteroApiItem[]; libraryVersion: number | null },
    private readonly collectionsResult: {
      records: ZoteroApiCollection[];
      libraryVersion: number | null;
    },
    private readonly shouldThrow = false
  ) {}

  async fetchItems(options?: { sinceVersion?: number }) {
    if (this.shouldThrow) {
      throw new AppError("ZOTERO_API_ERROR", "mock client failure");
    }

    this.itemSinceVersion = options?.sinceVersion;
    return this.itemsResult;
  }

  async fetchCollections(options?: { sinceVersion?: number }) {
    if (this.shouldThrow) {
      throw new AppError("ZOTERO_API_ERROR", "mock client failure");
    }

    this.collectionSinceVersion = options?.sinceVersion;
    return this.collectionsResult;
  }
}

class FakeZoteroRepository implements ZoteroSyncRepository {
  private runCounter = 0;
  private runs: ZoteroSyncRun[] = [];
  private latestSuccess: ZoteroSyncRun | null;
  private collectionsUpserted = false;
  private itemsUpserted = false;

  constructor(seedSuccess: ZoteroSyncRun | null = null) {
    this.latestSuccess = seedSuccess;
    if (seedSuccess) {
      this.runs.push(seedSuccess);
    }
  }

  async createRun(input: { mode: "full" | "incremental"; sinceVersion?: number }) {
    const run = makeRun({
      id: `run-${++this.runCounter}`,
      mode: input.mode === "full" ? "FULL" : "INCREMENTAL",
      status: "RUNNING",
      sinceVersion: input.sinceVersion ?? null
    });
    this.runs.push(run);
    return run;
  }

  async markRunSucceeded(
    runId: string,
    payload: SyncRunCounts & { libraryVersion?: number | null }
  ) {
    const run = this.findRun(runId);
    run.status = "SUCCESS";
    run.finishedAt = new Date();
    run.libraryVersion = payload.libraryVersion ?? null;
    run.itemsCount = payload.itemsCount;
    run.collectionsCount = payload.collectionsCount;
    run.mappingsCount = payload.mappingsCount;
    run.updatedAt = new Date();
    this.latestSuccess = run;
    return run;
  }

  async markRunFailed(runId: string, errorMessage: string) {
    const run = this.findRun(runId);
    run.status = "FAILED";
    run.finishedAt = new Date();
    run.errorMessage = errorMessage;
    run.updatedAt = new Date();
    return run;
  }

  async getLatestRun() {
    return this.runs.length > 0 ? this.runs[this.runs.length - 1] : null;
  }

  async getLatestSuccessfulRun() {
    return this.latestSuccess;
  }

  async upsertRawItems(items: RawZoteroItemRecord[]) {
    this.itemsUpserted = true;
    return items.length;
  }

  async upsertCollections(collections: RawZoteroCollectionRecord[]) {
    this.collectionsUpserted = true;
    return collections.length;
  }

  async replaceItemCollectionMappings(
    mappingByItem: Array<{ zoteroItemKey: string; zoteroCollectionKeys: string[] }>
  ) {
    if (!this.collectionsUpserted || !this.itemsUpserted) {
      throw new Error("Mappings were replaced before items/collections were persisted");
    }
    return mappingByItem.reduce((acc, entry) => acc + entry.zoteroCollectionKeys.length, 0);
  }

  getRuns() {
    return this.runs;
  }

  private findRun(runId: string) {
    const run = this.runs.find((item) => item.id === runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    return run;
  }
}

describe("DefaultZoteroSyncService", () => {
  it("runs full sync when no previous successful run exists", async () => {
    const client = new FakeZoteroClient(
      {
        records: [mockItem("item-1", ["A"])],
        libraryVersion: 12
      },
      {
        records: [mockCollection("A")],
        libraryVersion: 12
      }
    );
    const repository = new FakeZoteroRepository();

    const service = new DefaultZoteroSyncService(client, repository);
    const summary = await service.runSync();

    expect(summary.mode).toBe("full");
    expect(summary.status).toBe("success");
    expect(summary.counts.itemsCount).toBe(1);
    expect(summary.counts.collectionsCount).toBe(1);
    expect(summary.counts.mappingsCount).toBe(1);
    expect(client.itemSinceVersion).toBeUndefined();
    expect(client.collectionSinceVersion).toBeUndefined();
  });

  it("runs incremental sync when latest success has library version", async () => {
    const previousRun = makeRun({
      id: "run-prev",
      mode: "FULL",
      status: "SUCCESS",
      libraryVersion: 22,
      finishedAt: new Date(),
      sinceVersion: null
    });

    const client = new FakeZoteroClient(
      {
        records: [mockItem("item-2", ["A"])],
        libraryVersion: 23
      },
      {
        records: [mockCollection("A")],
        libraryVersion: 23
      }
    );

    const repository = new FakeZoteroRepository(previousRun);
    const service = new DefaultZoteroSyncService(client, repository);

    const summary = await service.runSync();

    expect(summary.mode).toBe("incremental");
    expect(client.itemSinceVersion).toBe(22);
    expect(client.collectionSinceVersion).toBe(22);
  });

  it("marks run failed when client throws", async () => {
    const client = new FakeZoteroClient(
      { records: [], libraryVersion: null },
      { records: [], libraryVersion: null },
      true
    );
    const repository = new FakeZoteroRepository();
    const service = new DefaultZoteroSyncService(client, repository);

    await expect(service.runSync()).rejects.toThrow("mock client failure");

    const latestRun = repository.getRuns()[repository.getRuns().length - 1];
    expect(latestRun.status).toBe("FAILED");
    expect(latestRun.errorMessage).toContain("mock client failure");
  });

  it("persists items and collections before rebuilding mappings", async () => {
    const client = new FakeZoteroClient(
      {
        records: [mockItem("item-3", ["A", "B"])],
        libraryVersion: 30
      },
      {
        records: [mockCollection("A"), mockCollection("B")],
        libraryVersion: 30
      }
    );
    const repository = new FakeZoteroRepository();
    const service = new DefaultZoteroSyncService(client, repository);

    const summary = await service.runSync("full");

    expect(summary.status).toBe("success");
    expect(summary.counts.mappingsCount).toBe(2);
  });
});

function mockItem(key: string, collections: string[]): ZoteroApiItem {
  return {
    key,
    version: 1,
    data: {
      title: "Mock Item",
      abstractNote: "Mock abstract",
      dateAdded: "2026-03-06T00:00:00Z",
      tags: [{ tag: "#mock" }],
      collections
    }
  };
}

function mockCollection(key: string): ZoteroApiCollection {
  return {
    key,
    version: 1,
    data: {
      name: "Mock Collection"
    }
  };
}

function makeRun(
  input: Partial<ZoteroSyncRun> &
    Pick<ZoteroSyncRun, "id" | "mode" | "status" | "sinceVersion">
): ZoteroSyncRun {
  const now = new Date();

  return {
    id: input.id,
    mode: input.mode,
    status: input.status,
    startedAt: input.startedAt ?? now,
    finishedAt: input.finishedAt ?? null,
    sinceVersion: input.sinceVersion,
    libraryVersion: input.libraryVersion ?? null,
    itemsCount: input.itemsCount ?? 0,
    collectionsCount: input.collectionsCount ?? 0,
    mappingsCount: input.mappingsCount ?? 0,
    errorMessage: input.errorMessage ?? null,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now
  };
}

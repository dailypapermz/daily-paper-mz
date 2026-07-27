import { describe, expect, it, vi } from "vitest";

import { runCloudProfileOperation, type CloudProfileDependencies } from "./cloud-profile";

function dependencies(): CloudProfileDependencies {
  return {
    sync: vi.fn().mockResolvedValue({
      id: "sync-1",
      counts: { itemsCount: 3, collectionsCount: 2, mappingsCount: 3 }
    }),
    refreshPriorities: vi.fn().mockResolvedValue([
      {
        collectionId: "collection-1",
        zoteroCollectionKey: "A",
        name: "A",
        explicitPriority: "primary",
        effectivePriority: "primary",
        isExplicitOverride: true,
        depth: 0,
        children: [
          {
            collectionId: "collection-2",
            zoteroCollectionKey: "B",
            name: "B",
            parentCollectionKey: "A",
            explicitPriority: null,
            effectivePriority: "primary",
            isExplicitOverride: false,
            depth: 1,
            children: []
          }
        ]
      }
    ]),
    refreshProfile: vi.fn().mockResolvedValue({
      job: { id: "refresh-1" },
      snapshot: { id: "snapshot-1", itemsCount: 3 }
    })
  };
}

describe("runCloudProfileOperation", () => {
  it("syncs Zotero and materializes effective priorities without changing selections", async () => {
    const deps = dependencies();
    const result = await runCloudProfileOperation("sync", deps);

    expect(result).toEqual({
      operation: "sync",
      status: "complete",
      syncRunId: "sync-1",
      itemsCount: 3,
      collectionsCount: 2,
      mappingsCount: 3,
      selectableCollections: 2,
      selectedCollections: 2
    });
    expect(deps.refreshProfile).not.toHaveBeenCalled();
  });

  it("refreshes the profile separately from Zotero sync", async () => {
    const deps = dependencies();
    const result = await runCloudProfileOperation("refresh", deps);

    expect(result).toEqual({
      operation: "refresh",
      status: "complete",
      refreshJobId: "refresh-1",
      snapshotId: "snapshot-1",
      itemsCount: 3
    });
    expect(deps.sync).not.toHaveBeenCalled();
    expect(deps.refreshPriorities).not.toHaveBeenCalled();
  });
});

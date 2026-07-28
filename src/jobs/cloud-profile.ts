import { createCollectionPriorityService, type CollectionTreeNode } from "../modules/collections";
import { createProfileRefreshService } from "../modules/profile-build";
import { createZoteroSyncService } from "../modules/zotero-sync";

export type CloudProfileOperation = "sync" | "refresh";

export type CloudProfileResult =
  | {
      operation: "sync";
      status: "complete";
      syncRunId: string;
      itemsCount: number;
      collectionsCount: number;
      mappingsCount: number;
      selectableCollections: number;
      selectedCollections: number;
    }
  | {
      operation: "refresh";
      status: "complete";
      refreshJobId: string;
      snapshotId: string;
      itemsCount: number;
    };

export type CloudProfileDependencies = {
  sync(): Promise<{
    id: string;
    counts: { itemsCount: number; collectionsCount: number; mappingsCount: number };
  }>;
  refreshPriorities(): Promise<CollectionTreeNode[]>;
  refreshProfile(): Promise<{
    job: { id: string };
    snapshot: { id: string; itemsCount: number };
  }>;
};

export async function runCloudProfileOperation(
  operation: CloudProfileOperation,
  dependencies: CloudProfileDependencies = createCloudProfileDependencies()
): Promise<CloudProfileResult> {
  if (operation === "sync") {
    const sync = await dependencies.sync();
    const tree = await dependencies.refreshPriorities();
    const priorities = summarizePriorities(tree);

    return {
      operation,
      status: "complete",
      syncRunId: sync.id,
      ...sync.counts,
      ...priorities
    };
  }

  const refresh = await dependencies.refreshProfile();
  return {
    operation,
    status: "complete",
    refreshJobId: refresh.job.id,
    snapshotId: refresh.snapshot.id,
    itemsCount: refresh.snapshot.itemsCount
  };
}

function createCloudProfileDependencies(): CloudProfileDependencies {
  return {
    sync: async () => createZoteroSyncService().runSync("incremental"),
    refreshPriorities: async () => createCollectionPriorityService().getPriorityTree(),
    refreshProfile: async () => createProfileRefreshService().runManualRefresh()
  };
}

function summarizePriorities(tree: CollectionTreeNode[]) {
  const queue = [...tree];
  let selectableCollections = 0;
  let selectedCollections = 0;

  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) continue;
    selectableCollections += 1;
    if (node.effectivePriority === "primary" || node.effectivePriority === "secondary") {
      selectedCollections += 1;
    }
    queue.push(...node.children);
  }

  return { selectableCollections, selectedCollections };
}

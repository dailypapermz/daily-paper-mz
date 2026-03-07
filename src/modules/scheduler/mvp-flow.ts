import { logger } from "../../lib/logging";
import { createCollectionPriorityService, type CollectionTreeNode } from "../collections";
import {
  createProfileRefreshService,
  type ProfileRefreshJobSummary,
  type ProfileSnapshotSummary
} from "../profile-build";
import { createDailyRecommendationService, type DailyRecommendationFeed } from "../ranking/explain";
import { createZoteroSyncService, type SyncRunSummary, type ZoteroSyncModeValue } from "../zotero-sync";
import { runDailyRecommendationPipeline, type DailyPipelineRunSummary, type DailySchedulerSource } from "./daily-pipeline";

export type MvpCollectionPrioritySummary = {
  totalCollections: number;
  explicitOverrideCount: number;
  effectiveCounts: {
    primary: number;
    secondary: number;
    excluded: number;
  };
};

export type MvpFlowResult = {
  startedAt: string;
  finishedAt: string;
  sync: SyncRunSummary;
  collectionPriorities: MvpCollectionPrioritySummary;
  profileRefresh: {
    job: ProfileRefreshJobSummary;
    snapshot: ProfileSnapshotSummary;
  };
  dailyPipeline: DailyPipelineRunSummary;
  dashboard: {
    latestFeedRunId?: string;
    recommendationCount: number;
  };
  warnings: string[];
};

export type MvpFlowDependencies = {
  runSync: (mode: ZoteroSyncModeValue) => Promise<SyncRunSummary>;
  getPriorityTree: () => Promise<CollectionTreeNode[]>;
  runManualRefresh: () => Promise<{ job: ProfileRefreshJobSummary; snapshot: ProfileSnapshotSummary }>;
  runDailyPipeline: (input?: {
    runDate?: string;
    sources?: DailySchedulerSource[];
  }) => Promise<DailyPipelineRunSummary>;
  getDailyFeed: () => Promise<DailyRecommendationFeed | null>;
};

export type RunMvpFlowInput = {
  syncMode?: ZoteroSyncModeValue;
  runDate?: string;
  sources?: DailySchedulerSource[];
};

export async function runMvpIntegrationFlow(
  input?: RunMvpFlowInput,
  dependencies: MvpFlowDependencies = createMvpFlowDependencies()
): Promise<MvpFlowResult> {
  const startedAt = new Date();
  const warnings: string[] = [];
  const syncMode = input?.syncMode ?? "incremental";

  logger.info("MVP integration flow started", {
    syncMode,
    runDate: input?.runDate,
    sources: input?.sources
  });

  const sync = await dependencies.runSync(syncMode);
  const priorityTree = await dependencies.getPriorityTree();
  const collectionPriorities = summarizeCollectionPriorities(priorityTree);

  if (collectionPriorities.totalCollections === 0) {
    warnings.push("No Zotero collections are available after sync.");
  } else if (
    collectionPriorities.effectiveCounts.primary + collectionPriorities.effectiveCounts.secondary ===
    0
  ) {
    warnings.push("No collections are currently selected as primary/secondary for profile building.");
  }

  const profileRefresh = await dependencies.runManualRefresh();
  const dailyPipeline = await dependencies.runDailyPipeline({
    runDate: input?.runDate,
    sources: input?.sources
  });
  const latestFeed = await dependencies.getDailyFeed();

  const failedSources = dailyPipeline.sources.filter((entry) => entry.status === "failed");
  if (failedSources.length > 0) {
    warnings.push(
      `Daily pipeline failed for sources: ${failedSources.map((entry) => entry.source).join(", ")}`
    );
  }
  if (!latestFeed || latestFeed.recommendations.length === 0) {
    warnings.push("Dashboard feed has no recommendations yet.");
  }

  const result: MvpFlowResult = {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    sync,
    collectionPriorities,
    profileRefresh,
    dailyPipeline,
    dashboard: {
      latestFeedRunId: latestFeed?.runId,
      recommendationCount: latestFeed?.recommendations.length ?? 0
    },
    warnings
  };

  logger.info("MVP integration flow finished", {
    syncRunId: result.sync.id,
    profileSnapshotId: result.profileRefresh.snapshot.id,
    latestFeedRunId: result.dashboard.latestFeedRunId,
    recommendationCount: result.dashboard.recommendationCount,
    warnings: result.warnings
  });

  return result;
}

export function createMvpFlowDependencies(): MvpFlowDependencies {
  return {
    runSync: async (mode) => {
      const service = createZoteroSyncService();
      return service.runSync(mode);
    },
    getPriorityTree: async () => {
      const service = createCollectionPriorityService();
      return service.getPriorityTree();
    },
    runManualRefresh: async () => {
      const service = createProfileRefreshService();
      return service.runManualRefresh();
    },
    runDailyPipeline: async (params) => runDailyRecommendationPipeline(params),
    getDailyFeed: async () => {
      const service = createDailyRecommendationService();
      return service.getDailyFeed({
        selectedOnly: false
      });
    }
  };
}

function summarizeCollectionPriorities(tree: CollectionTreeNode[]): MvpCollectionPrioritySummary {
  const queue = [...tree];
  let totalCollections = 0;
  let explicitOverrideCount = 0;
  let primary = 0;
  let secondary = 0;
  let excluded = 0;

  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) {
      continue;
    }

    totalCollections += 1;
    if (node.explicitPriority) {
      explicitOverrideCount += 1;
    }

    if (node.effectivePriority === "primary") {
      primary += 1;
    } else if (node.effectivePriority === "secondary") {
      secondary += 1;
    } else {
      excluded += 1;
    }

    queue.push(...node.children);
  }

  return {
    totalCollections,
    explicitOverrideCount,
    effectiveCounts: {
      primary,
      secondary,
      excluded
    }
  };
}

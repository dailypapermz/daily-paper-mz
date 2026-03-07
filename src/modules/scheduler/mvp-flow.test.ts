import { describe, expect, it, vi } from "vitest";

import { runMvpIntegrationFlow, type MvpFlowDependencies } from "./mvp-flow";

function makeDependencies(overrides?: Partial<MvpFlowDependencies>): MvpFlowDependencies {
  const dependencies: MvpFlowDependencies = {
    runSync: vi.fn().mockResolvedValue({
      id: "sync-1",
      mode: "incremental",
      status: "success",
      startedAt: "2026-03-07T00:00:00.000Z",
      finishedAt: "2026-03-07T00:01:00.000Z",
      counts: {
        itemsCount: 10,
        collectionsCount: 2,
        mappingsCount: 4
      }
    }),
    getPriorityTree: vi.fn().mockResolvedValue([
      {
        collectionId: "c-1",
        zoteroCollectionKey: "COLL-1",
        name: "Core",
        explicitPriority: "primary",
        effectivePriority: "primary",
        isExplicitOverride: true,
        depth: 0,
        children: []
      },
      {
        collectionId: "c-2",
        zoteroCollectionKey: "COLL-2",
        name: "Background",
        explicitPriority: null,
        effectivePriority: "excluded",
        isExplicitOverride: false,
        depth: 0,
        children: []
      }
    ]),
    runManualRefresh: vi.fn().mockResolvedValue({
      job: {
        id: "job-1",
        trigger: "manual",
        status: "success",
        startedAt: "2026-03-07T00:00:00.000Z",
        finishedAt: "2026-03-07T00:01:00.000Z",
        snapshotId: "snapshot-1"
      },
      snapshot: {
        id: "snapshot-1",
        status: "active",
        builtAt: "2026-03-07T00:01:00.000Z",
        itemsCount: 10,
        segments: {
          recentCore: 5,
          stableLongTerm: 3,
          background: 2
        },
        researchTypePreferences: []
      }
    }),
    runDailyPipeline: vi.fn().mockResolvedValue({
      startedAt: "2026-03-07T00:00:00.000Z",
      finishedAt: "2026-03-07T00:01:00.000Z",
      sources: [{ source: "arxiv", runId: "run-1", status: "success" }]
    }),
    getDailyFeed: vi.fn().mockResolvedValue({
      rerankRunId: "rerank-1",
      runId: "run-1",
      generatedAt: "2026-03-07T00:01:00.000Z",
      recommendations: [
        {
          candidateId: "cand-1",
          rank: 1,
          selected: true,
          finalScore: 0.91,
          sources: ["arxiv"],
          identifiers: {},
          labels: {},
          reasons: []
        }
      ]
    }),
    ...overrides
  };

  return dependencies;
}

describe("runMvpIntegrationFlow", () => {
  it("runs full MVP flow and returns integrated summary", async () => {
    const dependencies = makeDependencies();

    const result = await runMvpIntegrationFlow(
      {
        syncMode: "full",
        runDate: "2026-03-07",
        sources: ["arxiv"]
      },
      dependencies
    );

    expect(dependencies.runSync).toHaveBeenCalledWith("full");
    expect(dependencies.runDailyPipeline).toHaveBeenCalledWith({
      runDate: "2026-03-07",
      sources: ["arxiv"]
    });
    expect(result.collectionPriorities.totalCollections).toBe(2);
    expect(result.dashboard.latestFeedRunId).toBe("run-1");
    expect(result.dashboard.recommendationCount).toBe(1);
    expect(result.warnings).toEqual([]);
  });

  it("adds warnings when selected collections are missing or daily pipeline fails", async () => {
    const dependencies = makeDependencies({
      getPriorityTree: vi.fn().mockResolvedValue([
        {
          collectionId: "c-1",
          zoteroCollectionKey: "COLL-1",
          name: "Root",
          explicitPriority: null,
          effectivePriority: "excluded",
          isExplicitOverride: false,
          depth: 0,
          children: []
        }
      ]),
      runDailyPipeline: vi.fn().mockResolvedValue({
        startedAt: "2026-03-07T00:00:00.000Z",
        finishedAt: "2026-03-07T00:01:00.000Z",
        sources: [{ source: "pubmed", status: "failed", errorMessage: "timeout" }]
      }),
      getDailyFeed: vi.fn().mockResolvedValue(null)
    });

    const result = await runMvpIntegrationFlow(undefined, dependencies);

    expect(result.warnings).toContain(
      "No collections are currently selected as primary/secondary for profile building."
    );
    expect(result.warnings).toContain("Daily pipeline failed for sources: pubmed");
    expect(result.warnings).toContain("Dashboard feed has no recommendations yet.");
  });
});

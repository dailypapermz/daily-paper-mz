import { describe, expect, it } from "vitest";

import { AppError } from "../../lib/errors";
import { DefaultProfileBuildService } from "./profile-build.service";
import type { ProfileSnapshotRepository } from "./types";

class FakeProfileSnapshotRepository implements ProfileSnapshotRepository {
  constructor(
    private readonly items: Awaited<ReturnType<ProfileSnapshotRepository["listEligibleItems"]>>,
    private readonly active: Awaited<ReturnType<ProfileSnapshotRepository["getActiveSnapshot"]>> = null,
    private readonly feedbackLogs: Awaited<ReturnType<ProfileSnapshotRepository["listFeedbackLogs"]>> = []
  ) {}

  async listEligibleItems() {
    return this.items;
  }

  async listFeedbackLogs(input?: { since?: Date; limit?: number }) {
    const filtered = input?.since
      ? this.feedbackLogs.filter((log) => new Date(log.createdAt).getTime() > input.since!.getTime())
      : this.feedbackLogs;

    return filtered.slice(0, input?.limit ?? 500);
  }

  async saveActiveSnapshot(input: {
    sourceLibraryVersion?: number;
    items: Array<{
      itemId: string;
      segment: "recent_core" | "stable_long_term" | "background";
      finalWeight: number;
      collectionWeight: number;
      attentionWeight: number;
      recencyWeight: number;
      representationSource: "structured_tags" | "title_abstract";
      contentRecallLabel?: string;
      researchCategory?: "method" | "biology" | "resource" | "benchmark";
      representationText: string;
    }>;
    researchPreferences: Array<{
      category: "method" | "biology" | "resource" | "benchmark";
      weight: number;
      itemCount: number;
    }>;
    summaryJson: Record<string, unknown>;
  }) {
    return {
      id: "snapshot-1",
      status: "active" as const,
      builtAt: new Date().toISOString(),
      sourceLibraryVersion: input.sourceLibraryVersion,
      itemsCount: input.items.length,
      segments: {
        recentCore: input.items.filter((item) => item.segment === "recent_core").length,
        stableLongTerm: input.items.filter((item) => item.segment === "stable_long_term").length,
        background: input.items.filter((item) => item.segment === "background").length
      },
      researchTypePreferences: input.researchPreferences
    };
  }

  async getActiveSnapshot() {
    return this.active;
  }
}

describe("DefaultProfileBuildService", () => {
  it("builds profile snapshot using structured tags and fallback representations", async () => {
    const repo = new FakeProfileSnapshotRepository([
      {
        itemId: "item-1",
        zoteroItemKey: "A",
        title: "Title A",
        abstractNote: "Abstract A",
        dateAdded: new Date(),
        libraryVersion: 12,
        collectionPriorities: ["primary"],
        attentionLevel: 4,
        contentRecallLabels: ["single-cell trajectory inference"],
        researchCategories: ["method"],
        researchKeywords: ["foundation model"]
      },
      {
        itemId: "item-2",
        zoteroItemKey: "B",
        title: "Title B",
        abstractNote: "Abstract B",
        dateAdded: new Date("2024-01-01T00:00:00.000Z"),
        libraryVersion: 10,
        collectionPriorities: ["secondary"],
        attentionLevel: 0,
        contentRecallLabels: [],
        researchCategories: [],
        researchKeywords: []
      }
    ]);

    const service = new DefaultProfileBuildService(repo);
    const snapshot = await service.buildSnapshot();

    expect(snapshot.itemsCount).toBe(2);
    expect(snapshot.sourceLibraryVersion).toBe(12);
    expect(snapshot.segments.recentCore).toBeGreaterThanOrEqual(1);
    expect(snapshot.researchTypePreferences[0].category).toBe("method");
  });

  it("throws controlled error when no eligible items exist", async () => {
    const repo = new FakeProfileSnapshotRepository([]);
    const service = new DefaultProfileBuildService(repo);

    await expect(service.buildSnapshot()).rejects.toBeInstanceOf(AppError);
  });

  it("conservatively incorporates feedback logs during refresh-time build", async () => {
    const repo = new FakeProfileSnapshotRepository(
      [
        {
          itemId: "item-1",
          zoteroItemKey: "A",
          title: "Title A",
          abstractNote: "Abstract A",
          dateAdded: new Date(),
          libraryVersion: 12,
          collectionPriorities: ["primary"],
          attentionLevel: 1,
          contentRecallLabels: ["single-cell trajectory inference"],
          researchCategories: ["method"],
          researchKeywords: ["foundation model"]
        }
      ],
      null,
      [
        {
          id: "log-1",
          runId: "run-1",
          candidateId: "candidate-1",
          actionType: "label_edit",
          newValue: {
            researchType: {
              category: "biology",
              primaryKeyword: "chromatin"
            }
          },
          createdAt: new Date().toISOString()
        }
      ]
    );

    const service = new DefaultProfileBuildService(repo);
    const snapshot = await service.buildSnapshot();

    expect(snapshot.researchTypePreferences.some((entry) => entry.category === "biology")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";

import { AppError } from "../../lib/errors";
import {
  DefaultProfileBuildService,
  extractNegativeFeedbackSignals
} from "./profile-build.service";
import type { ProfileSnapshotRepository } from "./types";

class FakeProfileSnapshotRepository implements ProfileSnapshotRepository {
  savedInput?: Parameters<ProfileSnapshotRepository["saveActiveSnapshot"]>[0];

  constructor(
    private readonly items: Awaited<ReturnType<ProfileSnapshotRepository["listEligibleItems"]>>,
    private readonly active: Awaited<ReturnType<ProfileSnapshotRepository["getActiveSnapshot"]>> = null,
    private readonly feedbackLogs: Awaited<ReturnType<ProfileSnapshotRepository["listFeedbackLogs"]>> = [],
    private readonly triageFeedbackLogs: Awaited<
      ReturnType<ProfileSnapshotRepository["listTriageFeedbackLogs"]>
    > = []
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

  async listTriageFeedbackLogs() {
    return this.triageFeedbackLogs;
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
    this.savedInput = input;
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

  it("persists deterministic bounded negative signals during profile refresh", async () => {
    const triageLogs = [
      triageLog({
        id: "dismiss-1",
        candidateId: "candidate-1",
        paperIdentityKey: "doi:10.1000/one",
        actionType: "dismiss",
        createdAt: "2026-08-01T00:00:00.000Z",
        title: "Oncology single-cell atlas",
        contentRecallLabel: "single-cell tumor atlas"
      })
    ];
    const repo = new FakeProfileSnapshotRepository([eligibleItem()], null, [], triageLogs);
    const service = new DefaultProfileBuildService(repo);

    await service.buildSnapshot();
    const firstSummary = repo.savedInput?.summaryJson;
    await service.buildSnapshot();
    const secondSummary = repo.savedInput?.summaryJson;

    expect(readNegativeFeedback(firstSummary)).toEqual(readNegativeFeedback(secondSummary));
    expect(firstSummary).toMatchObject({
      feedbackIntegration: {
        negativeFeedback: {
          modelVersion: "bounded-token-overlap-v1",
          signalCount: 1,
          maxSignals: 50,
          maxContributingSignals: 3,
          weightPerSignal: 0.08,
          maxPenalty: 0.18,
          signals: [
            {
              paperIdentityKey: "doi:10.1000/one",
              sourceFeedbackLogId: "dismiss-1",
              contentRecallLabel: "single-cell tumor atlas"
            }
          ]
        }
      }
    });
  });
});

describe("extractNegativeFeedbackSignals", () => {
  it("uses latest triage action across runs for the same paper", () => {
    const base = {
      candidateId: "candidate-old",
      paperIdentityKey: "doi:10.1000/shared",
      title: "Shared paper"
    };

    expect(
      extractNegativeFeedbackSignals([
        triageLog({
          ...base,
          id: "dismiss-old",
          actionType: "dismiss",
          createdAt: "2026-08-01T00:00:00.000Z"
        }),
        triageLog({
          ...base,
          candidateId: "candidate-new",
          id: "save-new",
          actionType: "save",
          createdAt: "2026-08-02T00:00:00.000Z"
        })
      ])
    ).toEqual([]);

    expect(
      extractNegativeFeedbackSignals([
        triageLog({
          ...base,
          id: "dismiss-old",
          actionType: "dismiss",
          createdAt: "2026-08-01T00:00:00.000Z"
        }),
        triageLog({
          ...base,
          candidateId: "candidate-new",
          id: "promote-new",
          actionType: "promote",
          createdAt: "2026-08-02T00:00:00.000Z"
        })
      ])
    ).toEqual([]);

    expect(
      extractNegativeFeedbackSignals([
        triageLog({
          ...base,
          id: "promote-old",
          actionType: "promote",
          createdAt: "2026-08-01T00:00:00.000Z"
        }),
        triageLog({
          ...base,
          candidateId: "candidate-new",
          id: "dismiss-new",
          actionType: "dismiss",
          createdAt: "2026-08-02T00:00:00.000Z"
        })
      ])
    ).toHaveLength(1);
  });

  it("does not let repeated actions for one paper accumulate", () => {
    const signals = extractNegativeFeedbackSignals([
      triageLog({
        id: "dismiss-1",
        candidateId: "candidate-1",
        paperIdentityKey: "doi:10.1000/repeated",
        actionType: "dismiss",
        createdAt: "2026-08-01T00:00:00.000Z",
        title: "Repeated paper"
      }),
      triageLog({
        id: "dismiss-2",
        candidateId: "candidate-1",
        paperIdentityKey: "doi:10.1000/repeated",
        actionType: "dismiss",
        createdAt: "2026-08-02T00:00:00.000Z",
        title: "Repeated paper"
      })
    ]);

    expect(signals).toHaveLength(1);
    expect(signals[0].sourceFeedbackLogId).toBe("dismiss-2");
  });

  it("keeps label edits orthogonal to the latest triage action", () => {
    const signals = extractNegativeFeedbackSignals([
      triageLog({
        id: "dismiss-1",
        candidateId: "candidate-1",
        paperIdentityKey: "doi:10.1000/edited",
        actionType: "dismiss",
        createdAt: "2026-08-01T00:00:00.000Z",
        title: "Edited paper"
      }),
      triageLog({
        id: "label-1",
        candidateId: "candidate-1",
        paperIdentityKey: "doi:10.1000/edited",
        actionType: "label_edit",
        createdAt: "2026-08-02T00:00:00.000Z",
        title: "Edited paper"
      })
    ]);

    expect(signals).toHaveLength(1);
  });

  it("keeps only the newest bounded set of effective dismiss signals", () => {
    const signals = extractNegativeFeedbackSignals(
      Array.from({ length: 60 }, (_, index) =>
        triageLog({
          id: `dismiss-${index.toString().padStart(2, "0")}`,
          candidateId: `candidate-${index}`,
          paperIdentityKey: `doi:10.1000/${index}`,
          actionType: "dismiss",
          createdAt: new Date(Date.UTC(2026, 7, index + 1)).toISOString(),
          title: `Dismissed paper ${index}`
        })
      )
    );

    expect(signals).toHaveLength(50);
    expect(signals[0].paperIdentityKey).toBe("doi:10.1000/59");
    expect(signals.at(-1)?.paperIdentityKey).toBe("doi:10.1000/10");
  });
});

function eligibleItem(): Awaited<ReturnType<ProfileSnapshotRepository["listEligibleItems"]>>[number] {
  return {
    itemId: "item-1",
    zoteroItemKey: "A",
    title: "Comparative genomics",
    abstractNote: "Cross-species regulatory conservation",
    dateAdded: new Date("2026-08-01T00:00:00.000Z"),
    libraryVersion: 12,
    collectionPriorities: ["primary"],
    attentionLevel: 2,
    contentRecallLabels: ["comparative genomics"],
    researchCategories: ["biology"],
    researchKeywords: ["cross-species"]
  };
}

function triageLog(input: {
  id: string;
  candidateId: string;
  paperIdentityKey: string;
  actionType: "save" | "dismiss" | "promote" | "label_edit";
  createdAt: string;
  title?: string;
  contentRecallLabel?: string;
}): Awaited<ReturnType<ProfileSnapshotRepository["listTriageFeedbackLogs"]>>[number] {
  return {
    id: input.id,
    runId: `run-${input.candidateId}`,
    candidateId: input.candidateId,
    actionType: input.actionType,
    createdAt: input.createdAt,
    candidate: {
      paperIdentityKey: input.paperIdentityKey,
      title: input.title,
      abstractNote: input.title ? `${input.title} abstract` : undefined,
      contentRecallLabels: input.contentRecallLabel ? [input.contentRecallLabel] : [],
      researchCategories: [],
      researchKeywords: []
    }
  };
}

function readNegativeFeedback(summary: Record<string, unknown> | undefined): unknown {
  const feedbackIntegration = summary?.feedbackIntegration;
  if (!feedbackIntegration || typeof feedbackIntegration !== "object" || Array.isArray(feedbackIntegration)) {
    return undefined;
  }
  return (feedbackIntegration as Record<string, unknown>).negativeFeedback;
}

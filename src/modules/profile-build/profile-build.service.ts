import { AppError } from "../../lib/errors";
import type {
  ProfileBuildService,
  ProfileEligibleItem,
  ProfileFeedbackLogRecord,
  ProfileInterestSegmentValue,
  ProfileRepresentationSourceValue,
  ProfileSnapshotRepository
} from "./types";

const PRIMARY_COLLECTION_WEIGHT = 1;
const SECONDARY_COLLECTION_WEIGHT = 0.7;
const ATTENTION_STEP = 0.6;

export class DefaultProfileBuildService implements ProfileBuildService {
  constructor(private readonly repository: ProfileSnapshotRepository) {}

  async buildSnapshot() {
    const previousSnapshot = await this.repository.getActiveSnapshot();
    const previousBuiltAt = previousSnapshot ? new Date(previousSnapshot.builtAt) : undefined;
    const [items, feedbackLogs] = await Promise.all([
      this.repository.listEligibleItems(),
      this.repository.listFeedbackLogs({
        since: previousBuiltAt
      })
    ]);

    if (items.length === 0) {
      throw new AppError(
        "PROFILE_BUILD_NO_ELIGIBLE_ITEMS",
        "No eligible items found in primary/secondary collections",
        400
      );
    }

    const now = new Date();

    const snapshotItems = items.map((item) => {
      const collectionWeight = resolveCollectionWeight(item.collectionPriorities);
      const attentionWeight = 1 + Math.max(0, item.attentionLevel) * ATTENTION_STEP;
      const recencyWeight = resolveRecencyWeight(item.dateAdded, now);
      const finalWeight = collectionWeight * attentionWeight + recencyWeight * 0.4;
      const segment = resolveSegment(item, now);
      const representationSource = resolveRepresentationSource(item);
      const contentRecallLabel = item.contentRecallLabels[0];
      const researchCategory = item.researchCategories[0];
      const representationText = buildRepresentationText(item, representationSource);

      return {
        itemId: item.itemId,
        segment,
        finalWeight,
        collectionWeight,
        attentionWeight,
        recencyWeight,
        representationSource,
        contentRecallLabel,
        researchCategory,
        representationText
      };
    });

    const segmentCounts = snapshotItems.reduce(
      (acc, item) => {
        if (item.segment === "recent_core") {
          acc.recentCore += 1;
        } else if (item.segment === "stable_long_term") {
          acc.stableLongTerm += 1;
        } else {
          acc.background += 1;
        }
        return acc;
      },
      { recentCore: 0, stableLongTerm: 0, background: 0 }
    );

    const researchPreferenceByCategory = new Map<
      "method" | "biology" | "resource" | "benchmark",
      { totalWeight: number; itemCount: number }
    >();

    for (const item of snapshotItems) {
      if (!item.researchCategory) {
        continue;
      }

      const existing = researchPreferenceByCategory.get(item.researchCategory) ?? {
        totalWeight: 0,
        itemCount: 0
      };

      existing.totalWeight += item.finalWeight;
      existing.itemCount += 1;
      researchPreferenceByCategory.set(item.researchCategory, existing);
    }

    const feedbackSignals = extractFeedbackSignals(feedbackLogs);
    for (const [category, count] of feedbackSignals.categoryBoostCounts.entries()) {
      const existing = researchPreferenceByCategory.get(category) ?? {
        totalWeight: 0,
        itemCount: 0
      };
      existing.totalWeight += computeFeedbackBoost(count);
      researchPreferenceByCategory.set(category, existing);
    }

    const researchPreferences = Array.from(researchPreferenceByCategory.entries()).map(
      ([category, aggregate]) => ({
        category,
        weight: aggregate.totalWeight,
        itemCount: aggregate.itemCount
      })
    );

    const sourceLibraryVersion = Math.max(
      ...items
        .map((item) => item.libraryVersion)
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value)),
      0
    );

    return this.repository.saveActiveSnapshot({
      sourceLibraryVersion: sourceLibraryVersion > 0 ? sourceLibraryVersion : undefined,
      items: snapshotItems,
      researchPreferences,
      summaryJson: {
        itemsCount: snapshotItems.length,
        segmentCounts,
        generatedAt: now.toISOString(),
        feedbackIntegration: {
          since: previousBuiltAt?.toISOString(),
          logsConsumed: feedbackSignals.logsConsumed,
          actionCounts: feedbackSignals.actionCounts,
          categoryBoostCounts: Object.fromEntries(feedbackSignals.categoryBoostCounts),
          keywordHints: feedbackSignals.keywordHints
        }
      }
    });
  }

  async getActiveSnapshot() {
    return this.repository.getActiveSnapshot();
  }
}

function resolveCollectionWeight(priorities: Array<"primary" | "secondary">): number {
  if (priorities.includes("primary")) {
    return PRIMARY_COLLECTION_WEIGHT;
  }
  return SECONDARY_COLLECTION_WEIGHT;
}

function resolveRecencyWeight(dateAdded: Date | undefined, now: Date): number {
  if (!dateAdded) {
    return 0.35;
  }

  const dayDiff = Math.max(0, (now.getTime() - dateAdded.getTime()) / (1000 * 60 * 60 * 24));

  if (dayDiff <= 14) {
    return 1;
  }
  if (dayDiff <= 90) {
    return 0.75;
  }
  if (dayDiff <= 365) {
    return 0.5;
  }
  return 0.25;
}

function resolveSegment(item: ProfileEligibleItem, now: Date): ProfileInterestSegmentValue {
  const dayDiff = item.dateAdded
    ? Math.max(0, (now.getTime() - item.dateAdded.getTime()) / (1000 * 60 * 60 * 24))
    : 9999;

  if (item.attentionLevel >= 3 || dayDiff <= 45) {
    return "recent_core";
  }

  if (item.attentionLevel >= 1 || dayDiff <= 365) {
    return "stable_long_term";
  }

  return "background";
}

function resolveRepresentationSource(item: ProfileEligibleItem): ProfileRepresentationSourceValue {
  const hasStructured = item.contentRecallLabels.length > 0 || item.researchCategories.length > 0;
  return hasStructured ? "structured_tags" : "title_abstract";
}

function buildRepresentationText(
  item: ProfileEligibleItem,
  source: ProfileRepresentationSourceValue
): string {
  if (source === "structured_tags") {
    const parts = [
      ...item.contentRecallLabels,
      ...item.researchCategories.map((category) => `research:${category}`),
      ...item.researchKeywords
    ].filter(Boolean);

    if (parts.length > 0) {
      return parts.join(" | ");
    }
  }

  return [item.title, item.abstractNote].filter(Boolean).join("\n\n") || item.zoteroItemKey;
}

function computeFeedbackBoost(count: number): number {
  return Math.min(1, Math.max(0, count) * 0.2);
}

function extractFeedbackSignals(logs: ProfileFeedbackLogRecord[]) {
  const categoryBoostCounts = new Map<"method" | "biology" | "resource" | "benchmark", number>();
  const keywordCounts = new Map<string, number>();
  const actionCounts: Record<string, number> = {
    save: 0,
    dismiss: 0,
    promote: 0,
    label_edit: 0,
    summary_edit: 0
  };

  for (const log of logs) {
    actionCounts[log.actionType] = (actionCounts[log.actionType] ?? 0) + 1;

    if (log.actionType !== "label_edit") {
      continue;
    }

    const newValue = toObject(log.newValue);
    const contentRecall = toObject(newValue.contentRecall);
    const researchType = toObject(newValue.researchType);

    const category = toCategory(researchType.category);
    if (category) {
      categoryBoostCounts.set(category, (categoryBoostCounts.get(category) ?? 0) + 1);
    }

    const terms = [
      toStringValue(contentRecall.label),
      toStringValue(researchType.primaryKeyword),
      toStringValue(researchType.secondaryKeyword)
    ].filter((term): term is string => Boolean(term));

    for (const term of terms) {
      const normalized = term.toLowerCase().trim();
      if (!normalized) {
        continue;
      }
      keywordCounts.set(normalized, (keywordCounts.get(normalized) ?? 0) + 1);
    }
  }

  const keywordHints = [...keywordCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 20)
    .map(([keyword, count]) => ({ keyword, count }));

  return {
    logsConsumed: logs.length,
    actionCounts,
    categoryBoostCounts,
    keywordHints
  };
}

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function toStringValue(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toCategory(value: unknown): "method" | "biology" | "resource" | "benchmark" | undefined {
  if (value === "method" || value === "biology" || value === "resource" || value === "benchmark") {
    return value;
  }
  return undefined;
}

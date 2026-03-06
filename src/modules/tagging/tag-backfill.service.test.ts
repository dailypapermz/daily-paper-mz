import { describe, expect, it } from "vitest";

import { AppError } from "../../lib/errors";
import { DefaultTagBackfillService } from "./tag-backfill.service";
import type {
  GeneratedStructuredTags,
  TagBackfillCandidateItem,
  TagGenerationProvider,
  TagGenerationRepository
} from "./types";

class FakeTagGenerationRepository implements TagGenerationRepository {
  private readonly candidates: TagBackfillCandidateItem[];
  private readonly jobs = new Map<
    string,
    {
      status?: string;
      selectedItemsCount: number;
      missingItemsCount: number;
      generatedItemsCount: number;
      fallbackItemsCount: number;
      errorMessage?: string;
    }
  >();
  private readonly generatedByItemId = new Map<string, GeneratedStructuredTags>();
  private readonly jobItems = new Map<
    string,
    Array<{ itemId: string; status: string; usedFallback: boolean; errorMessage?: string }>
  >();
  private counter = 0;

  constructor(candidates: TagBackfillCandidateItem[]) {
    this.candidates = candidates;
  }

  async listSelectedItemsMissingContentTags(input?: { limit?: number }) {
    if (!input?.limit) {
      return this.candidates;
    }
    return this.candidates.slice(0, input.limit);
  }

  async createGenerationJob() {
    const id = `job-${++this.counter}`;
    this.jobs.set(id, {
      selectedItemsCount: 0,
      missingItemsCount: 0,
      generatedItemsCount: 0,
      fallbackItemsCount: 0
    });
    this.jobItems.set(id, []);
    return { id };
  }

  async appendGenerationJobItem(input: {
    jobId: string;
    itemId: string;
    status: "generated" | "skipped_unavailable" | "failed";
    usedFallback: boolean;
    errorMessage?: string;
  }) {
    const items = this.jobItems.get(input.jobId) ?? [];
    items.push(input);
    this.jobItems.set(input.jobId, items);
  }

  async replaceGeneratedStructuredTags(input: {
    itemId: string;
    generated: GeneratedStructuredTags;
  }) {
    this.generatedByItemId.set(input.itemId, input.generated);
  }

  async markGenerationJobFinished(input: {
    jobId: string;
    status: "running" | "success" | "partial" | "failed";
    selectedItemsCount: number;
    missingItemsCount: number;
    generatedItemsCount: number;
    fallbackItemsCount: number;
    errorMessage?: string;
  }) {
    this.jobs.set(input.jobId, {
      status: input.status,
      selectedItemsCount: input.selectedItemsCount,
      missingItemsCount: input.missingItemsCount,
      generatedItemsCount: input.generatedItemsCount,
      fallbackItemsCount: input.fallbackItemsCount,
      errorMessage: input.errorMessage
    });

    return {
      id: input.jobId,
      status: input.status,
      provider: "fake-provider",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      selectedItemsCount: input.selectedItemsCount,
      missingItemsCount: input.missingItemsCount,
      generatedItemsCount: input.generatedItemsCount,
      fallbackItemsCount: input.fallbackItemsCount,
      errorMessage: input.errorMessage
    };
  }

  async getLatestGenerationJob() {
    return null;
  }

  getGeneratedItemsCount() {
    return this.generatedByItemId.size;
  }

  getJobItems(jobId: string) {
    return this.jobItems.get(jobId) ?? [];
  }
}

class FakeProvider implements TagGenerationProvider {
  name = "fake-provider";

  constructor(private readonly mode: "success" | "unavailable") {}

  async generateStructuredTags(input: { zoteroItemKey: string }) {
    if (this.mode === "unavailable") {
      throw new AppError(
        "TAG_GENERATION_UNAVAILABLE",
        `Provider unavailable for ${input.zoteroItemKey}`,
        503
      );
    }

    return {
      contentRecallLabel: "content-recall",
      researchCategory: "method",
      primaryKeyword: "foundation model",
      secondaryKeyword: "single-cell"
    } as const;
  }
}

describe("DefaultTagBackfillService", () => {
  it("generates and persists tags for selected items missing # tags", async () => {
    const repository = new FakeTagGenerationRepository([
      { itemId: "item-1", zoteroItemKey: "KEY-1", title: "A", abstractNote: "B" },
      { itemId: "item-2", zoteroItemKey: "KEY-2" }
    ]);
    const provider = new FakeProvider("success");
    const service = new DefaultTagBackfillService(repository, provider);

    const result = await service.runBackfill();

    expect(result.job.status).toBe("success");
    expect(result.job.generatedItemsCount).toBe(2);
    expect(result.job.fallbackItemsCount).toBe(0);
    expect(repository.getGeneratedItemsCount()).toBe(2);

    const items = repository.getJobItems(result.job.id);
    expect(items.every((item) => item.status === "generated")).toBe(true);
  });

  it("marks fallback when provider is unavailable and keeps run partial", async () => {
    const repository = new FakeTagGenerationRepository([
      { itemId: "item-1", zoteroItemKey: "KEY-1", title: "A", abstractNote: "B" }
    ]);
    const provider = new FakeProvider("unavailable");
    const service = new DefaultTagBackfillService(repository, provider);

    const result = await service.runBackfill();

    expect(result.job.status).toBe("partial");
    expect(result.job.generatedItemsCount).toBe(0);
    expect(result.job.fallbackItemsCount).toBe(1);
    expect(repository.getGeneratedItemsCount()).toBe(0);

    const items = repository.getJobItems(result.job.id);
    expect(items[0].status).toBe("skipped_unavailable");
    expect(items[0].usedFallback).toBe(true);
  });
});

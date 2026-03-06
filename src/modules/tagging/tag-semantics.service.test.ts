import { describe, expect, it } from "vitest";

import { DefaultTagSemanticsService } from "./tag-semantics.service";
import type { TagSemanticsRepository } from "./types";

class FakeTagSemanticsRepository implements TagSemanticsRepository {
  private signals = new Map<string, { attentionLevel: number; rawStarTags: string[]; otherTags: string[] }>();
  private contentTags = new Map<string, string[]>();

  constructor(
    private readonly items: Array<{ itemId: string; zoteroItemKey: string; rawTags: string[] }>
  ) {}

  async listItemsForParsing(input?: { zoteroItemKeys?: string[] }) {
    if (!input?.zoteroItemKeys || input.zoteroItemKeys.length === 0) {
      return this.items;
    }

    return this.items.filter((item) => input.zoteroItemKeys?.includes(item.zoteroItemKey));
  }

  async upsertTagSignal(input: {
    itemId: string;
    attentionLevel: number;
    rawStarTags: string[];
    otherTags: string[];
  }) {
    this.signals.set(input.itemId, {
      attentionLevel: input.attentionLevel,
      rawStarTags: input.rawStarTags,
      otherTags: input.otherTags
    });
  }

  async replaceContentTags(input: { itemId: string; contentTags: string[] }) {
    this.contentTags.set(input.itemId, input.contentTags);
  }

  async getSummary() {
    const maxAttentionLevel = Math.max(
      0,
      ...Array.from(this.signals.values()).map((signal) => signal.attentionLevel)
    );

    return {
      itemsWithSignals: this.signals.size,
      contentTags: Array.from(this.contentTags.values()).reduce((acc, tags) => acc + tags.length, 0),
      maxAttentionLevel
    };
  }
}

describe("DefaultTagSemanticsService", () => {
  it("parses and persists tag semantics", async () => {
    const repository = new FakeTagSemanticsRepository([
      {
        itemId: "item-1",
        zoteroItemKey: "key-1",
        rawTags: ["\u2B50\u2B50", "#topic", "normal"]
      },
      {
        itemId: "item-2",
        zoteroItemKey: "key-2",
        rawTags: ["#another"]
      }
    ]);

    const service = new DefaultTagSemanticsService(repository);

    const result = await service.parseAndPersist();
    expect(result).toEqual({
      itemsProcessed: 2,
      signalsUpdated: 2,
      contentTagsStored: 2
    });

    const summary = await service.getSummary();
    expect(summary).toEqual({
      itemsWithSignals: 2,
      contentTags: 2,
      maxAttentionLevel: 2
    });
  });
});

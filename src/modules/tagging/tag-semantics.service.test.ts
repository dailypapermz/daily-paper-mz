import { describe, expect, it } from "vitest";

import { DefaultTagSemanticsService } from "./tag-semantics.service";
import type {
  ParsedStructuredContentTag,
  TagSemanticsRepository,
  TagParseSummary
} from "./types";

class FakeTagSemanticsRepository implements TagSemanticsRepository {
  private signals = new Map<string, { attentionLevel: number; rawStarTags: string[]; otherTags: string[] }>();
  private contentTags = new Map<string, string[]>();
  private structuredTags = new Map<string, ParsedStructuredContentTag[]>();

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

  async replaceStructuredTags(input: { itemId: string; tags: ParsedStructuredContentTag[] }) {
    this.structuredTags.set(input.itemId, input.tags);
  }

  async getSummary(): Promise<TagParseSummary> {
    const allStructured = Array.from(this.structuredTags.values()).flat();

    return {
      itemsWithSignals: this.signals.size,
      contentTags: Array.from(this.contentTags.values()).reduce((acc, tags) => acc + tags.length, 0),
      maxAttentionLevel: Math.max(
        0,
        ...Array.from(this.signals.values()).map((signal) => signal.attentionLevel)
      ),
      contentRecallTags: allStructured.filter((tag) => tag.tagType === "content_recall").length,
      researchTypeTags: allStructured.filter((tag) => tag.tagType === "research_type").length,
      invalidResearchTypeTags: allStructured.filter(
        (tag) => tag.tagType === "research_type" && tag.parseStatus === "invalid_category"
      ).length
    };
  }
}

describe("DefaultTagSemanticsService", () => {
  it("parses and persists tag semantics with structured Tag1/Tag2 forms", async () => {
    const repository = new FakeTagSemanticsRepository([
      {
        itemId: "item-1",
        zoteroItemKey: "key-1",
        rawTags: [
          "\u2B50\u2B50",
          "#single-cell trajectory inference",
          "#method | foundation model, multi-omics",
          "normal"
        ]
      },
      {
        itemId: "item-2",
        zoteroItemKey: "key-2",
        rawTags: ["#invalid | keyword1, keyword2"]
      }
    ]);

    const service = new DefaultTagSemanticsService(repository);

    const result = await service.parseAndPersist();
    expect(result).toEqual({
      itemsProcessed: 2,
      signalsUpdated: 2,
      contentTagsStored: 3,
      contentRecallTagsStored: 1,
      researchTypeTagsStored: 2,
      invalidResearchTypeTags: 1
    });

    const summary = await service.getSummary();
    expect(summary).toEqual({
      itemsWithSignals: 2,
      contentTags: 3,
      maxAttentionLevel: 2,
      contentRecallTags: 1,
      researchTypeTags: 2,
      invalidResearchTypeTags: 1
    });
  });
});

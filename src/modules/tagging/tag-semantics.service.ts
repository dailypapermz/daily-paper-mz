import { parseZoteroTagSemantics } from "./tag-parser";
import { parseStructuredContentTag } from "./structured-tag-parser";
import type { TagSemanticsRepository, TagSemanticsService } from "./types";

export class DefaultTagSemanticsService implements TagSemanticsService {
  constructor(private readonly repository: TagSemanticsRepository) {}

  async parseAndPersist(input?: { zoteroItemKeys?: string[] }) {
    const items = await this.repository.listItemsForParsing(input);

    let signalsUpdated = 0;
    let contentTagsStored = 0;
    let contentRecallTagsStored = 0;
    let researchTypeTagsStored = 0;
    let invalidResearchTypeTags = 0;

    for (const item of items) {
      const parsed = parseZoteroTagSemantics(item.rawTags);
      const structuredTags = parsed.contentTags.map((rawTag) => parseStructuredContentTag(rawTag));

      await this.repository.upsertTagSignal({
        itemId: item.itemId,
        attentionLevel: parsed.attentionLevel,
        rawStarTags: parsed.rawStarTags,
        otherTags: parsed.otherTags
      });

      await this.repository.replaceContentTags({
        itemId: item.itemId,
        contentTags: parsed.contentTags
      });

      await this.repository.replaceStructuredTags({
        itemId: item.itemId,
        tags: structuredTags
      });

      signalsUpdated += 1;
      contentTagsStored += parsed.contentTags.length;
      contentRecallTagsStored += structuredTags.filter((tag) => tag.tagType === "content_recall").length;
      researchTypeTagsStored += structuredTags.filter((tag) => tag.tagType === "research_type").length;
      invalidResearchTypeTags += structuredTags.filter(
        (tag) => tag.tagType === "research_type" && tag.parseStatus === "invalid_category"
      ).length;
    }

    return {
      itemsProcessed: items.length,
      signalsUpdated,
      contentTagsStored,
      contentRecallTagsStored,
      researchTypeTagsStored,
      invalidResearchTypeTags
    };
  }

  async getSummary() {
    return this.repository.getSummary();
  }
}

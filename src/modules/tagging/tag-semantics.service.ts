import { parseZoteroTagSemantics } from "./tag-parser";
import type { TagSemanticsRepository, TagSemanticsService } from "./types";

export class DefaultTagSemanticsService implements TagSemanticsService {
  constructor(private readonly repository: TagSemanticsRepository) {}

  async parseAndPersist(input?: { zoteroItemKeys?: string[] }) {
    const items = await this.repository.listItemsForParsing(input);

    let signalsUpdated = 0;
    let contentTagsStored = 0;

    for (const item of items) {
      const parsed = parseZoteroTagSemantics(item.rawTags);

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

      signalsUpdated += 1;
      contentTagsStored += parsed.contentTags.length;
    }

    return {
      itemsProcessed: items.length,
      signalsUpdated,
      contentTagsStored
    };
  }

  async getSummary() {
    return this.repository.getSummary();
  }
}

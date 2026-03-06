import type { Prisma, PrismaClient } from "../../generated/prisma";
import type { TagSemanticsRepository } from "../../modules/tagging/types";

export class PrismaZoteroTagRepository implements TagSemanticsRepository {
  constructor(private readonly db: PrismaClient) {}

  async listItemsForParsing(input?: { zoteroItemKeys?: string[] }) {
    const items = await this.db.zoteroItemRaw.findMany({
      where:
        input?.zoteroItemKeys && input.zoteroItemKeys.length > 0
          ? { zoteroItemKey: { in: input.zoteroItemKeys } }
          : undefined,
      select: {
        id: true,
        zoteroItemKey: true,
        rawTagsJson: true
      }
    });

    return items.map((item) => ({
      itemId: item.id,
      zoteroItemKey: item.zoteroItemKey,
      rawTags: toStringArray(item.rawTagsJson)
    }));
  }

  async upsertTagSignal(input: {
    itemId: string;
    attentionLevel: number;
    rawStarTags: string[];
    otherTags: string[];
  }) {
    const data: Prisma.ZoteroItemTagSignalUncheckedCreateInput = {
      itemId: input.itemId,
      attentionLevel: input.attentionLevel,
      rawStarTagsJson: input.rawStarTags,
      otherTagsJson: input.otherTags,
      parsedAt: new Date()
    };

    await this.db.zoteroItemTagSignal.upsert({
      where: { itemId: input.itemId },
      create: data,
      update: data
    });
  }

  async replaceContentTags(input: { itemId: string; contentTags: string[] }) {
    const uniqueTags = Array.from(new Set(input.contentTags.map((tag) => tag.trim()).filter(Boolean)));

    await this.db.$transaction(async (tx) => {
      await tx.zoteroItemContentTag.deleteMany({ where: { itemId: input.itemId } });

      if (uniqueTags.length > 0) {
        await tx.zoteroItemContentTag.createMany({
          data: uniqueTags.map((rawTag) => ({
            itemId: input.itemId,
            rawTag
          }))
        });
      }
    });
  }

  async getSummary() {
    const [itemsWithSignals, contentTags, aggregate] = await Promise.all([
      this.db.zoteroItemTagSignal.count(),
      this.db.zoteroItemContentTag.count(),
      this.db.zoteroItemTagSignal.aggregate({
        _max: { attentionLevel: true }
      })
    ]);

    return {
      itemsWithSignals,
      contentTags,
      maxAttentionLevel: aggregate._max.attentionLevel ?? 0
    };
  }
}

function toStringArray(value: Prisma.JsonValue | null): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

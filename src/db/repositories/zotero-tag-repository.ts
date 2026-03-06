import type { Prisma, PrismaClient } from "../../generated/prisma";
import type {
  ParsedStructuredContentTag,
  ResearchTypeCategoryValue,
  StructuredTagParseStatusValue,
  TagSemanticsRepository
} from "../../modules/tagging/types";

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

  async replaceStructuredTags(input: { itemId: string; tags: ParsedStructuredContentTag[] }) {
    await this.db.$transaction(async (tx) => {
      await tx.zoteroItemContentRecallTag.deleteMany({ where: { itemId: input.itemId } });
      await tx.zoteroItemResearchTypeTag.deleteMany({ where: { itemId: input.itemId } });

      const contentRecallTags = input.tags.filter((tag) => tag.tagType === "content_recall");
      const researchTypeTags = input.tags.filter((tag) => tag.tagType === "research_type");

      if (contentRecallTags.length > 0) {
        await tx.zoteroItemContentRecallTag.createMany({
          data: contentRecallTags.map((tag) => ({
            itemId: input.itemId,
            rawTag: tag.rawTag,
            label: tag.contentRecallLabel ?? null,
            parseStatus: toDbParseStatus(tag.parseStatus)
          }))
        });
      }

      if (researchTypeTags.length > 0) {
        await tx.zoteroItemResearchTypeTag.createMany({
          data: researchTypeTags.map((tag) => ({
            itemId: input.itemId,
            rawTag: tag.rawTag,
            rawCategoryToken: tag.rawCategoryToken ?? null,
            category: tag.researchCategory ? toDbResearchTypeCategory(tag.researchCategory) : null,
            primaryKeyword: tag.primaryKeyword ?? null,
            secondaryKeyword: tag.secondaryKeyword ?? null,
            parseStatus: toDbParseStatus(tag.parseStatus)
          }))
        });
      }
    });
  }

  async getSummary() {
    const [itemsWithSignals, contentTags, contentRecallTags, researchTypeTags, invalidResearchTypeTags, aggregate] =
      await Promise.all([
        this.db.zoteroItemTagSignal.count(),
        this.db.zoteroItemContentTag.count(),
        this.db.zoteroItemContentRecallTag.count(),
        this.db.zoteroItemResearchTypeTag.count(),
        this.db.zoteroItemResearchTypeTag.count({
          where: { parseStatus: "INVALID_CATEGORY" }
        }),
        this.db.zoteroItemTagSignal.aggregate({
          _max: { attentionLevel: true }
        })
      ]);

    return {
      itemsWithSignals,
      contentTags,
      maxAttentionLevel: aggregate._max.attentionLevel ?? 0,
      contentRecallTags,
      researchTypeTags,
      invalidResearchTypeTags
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

function toDbResearchTypeCategory(category: ResearchTypeCategoryValue) {
  switch (category) {
    case "method":
      return "METHOD";
    case "biology":
      return "BIOLOGY";
    case "resource":
      return "RESOURCE";
    default:
      return "BENCHMARK";
  }
}

function toDbParseStatus(status: StructuredTagParseStatusValue) {
  switch (status) {
    case "parsed":
      return "PARSED";
    case "partial":
      return "PARTIAL";
    case "invalid_category":
      return "INVALID_CATEGORY";
    default:
      return "UNPARSED";
  }
}

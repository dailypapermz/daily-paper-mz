import type { Prisma, PrismaClient } from "../../generated/prisma";
import { toIsoDate } from "../../lib/utils";
import type {
  GeneratedStructuredTags,
  ParsedStructuredContentTag,
  ResearchTypeCategoryValue,
  StructuredTagParseStatusValue,
  TagGenerationItemStatusValue,
  TagGenerationJobStatusValue,
  TagGenerationJobSummary,
  TagGenerationRepository,
  TagSemanticsRepository
} from "../../modules/tagging/types";

export class PrismaZoteroTagRepository implements TagSemanticsRepository, TagGenerationRepository {
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

  async listSelectedItemsMissingContentTags(input?: { limit?: number }) {
    const selectedItems = await this.db.zoteroItemRaw.findMany({
      where: {
        itemCollections: {
          some: {
            collection: {
              effectivePriority: {
                is: {
                  priority: {
                    in: ["PRIMARY", "SECONDARY"]
                  }
                }
              }
            }
          }
        },
        contentTags: {
          none: {}
        },
        contentRecallTags: {
          none: {
            provenance: "GENERATED"
          }
        },
        researchTypeTags: {
          none: {
            provenance: "GENERATED"
          }
        }
      },
      orderBy: [{ dateAdded: "desc" }, { updatedAt: "desc" }],
      ...(input?.limit && input.limit > 0 ? { take: input.limit } : {}),
      select: {
        id: true,
        zoteroItemKey: true,
        title: true,
        abstractNote: true
      }
    });

    return selectedItems.map((item) => ({
      itemId: item.id,
      zoteroItemKey: item.zoteroItemKey,
      title: item.title ?? undefined,
      abstractNote: item.abstractNote ?? undefined
    }));
  }

  async createGenerationJob(input: { provider: string }) {
    const job = await this.db.zoteroTagGenerationJob.create({
      data: {
        provider: input.provider,
        status: "RUNNING"
      },
      select: {
        id: true
      }
    });

    return { id: job.id };
  }

  async appendGenerationJobItem(input: {
    jobId: string;
    itemId: string;
    status: TagGenerationItemStatusValue;
    usedFallback: boolean;
    errorMessage?: string;
  }) {
    const data: Prisma.ZoteroTagGenerationJobItemUncheckedCreateInput = {
      jobId: input.jobId,
      itemId: input.itemId,
      status: toDbGenerationItemStatus(input.status),
      usedFallback: input.usedFallback,
      errorMessage: input.errorMessage ?? null
    };

    await this.db.zoteroTagGenerationJobItem.upsert({
      where: {
        jobId_itemId: {
          jobId: input.jobId,
          itemId: input.itemId
        }
      },
      create: data,
      update: data
    });
  }

  async replaceGeneratedStructuredTags(input: {
    itemId: string;
    jobId: string;
    generated: GeneratedStructuredTags;
  }) {
    await this.db.$transaction(async (tx) => {
      await tx.zoteroItemContentRecallTag.deleteMany({
        where: { itemId: input.itemId, provenance: "GENERATED" }
      });
      await tx.zoteroItemResearchTypeTag.deleteMany({
        where: { itemId: input.itemId, provenance: "GENERATED" }
      });

      await tx.zoteroItemContentRecallTag.create({
        data: {
          itemId: input.itemId,
          rawTag: toContentRecallRawTag(input.generated.contentRecallLabel),
          label: input.generated.contentRecallLabel,
          provenance: "GENERATED",
          generationJobId: input.jobId,
          parseStatus: "PARSED"
        }
      });

      await tx.zoteroItemResearchTypeTag.create({
        data: {
          itemId: input.itemId,
          rawTag: toResearchTypeRawTag(input.generated),
          rawCategoryToken: input.generated.researchCategory,
          category: toDbResearchTypeCategory(input.generated.researchCategory),
          primaryKeyword: input.generated.primaryKeyword,
          secondaryKeyword: input.generated.secondaryKeyword ?? null,
          provenance: "GENERATED",
          generationJobId: input.jobId,
          parseStatus: "PARSED"
        }
      });
    });
  }

  async markGenerationJobFinished(input: {
    jobId: string;
    status: TagGenerationJobStatusValue;
    selectedItemsCount: number;
    missingItemsCount: number;
    generatedItemsCount: number;
    fallbackItemsCount: number;
    errorMessage?: string;
  }) {
    const job = await this.db.zoteroTagGenerationJob.update({
      where: { id: input.jobId },
      data: {
        status: toDbGenerationJobStatus(input.status),
        finishedAt: new Date(),
        selectedItemsCount: input.selectedItemsCount,
        missingItemsCount: input.missingItemsCount,
        generatedItemsCount: input.generatedItemsCount,
        fallbackItemsCount: input.fallbackItemsCount,
        errorMessage: input.errorMessage ?? null
      }
    });

    return mapJobSummary(job);
  }

  async getLatestGenerationJob(): Promise<TagGenerationJobSummary | null> {
    const job = await this.db.zoteroTagGenerationJob.findFirst({
      orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }]
    });

    if (!job) {
      return null;
    }

    return mapJobSummary(job);
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

function toDbGenerationJobStatus(status: TagGenerationJobStatusValue) {
  if (status === "running") {
    return "RUNNING";
  }
  if (status === "success") {
    return "SUCCESS";
  }
  if (status === "partial") {
    return "PARTIAL";
  }
  return "FAILED";
}

function toDbGenerationItemStatus(status: TagGenerationItemStatusValue) {
  if (status === "generated") {
    return "GENERATED";
  }
  if (status === "skipped_unavailable") {
    return "SKIPPED_UNAVAILABLE";
  }
  return "FAILED";
}

function fromDbGenerationJobStatus(status: "RUNNING" | "SUCCESS" | "PARTIAL" | "FAILED") {
  if (status === "RUNNING") {
    return "running";
  }
  if (status === "SUCCESS") {
    return "success";
  }
  if (status === "PARTIAL") {
    return "partial";
  }
  return "failed";
}

function mapJobSummary(job: {
  id: string;
  status: "RUNNING" | "SUCCESS" | "PARTIAL" | "FAILED";
  provider: string;
  startedAt: Date;
  finishedAt: Date | null;
  selectedItemsCount: number;
  missingItemsCount: number;
  generatedItemsCount: number;
  fallbackItemsCount: number;
  errorMessage: string | null;
}): TagGenerationJobSummary {
  return {
    id: job.id,
    status: fromDbGenerationJobStatus(job.status),
    provider: job.provider,
    startedAt: toIsoDate(job.startedAt),
    finishedAt: job.finishedAt ? toIsoDate(job.finishedAt) : undefined,
    selectedItemsCount: job.selectedItemsCount,
    missingItemsCount: job.missingItemsCount,
    generatedItemsCount: job.generatedItemsCount,
    fallbackItemsCount: job.fallbackItemsCount,
    errorMessage: job.errorMessage ?? undefined
  };
}

function toContentRecallRawTag(label: string): string {
  const normalized = label.trim();
  return normalized.startsWith("#") ? normalized : `#${normalized}`;
}

function toResearchTypeRawTag(generated: GeneratedStructuredTags): string {
  const category = generated.researchCategory;
  const primary = generated.primaryKeyword.trim();
  const secondary = generated.secondaryKeyword?.trim();
  if (secondary) {
    return `#${category} | ${primary}, ${secondary}`;
  }
  return `#${category} | ${primary}`;
}

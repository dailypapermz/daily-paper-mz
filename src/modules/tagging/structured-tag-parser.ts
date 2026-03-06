import type {
  ParsedStructuredContentTag,
  ResearchTypeCategoryValue,
  StructuredTagParseStatusValue
} from "./types";

const RESEARCH_TYPE_CATEGORIES = new Set<ResearchTypeCategoryValue>([
  "method",
  "biology",
  "resource",
  "benchmark"
]);

export function parseStructuredContentTag(rawTag: string): ParsedStructuredContentTag {
  const normalizedRawTag = rawTag.trim();
  const withoutHashPrefix = normalizedRawTag.startsWith("#")
    ? normalizedRawTag.slice(1).trim()
    : normalizedRawTag;

  if (!withoutHashPrefix) {
    return {
      rawTag: normalizedRawTag,
      tagType: "content_recall",
      parseStatus: "unparsed"
    };
  }

  const delimiterIndex = withoutHashPrefix.indexOf("|");
  if (delimiterIndex === -1) {
    return {
      rawTag: normalizedRawTag,
      tagType: "content_recall",
      parseStatus: "parsed",
      contentRecallLabel: withoutHashPrefix
    };
  }

  const rawCategoryToken = withoutHashPrefix.slice(0, delimiterIndex).trim();
  const category = rawCategoryToken.toLowerCase() as ResearchTypeCategoryValue;
  const rightSide = withoutHashPrefix.slice(delimiterIndex + 1).trim();
  const keywords = rightSide
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  const primaryKeyword = keywords[0];
  const secondaryKeyword = keywords[1];

  if (!RESEARCH_TYPE_CATEGORIES.has(category)) {
    return {
      rawTag: normalizedRawTag,
      tagType: "research_type",
      parseStatus: "invalid_category",
      rawCategoryToken,
      primaryKeyword,
      secondaryKeyword
    };
  }

  const parseStatus: StructuredTagParseStatusValue = primaryKeyword ? "parsed" : "partial";

  return {
    rawTag: normalizedRawTag,
    tagType: "research_type",
    parseStatus,
    rawCategoryToken,
    researchCategory: category,
    primaryKeyword,
    secondaryKeyword
  };
}

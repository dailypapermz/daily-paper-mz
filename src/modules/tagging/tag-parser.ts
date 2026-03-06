import type { ParsedTagSemantics } from "./types";

const STAR_TAG_PATTERN = /^(?:\u2B50|\u2605)+$/u;
const STAR_MATCH_PATTERN = /\u2B50|\u2605/gu;

export function parseZoteroTagSemantics(rawTags: string[]): ParsedTagSemantics {
  const dedupedTags = dedupe(rawTags.map((tag) => tag.trim()).filter(Boolean));

  const rawStarTags: string[] = [];
  const contentTags: string[] = [];
  const otherTags: string[] = [];

  let attentionLevel = 0;

  for (const tag of dedupedTags) {
    const starLevel = getStarAttentionLevel(tag);

    if (starLevel !== null) {
      rawStarTags.push(tag);
      attentionLevel = Math.max(attentionLevel, starLevel);
      continue;
    }

    if (isContentTag(tag)) {
      contentTags.push(tag);
      continue;
    }

    otherTags.push(tag);
  }

  return {
    attentionLevel,
    rawStarTags,
    contentTags,
    otherTags
  };
}

function isContentTag(tag: string): boolean {
  return tag.startsWith("#") && tag.length > 1;
}

function getStarAttentionLevel(tag: string): number | null {
  const compact = tag.replace(/\s+/g, "");

  if (!STAR_TAG_PATTERN.test(compact)) {
    return null;
  }

  const stars = compact.match(STAR_MATCH_PATTERN)?.length ?? 0;
  if (stars === 0) {
    return null;
  }

  return Math.min(stars, 5);
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}

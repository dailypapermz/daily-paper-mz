import { describe, expect, it } from "vitest";

import { parseZoteroTagSemantics } from "./tag-parser";

describe("parseZoteroTagSemantics", () => {
  it("separates star tags and content tags while preserving others", () => {
    const parsed = parseZoteroTagSemantics([
      "\u2B50",
      "biology",
      "#single-cell",
      "\u2B50\u2B50\u2B50"
    ]);

    expect(parsed.attentionLevel).toBe(3);
    expect(parsed.rawStarTags).toEqual(["\u2B50", "\u2B50\u2B50\u2B50"]);
    expect(parsed.contentTags).toEqual(["#single-cell"]);
    expect(parsed.otherTags).toEqual(["biology"]);
  });

  it("handles alternative star glyphs and deduplicates tags", () => {
    const parsed = parseZoteroTagSemantics([
      " \u2605\u2605 ",
      "\u2605\u2605",
      "#gene",
      "#gene",
      "topic"
    ]);

    expect(parsed.attentionLevel).toBe(2);
    expect(parsed.rawStarTags).toEqual(["\u2605\u2605"]);
    expect(parsed.contentTags).toEqual(["#gene"]);
    expect(parsed.otherTags).toEqual(["topic"]);
  });

  it("does not treat bare hash as content tag", () => {
    const parsed = parseZoteroTagSemantics(["#", "normal"]);

    expect(parsed.attentionLevel).toBe(0);
    expect(parsed.contentTags).toEqual([]);
    expect(parsed.otherTags).toEqual(["#", "normal"]);
  });
});

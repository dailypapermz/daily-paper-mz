import { describe, expect, it } from "vitest";

import { parseStructuredContentTag } from "./structured-tag-parser";

describe("parseStructuredContentTag", () => {
  it("parses content-recall tags as Tag1", () => {
    const parsed = parseStructuredContentTag("#single-cell trajectory inference");

    expect(parsed.tagType).toBe("content_recall");
    expect(parsed.parseStatus).toBe("parsed");
    expect(parsed.contentRecallLabel).toBe("single-cell trajectory inference");
  });

  it("parses research-type tags as Tag2", () => {
    const parsed = parseStructuredContentTag("#method | foundation model, multi-omics");

    expect(parsed.tagType).toBe("research_type");
    expect(parsed.parseStatus).toBe("parsed");
    expect(parsed.researchCategory).toBe("method");
    expect(parsed.primaryKeyword).toBe("foundation model");
    expect(parsed.secondaryKeyword).toBe("multi-omics");
  });

  it("preserves raw text for invalid category", () => {
    const parsed = parseStructuredContentTag("#invalid | keyword1, keyword2");

    expect(parsed.tagType).toBe("research_type");
    expect(parsed.parseStatus).toBe("invalid_category");
    expect(parsed.rawCategoryToken).toBe("invalid");
    expect(parsed.researchCategory).toBeUndefined();
    expect(parsed.primaryKeyword).toBe("keyword1");
    expect(parsed.secondaryKeyword).toBe("keyword2");
  });

  it("marks bare hash as unparsed Tag1", () => {
    const parsed = parseStructuredContentTag("#");

    expect(parsed.tagType).toBe("content_recall");
    expect(parsed.parseStatus).toBe("unparsed");
  });
});

import { describe, expect, it } from "vitest";

import { AppError } from "../../lib/errors";
import { classifyArxivFailure } from "./arxiv-diagnostics";

describe("classifyArxivFailure", () => {
  it("classifies missing scopes as a non-retryable configuration failure", () => {
    expect(classifyArxivFailure(new AppError(
      "ARXIV_SCOPE_REQUIRED",
      "raw configuration error",
      400,
      { failureCategory: "configuration_error", privateValue: "do-not-expose" }
    ))).toEqual({
      source: "arxiv",
      failureCode: "ARXIV_SCOPE_REQUIRED",
      stage: "configuration",
      failureCategory: "configuration_error",
      retryable: false
    });
  });

  it("returns only allow-listed request diagnostics", () => {
    const diagnostic = classifyArxivFailure(new AppError(
      "ARXIV_API_ERROR",
      "token=do-not-expose",
      502,
      {
        failureCategory: "timeout",
        responseBody: "do-not-expose",
        endpointUrl: "https://example.invalid/?token=do-not-expose"
      }
    ));

    expect(diagnostic).toEqual({
      source: "arxiv",
      failureCode: "ARXIV_API_ERROR",
      stage: "request",
      failureCategory: "timeout",
      retryable: true
    });
    expect(JSON.stringify(diagnostic)).not.toContain("do-not-expose");
  });
});

import { describe, expect, it } from "vitest";

import {
  createCandidateOutputProvider,
  GenericLlmCandidateOutputProvider,
  UnavailableCandidateOutputProvider
} from "./candidate-output.provider";

describe("createCandidateOutputProvider", () => {
  it("returns unavailable provider when api config is missing", () => {
    const provider = createCandidateOutputProvider({});

    expect(provider).toBeInstanceOf(UnavailableCandidateOutputProvider);
  });

  it("uses configured model when provided", () => {
    const provider = createCandidateOutputProvider({
      apiKey: "token",
      apiBaseUrl: "https://example.com/v1",
      model: "glm-4.6v"
    });

    expect(provider).toBeInstanceOf(GenericLlmCandidateOutputProvider);
    expect((provider as GenericLlmCandidateOutputProvider)["model"]).toBe("glm-4.6v");
  });

  it("falls back to the default model when model is blank", () => {
    const provider = createCandidateOutputProvider({
      apiKey: "token",
      apiBaseUrl: "https://example.com/v1",
      model: "   "
    });

    expect(provider).toBeInstanceOf(GenericLlmCandidateOutputProvider);
    expect((provider as GenericLlmCandidateOutputProvider)["model"]).toBe("gpt-4o-mini");
  });
});

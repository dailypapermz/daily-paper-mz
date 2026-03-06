import { getEnv } from "../../lib/config";
import { AppError } from "../../lib/errors";
import type { GeneratedStructuredTags, TagGenerationProvider } from "./types";

export class UnavailableTagGenerationProvider implements TagGenerationProvider {
  constructor(public readonly name: string) {}

  async generateStructuredTags(): Promise<GeneratedStructuredTags> {
    throw new AppError(
      "TAG_GENERATION_UNAVAILABLE",
      "No wired tag generation provider is available; use title+abstract fallback.",
      503,
      {
        provider: this.name
      }
    );
  }
}

export function createTagGenerationProvider(): TagGenerationProvider {
  const env = getEnv();

  if (env.LLM_API_KEY && env.LLM_API_BASE_URL) {
    return new UnavailableTagGenerationProvider("llm_configured_but_unwired");
  }

  return new UnavailableTagGenerationProvider("no_provider_configured");
}

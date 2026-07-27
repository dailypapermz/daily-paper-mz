import { prisma } from "../../db/prisma/client";
import { PrismaCandidateOutputRepository } from "../../db/repositories/candidate-output-repository";
import { getEnv } from "../../lib/config";
import { createCandidateOutputProvider } from "./candidate-output.provider";
import { DefaultCandidateOutputService } from "./candidate-output.service";
import type { CandidateOutputProvider } from "./types";

export function createCandidateOutputService(provider?: CandidateOutputProvider) {
  const env = getEnv();
  const repository = new PrismaCandidateOutputRepository(prisma);
  const resolvedProvider =
    provider ??
    createCandidateOutputProvider({
      apiKey: env.LLM_API_KEY,
      apiBaseUrl: env.LLM_API_BASE_URL,
      model: env.LLM_MODEL,
      timeoutMs: env.LLM_TIMEOUT_MS,
      maxRetries: env.LLM_MAX_RETRIES,
      concurrency: env.LLM_CONCURRENCY
    });

  return new DefaultCandidateOutputService(repository, resolvedProvider, {
    concurrency: env.LLM_CONCURRENCY,
    labelCandidateLimit: env.LLM_LABEL_CANDIDATE_LIMIT
  });
}

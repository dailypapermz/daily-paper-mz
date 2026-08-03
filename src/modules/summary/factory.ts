import { getApplicationPrismaClient } from "../../db/prisma/application-client";
import { PrismaCandidateOutputRepository } from "../../db/repositories/candidate-output-repository";
import { getEnv } from "../../lib/config";
import {
  createCandidateOutputProvider,
  UnavailableCandidateOutputProvider
} from "./candidate-output.provider";
import { DefaultCandidateOutputService } from "./candidate-output.service";
import type { CandidateOutputProvider } from "./types";

export function createCandidateOutputService(
  provider?: CandidateOutputProvider,
  options: { allowGeneration?: boolean } = {}
) {
  const prisma = getApplicationPrismaClient();
  const repository = new PrismaCandidateOutputRepository(prisma);
  if (options.allowGeneration === false) {
    return new DefaultCandidateOutputService(
      repository,
      provider ?? new UnavailableCandidateOutputProvider("Generation is not available in this runtime."),
      { concurrency: 1, labelCandidateLimit: 1 }
    );
  }

  const env = getEnv();
  const resolvedProvider =
    provider ??
    createCandidateOutputProvider({
      provider: env.LLM_PROVIDER,
      apiKey: env.LLM_API_KEY,
      apiBaseUrl: env.LLM_BASE_URL,
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

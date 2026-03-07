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
      apiBaseUrl: env.LLM_API_BASE_URL
    });

  return new DefaultCandidateOutputService(repository, resolvedProvider);
}

import { getApplicationPrismaClient } from "../../db/prisma/application-client";
import { PrismaJournalEnrichmentRepository } from "../../db/repositories";
import { getEnv } from "../../lib/config";
import { createJournalEnrichmentProvider } from "./journal-enrichment.provider";
import { DefaultJournalEnrichmentService } from "./journal-enrichment.service";
import type { JournalEnrichmentProvider } from "./types";

export function createJournalEnrichmentService(provider?: JournalEnrichmentProvider) {
  const prisma = getApplicationPrismaClient();
  const env = getEnv();
  const repository = new PrismaJournalEnrichmentRepository(prisma);
  const resolvedProvider =
    provider ??
    createJournalEnrichmentProvider({
      apiKey: env.EASYSCHOLAR_API_KEY,
      apiUrl: env.EASYSCHOLAR_API_URL
    });

  return new DefaultJournalEnrichmentService(repository, resolvedProvider, {
    cacheTtlHours: env.JOURNAL_ENRICHMENT_CACHE_TTL_HOURS
  });
}

import { getEnv } from "../../lib/config";
import { prisma } from "../../db/prisma/client";
import { PrismaDailyIngestionRepository } from "../../db/repositories";
import { ArxivSourceAdapter } from "./arxiv-adapter";
import { BioRxivSourceAdapter } from "./biorxiv-adapter";
import { createAdapterMap, DefaultDailyIngestionService } from "./ingestion-foundation.service";
import type { DailySourceAdapter } from "./types";

export function createDailyIngestionService(adapters: DailySourceAdapter[] = []) {
  const env = getEnv();
  const repository = new PrismaDailyIngestionRepository(prisma);
  const builtInAdapters: DailySourceAdapter[] = [
    new BioRxivSourceAdapter({
      subjectScopes: env.BIORXIV_SUBJECT_SCOPES
    }),
    new ArxivSourceAdapter({
      categoryScopes: env.ARXIV_CATEGORY_SCOPES
    })
  ];

  const adapterMap = createAdapterMap([...builtInAdapters, ...adapters]);
  return new DefaultDailyIngestionService(adapterMap, repository);
}

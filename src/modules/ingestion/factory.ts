import { prisma } from "../../db/prisma/client";
import { PrismaDailyIngestionRepository } from "../../db/repositories";
import { createAdapterMap, DefaultDailyIngestionService } from "./ingestion-foundation.service";
import type { DailySourceAdapter } from "./types";

export function createDailyIngestionService(adapters: DailySourceAdapter[] = []) {
  const repository = new PrismaDailyIngestionRepository(prisma);
  const adapterMap = createAdapterMap(adapters);
  return new DefaultDailyIngestionService(adapterMap, repository);
}

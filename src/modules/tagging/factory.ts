import { prisma } from "../../db/prisma/client";
import { PrismaZoteroTagRepository } from "../../db/repositories/zotero-tag-repository";
import { DefaultTagBackfillService } from "./tag-backfill.service";
import { createTagGenerationProvider } from "./tag-generation.provider";
import { DefaultTagSemanticsService } from "./tag-semantics.service";

export function createTagSemanticsService() {
  const repository = new PrismaZoteroTagRepository(prisma);
  return new DefaultTagSemanticsService(repository);
}

export function createTagBackfillService() {
  const repository = new PrismaZoteroTagRepository(prisma);
  const provider = createTagGenerationProvider();
  return new DefaultTagBackfillService(repository, provider);
}

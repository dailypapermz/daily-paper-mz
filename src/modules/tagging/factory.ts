import { prisma } from "../../db/prisma/client";
import { PrismaZoteroTagRepository } from "../../db/repositories/zotero-tag-repository";
import { DefaultTagSemanticsService } from "./tag-semantics.service";

export function createTagSemanticsService() {
  const repository = new PrismaZoteroTagRepository(prisma);
  return new DefaultTagSemanticsService(repository);
}

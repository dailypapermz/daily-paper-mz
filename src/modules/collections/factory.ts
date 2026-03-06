import { prisma } from "../../db/prisma/client";
import { PrismaCollectionPriorityRepository } from "../../db/repositories/collection-priority-repository";
import { DefaultCollectionPriorityService } from "./collection-priority.service";

export function createCollectionPriorityService() {
  const repository = new PrismaCollectionPriorityRepository(prisma);
  return new DefaultCollectionPriorityService(repository);
}

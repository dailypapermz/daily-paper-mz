import { getApplicationPrismaClient } from "../../db/prisma/application-client";
import { PrismaCollectionPriorityRepository } from "../../db/repositories/collection-priority-repository";
import { DefaultCollectionPriorityService } from "./collection-priority.service";

export function createCollectionPriorityService() {
  const prisma = getApplicationPrismaClient();
  const repository = new PrismaCollectionPriorityRepository(prisma);
  return new DefaultCollectionPriorityService(repository);
}

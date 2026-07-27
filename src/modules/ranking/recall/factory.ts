import { getApplicationPrismaClient } from "../../../db/prisma/application-client";
import { PrismaRecallRankingRepository } from "../../../db/repositories";
import { DefaultRecallRankingService } from "./recall-ranking.service";

export function createRecallRankingService() {
  const prisma = getApplicationPrismaClient();
  const repository = new PrismaRecallRankingRepository(prisma);
  return new DefaultRecallRankingService(repository);
}

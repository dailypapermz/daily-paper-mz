import { prisma } from "../../../db/prisma/client";
import { PrismaRecallRankingRepository } from "../../../db/repositories";
import { DefaultRecallRankingService } from "./recall-ranking.service";

export function createRecallRankingService() {
  const repository = new PrismaRecallRankingRepository(prisma);
  return new DefaultRecallRankingService(repository);
}

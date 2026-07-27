import { getApplicationPrismaClient } from "../../../db/prisma/application-client";
import { PrismaDailyRecommendationRepository } from "../../../db/repositories";
import { DefaultDailyRecommendationService } from "./daily-recommendations.service";

export function createDailyRecommendationService() {
  const prisma = getApplicationPrismaClient();
  const repository = new PrismaDailyRecommendationRepository(prisma);
  return new DefaultDailyRecommendationService(repository);
}

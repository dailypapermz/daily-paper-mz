import { prisma } from "../../../db/prisma/client";
import { PrismaDailyRecommendationRepository } from "../../../db/repositories";
import { DefaultDailyRecommendationService } from "./daily-recommendations.service";

export function createDailyRecommendationService() {
  const repository = new PrismaDailyRecommendationRepository(prisma);
  return new DefaultDailyRecommendationService(repository);
}

import { getApplicationPrismaClient } from "../../db/prisma/application-client";
import { PrismaFeedbackLogRepository } from "../../db/repositories";
import { DefaultFeedbackService } from "./feedback.service";

export function createFeedbackService() {
  const prisma = getApplicationPrismaClient();
  const repository = new PrismaFeedbackLogRepository(prisma);
  return new DefaultFeedbackService(repository);
}

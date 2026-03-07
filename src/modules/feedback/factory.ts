import { prisma } from "../../db/prisma/client";
import { PrismaFeedbackLogRepository } from "../../db/repositories";
import { DefaultFeedbackService } from "./feedback.service";

export function createFeedbackService() {
  const repository = new PrismaFeedbackLogRepository(prisma);
  return new DefaultFeedbackService(repository);
}

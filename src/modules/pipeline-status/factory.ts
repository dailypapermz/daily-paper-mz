import { getApplicationPrismaClient } from "../../db/prisma/application-client";
import { PrismaPipelineStageRepository } from "../../db/repositories/pipeline-stage-repository";
import { DefaultPipelineStageService } from "./pipeline-stage.service";

export function createPipelineStageService() {
  const prisma = getApplicationPrismaClient();
  return new DefaultPipelineStageService(new PrismaPipelineStageRepository(prisma));
}

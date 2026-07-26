import { prisma } from "../../db/prisma/client";
import { PrismaPipelineStageRepository } from "../../db/repositories/pipeline-stage-repository";
import { DefaultPipelineStageService } from "./pipeline-stage.service";

export function createPipelineStageService() {
  return new DefaultPipelineStageService(new PrismaPipelineStageRepository(prisma));
}

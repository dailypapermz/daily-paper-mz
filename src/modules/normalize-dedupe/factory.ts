import { getApplicationPrismaClient } from "../../db/prisma/application-client";
import { PrismaCandidateNormalizationRepository } from "../../db/repositories";
import { DefaultCandidateNormalizationService } from "./candidate-normalization.service";

export function createCandidateNormalizationService() {
  const prisma = getApplicationPrismaClient();
  const repository = new PrismaCandidateNormalizationRepository(prisma);
  return new DefaultCandidateNormalizationService(repository);
}

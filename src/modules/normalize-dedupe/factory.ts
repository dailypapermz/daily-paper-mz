import { prisma } from "../../db/prisma/client";
import { PrismaCandidateNormalizationRepository } from "../../db/repositories";
import { DefaultCandidateNormalizationService } from "./candidate-normalization.service";

export function createCandidateNormalizationService() {
  const repository = new PrismaCandidateNormalizationRepository(prisma);
  return new DefaultCandidateNormalizationService(repository);
}

import { getApplicationPrismaClient } from "../../../db/prisma/application-client";
import { PrismaRerankRepository } from "../../../db/repositories";
import { DefaultRerankService } from "./rerank.service";

export function createRerankService() {
  const prisma = getApplicationPrismaClient();
  const repository = new PrismaRerankRepository(prisma);
  return new DefaultRerankService(repository);
}

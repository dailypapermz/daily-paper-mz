import { prisma } from "../../../db/prisma/client";
import { PrismaRerankRepository } from "../../../db/repositories";
import { DefaultRerankService } from "./rerank.service";

export function createRerankService() {
  const repository = new PrismaRerankRepository(prisma);
  return new DefaultRerankService(repository);
}

import { getApplicationPrismaClient } from "../../db/prisma/application-client";
import { PrismaOperationsRepository } from "../../db/repositories/operations-repository";
import { GitHubOperationsDispatcher } from "./github-dispatcher";
import { OperationsService } from "./operations.service";

export function createOperationsService() {
  return new OperationsService(new PrismaOperationsRepository(getApplicationPrismaClient()));
}

export function createOperationsDispatcher() {
  return new GitHubOperationsDispatcher();
}

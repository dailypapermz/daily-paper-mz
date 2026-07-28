import { getApplicationPrismaClient } from "../../db/prisma/application-client";
import { getEnv } from "../../lib/config";
import { PrismaOperationsRepository } from "../../db/repositories/operations-repository";
import { GitHubOperationsDispatcher } from "./github-dispatcher";
import { OperationsService } from "./operations.service";

export function createOperationsService() {
  const env = getEnv();
  return new OperationsService(new PrismaOperationsRepository(getApplicationPrismaClient()), {
    pipelineStaleAfterMs: env.DAILY_RUN_STALE_AFTER_MINUTES * 60 * 1000
  });
}

export function createOperationsDispatcher() {
  return new GitHubOperationsDispatcher();
}

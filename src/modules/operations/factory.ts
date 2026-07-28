import { getApplicationPrismaClient } from "../../db/prisma/application-client";
import { PrismaOperationsRepository } from "../../db/repositories/operations-repository";
import { GitHubOperationsDispatcher } from "./github-dispatcher";
import {
  OPERATIONS_PIPELINE_STALE_AFTER_MS,
  OperationsService
} from "./operations.service";

export function createOperationsService() {
  return new OperationsService(new PrismaOperationsRepository(getApplicationPrismaClient()), {
    pipelineStaleAfterMs: resolveOperationsPipelineStaleAfterMs()
  });
}

export function createOperationsDispatcher() {
  return new GitHubOperationsDispatcher();
}

export function resolveOperationsPipelineStaleAfterMs(
  environment: Readonly<Record<string, string | undefined>> = process.env
): number {
  const rawMinutes = environment.DAILY_RUN_STALE_AFTER_MINUTES?.trim();
  if (!rawMinutes || !/^\d+$/.test(rawMinutes)) return OPERATIONS_PIPELINE_STALE_AFTER_MS;
  const milliseconds = Number(rawMinutes) * 60 * 1000;
  return Number.isSafeInteger(milliseconds) && milliseconds > 0
    ? milliseconds
    : OPERATIONS_PIPELINE_STALE_AFTER_MS;
}

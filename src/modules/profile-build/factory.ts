import { getApplicationPrismaClient } from "../../db/prisma/application-client";
import { PrismaProfileRefreshRepository } from "../../db/repositories/profile-refresh-repository";
import { PrismaProfileSnapshotRepository } from "../../db/repositories/profile-snapshot-repository";
import { DefaultProfileBuildService } from "./profile-build.service";
import { DefaultProfileRefreshService } from "./profile-refresh.service";

export function createProfileBuildService() {
  const prisma = getApplicationPrismaClient();
  const repository = new PrismaProfileSnapshotRepository(prisma);
  return new DefaultProfileBuildService(repository);
}

export function createProfileRefreshService() {
  const prisma = getApplicationPrismaClient();
  const snapshotRepository = new PrismaProfileSnapshotRepository(prisma);
  const refreshRepository = new PrismaProfileRefreshRepository(prisma);
  const buildService = new DefaultProfileBuildService(snapshotRepository);

  return new DefaultProfileRefreshService(buildService, refreshRepository);
}

import { prisma } from "../../db/prisma/client";
import { PrismaProfileSnapshotRepository } from "../../db/repositories/profile-snapshot-repository";
import { DefaultProfileBuildService } from "./profile-build.service";

export function createProfileBuildService() {
  const repository = new PrismaProfileSnapshotRepository(prisma);
  return new DefaultProfileBuildService(repository);
}

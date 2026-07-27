import { prisma } from "./client";

export function getApplicationPrismaClient() {
  return prisma;
}

export async function releaseApplicationPrismaClient(_client?: unknown): Promise<void> {
  // The Local/Node client is process-scoped and intentionally reused.
}

import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient as WorkerPrismaClient } from "@prisma/client";

import type { DatabasePrismaClient } from "./client";
import { resolveDatabaseRuntime, type DatabaseEnvironment } from "./runtime";

export function getApplicationPrismaClient(
  environment: DatabaseEnvironment = process.env
): DatabasePrismaClient {
  const runtime = resolveDatabaseRuntime(environment);
  if (runtime.mode !== "cloud" || runtime.provider !== "postgresql") {
    throw new Error("The Worker database client requires Cloud Mode PostgreSQL.");
  }

  const adapter = new PrismaNeon({ connectionString: runtime.databaseUrl });
  return new WorkerPrismaClient({
    adapter,
    log: ["warn", "error"]
  }) as unknown as DatabasePrismaClient;
}

export async function releaseApplicationPrismaClient(client: DatabasePrismaClient): Promise<void> {
  await client.$disconnect();
}

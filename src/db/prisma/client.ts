import { PrismaClient as SqlitePrismaClient } from "../../generated/prisma";
import { PrismaClient as PostgresqlPrismaClient } from "../../generated/prisma-postgresql";

import {
  resolveDatabaseRuntime,
  type DatabaseEnvironment,
  type DatabaseProvider
} from "./runtime";

export type DatabasePrismaClient = SqlitePrismaClient;

type PrismaClientConstructor = new (options: {
  datasourceUrl: string;
  log: Array<"warn" | "error">;
}) => DatabasePrismaClient;

export type DatabaseClientConstructors = Record<DatabaseProvider, PrismaClientConstructor>;

const defaultConstructors: DatabaseClientConstructors = {
  sqlite: SqlitePrismaClient,
  postgresql: PostgresqlPrismaClient as unknown as PrismaClientConstructor
};

declare global {
  var __prismaClient: DatabasePrismaClient | undefined;
  var __prismaClientProvider: DatabaseProvider | undefined;
}

export function createPrismaClient(
  environment: DatabaseEnvironment = process.env,
  constructors: DatabaseClientConstructors = defaultConstructors
): DatabasePrismaClient {
  const runtime = resolveDatabaseRuntime(environment);
  const Client = constructors[runtime.provider];
  return new Client({
    datasourceUrl: runtime.databaseUrl,
    log: ["warn", "error"]
  });
}

export const databaseRuntime = resolveDatabaseRuntime();

export const prisma =
  global.__prismaClient && global.__prismaClientProvider === databaseRuntime.provider
    ? global.__prismaClient
    : createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__prismaClient = prisma;
  global.__prismaClientProvider = databaseRuntime.provider;
}

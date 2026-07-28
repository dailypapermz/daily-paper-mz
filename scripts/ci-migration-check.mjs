import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = resolve(import.meta.dirname, "..");
const schemaPath = resolve(projectDir, "prisma/postgresql/schema.prisma");
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runMigrationCheck(process.env);
}

export function runMigrationCheck(environment) {
  const require = createRequire(import.meta.url);
  const prismaCli = require.resolve("prisma/build/index.js");
  const testDatabaseUrl = validateTestDatabaseUrl(environment.TEST_POSTGRES_DATABASE_URL);
  const childEnvironment = {
    ...environment,
    DATABASE_URL: testDatabaseUrl
  };
  delete childEnvironment.TEST_POSTGRES_DATABASE_URL;

  runPrisma(prismaCli, ["validate", "--schema", schemaPath], childEnvironment);
  runPrisma(prismaCli, ["migrate", "deploy", "--schema", schemaPath], childEnvironment);
  runPrisma(prismaCli, ["migrate", "status", "--schema", schemaPath], childEnvironment);
  runPrisma(prismaCli, [
    "migrate",
    "diff",
    "--from-url",
    testDatabaseUrl,
    "--to-schema-datamodel",
    schemaPath,
    "--exit-code"
  ], childEnvironment);

  console.log(JSON.stringify({ status: "ok", database: "TEST_POSTGRES_DATABASE_URL" }));
}

export function validateTestDatabaseUrl(value) {
  if (!value?.trim()) {
    throw new Error("TEST_POSTGRES_DATABASE_URL is required; DATABASE_URL is never used by this CI check.");
  }

  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error("TEST_POSTGRES_DATABASE_URL must be a valid PostgreSQL URL.");
  }

  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error("TEST_POSTGRES_DATABASE_URL must use postgresql: or postgres:.");
  }
  if (!parsed.hostname || parsed.pathname === "/" || !parsed.pathname) {
    throw new Error("TEST_POSTGRES_DATABASE_URL must name an isolated test database.");
  }

  return value.trim();
}

function runPrisma(prismaCli, args, environment) {
  const result = spawnSync(process.execPath, [prismaCli, ...args], {
    cwd: projectDir,
    env: environment,
    stdio: "inherit"
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Prisma ${args.slice(0, 2).join(" ")} failed with exit code ${result.status}.`);
  }
}

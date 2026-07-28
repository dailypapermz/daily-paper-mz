import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";

const projectDir = resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const prismaCliPath = require.resolve("prisma/build/index.js");
const localSchemaPath = resolve(projectDir, "prisma/schema.prisma");
const cloudSchemaPath = resolve(projectDir, "prisma/postgresql/schema.prisma");
const cloudMigrationPath = resolve(
  projectDir,
  "prisma/postgresql/migrations/20260726160000_postgresql_baseline/migration.sql"
);
const cloudOutcomeMigrationPath = resolve(
  projectDir,
  "prisma/postgresql/migrations/20260728170000_daily_pipeline_outcomes/migration.sql"
);
const cloudPipelineLeaseMigrationPath = resolve(
  projectDir,
  "prisma/postgresql/migrations/20260728190000_pipeline_lease_fencing/migration.sql"
);
const cloudLegacyOutcomeMigrationPath = resolve(
  projectDir,
  "prisma/postgresql/migrations/20260728191000_backfill_legacy_pipeline_outcomes/migration.sql"
);

function definitionNames(schema) {
  return new Set(
    Array.from(schema.matchAll(/^(?:enum|model)\s+(\w+)\s+\{/gm), (match) => match[1])
  );
}

function runPrisma(args, databaseUrl) {
  return execFileSync(process.execPath, [prismaCliPath, ...args], {
    cwd: projectDir,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

test("local and cloud schemas use independent providers and generated clients", async () => {
  const [local, cloud, localLock, cloudLock] = await Promise.all([
    readFile(localSchemaPath, "utf8"),
    readFile(cloudSchemaPath, "utf8"),
    readFile(resolve(projectDir, "prisma/migrations/migration_lock.toml"), "utf8"),
    readFile(resolve(projectDir, "prisma/postgresql/migrations/migration_lock.toml"), "utf8")
  ]);

  assert.match(local, /provider\s*=\s*"sqlite"/);
  assert.match(local, /output\s*=\s*"\.\.\/src\/generated\/prisma"/);
  assert.match(cloud, /provider\s*=\s*"postgresql"/);
  assert.match(cloud, /output\s*=\s*"\.\.\/\.\.\/src\/generated\/prisma-postgresql"/);
  assert.match(local, /^\s+semanticScore\s+Float\s*$/m);
  assert.match(cloud, /^\s+semanticScore\s+Float\s*$/m);
  assert.doesNotMatch(cloud, /^\s+retrievalScore\s+Float/m);
  assert.match(localLock, /provider\s*=\s*"sqlite"/);
  assert.match(cloudLock, /provider\s*=\s*"postgresql"/);
  const localDefinitions = definitionNames(local);
  const cloudDefinitions = definitionNames(cloud);
  // This compatibility model belongs to the older committed SQLite schema. The
  // current model stores these values in the two structured tag tables below.
  const supersededLocalDefinitions = new Set(["ZoteroItemContentTag"]);
  for (const name of localDefinitions) {
    if (supersededLocalDefinitions.has(name)) {
      continue;
    }
    assert.equal(cloudDefinitions.has(name), true, `Cloud schema is missing ${name}`);
  }
  for (const sentinel of [
    "ZoteroItemContentRecallTag",
    "ZoteroItemResearchTypeTag",
    "DailyPipelineStageRun",
    "GlobalPaper",
    "TextEmbeddingCache",
    "ObsidianPaperSyncState"
  ]) {
    assert.equal(cloudDefinitions.has(sentinel), true, `Cloud schema is missing ${sentinel}`);
  }
});

test("both Prisma schemas validate without connecting to a database", () => {
  assert.doesNotThrow(() => runPrisma(
    ["validate", "--schema", localSchemaPath],
    "file:./contract-validation.db"
  ));
  assert.doesNotThrow(() => runPrisma(
    ["validate", "--schema", cloudSchemaPath],
    "postgresql://placeholder:placeholder@127.0.0.1:5432/daily_paper"
  ));
});

test("the immutable PostgreSQL baseline and incremental pipeline migrations match the current schema", async () => {
  const [migration, outcomeMigration, pipelineLeaseMigration, legacyOutcomeMigration] = await Promise.all([
    readFile(cloudMigrationPath, "utf8"),
    readFile(cloudOutcomeMigrationPath, "utf8"),
    readFile(cloudPipelineLeaseMigrationPath, "utf8"),
    readFile(cloudLegacyOutcomeMigrationPath, "utf8")
  ]);
  const generated = runPrisma(
    ["migrate", "diff", "--from-empty", "--to-schema-datamodel", cloudSchemaPath, "--script"],
    "postgresql://placeholder:placeholder@127.0.0.1:5432/daily_paper"
  );

  assert.match(migration, /CREATE TYPE "CandidateSource" AS ENUM/);
  assert.match(migration, /CREATE TABLE "DailyIngestionRun"/);
  assert.match(migration, /JSONB/);
  assert.doesNotMatch(migration, /PRAGMA|AUTOINCREMENT/);
  assert.equal(
    createHash("sha256").update(migration).digest("hex"),
    "2125e4593300cbdecb2ca5978a42a9a7c80d0ef5c387ff75de9c7b33891978f6"
  );
  assert.match(outcomeMigration, /CREATE TYPE "DailyPipelineRunStatus" AS ENUM/);
  assert.match(outcomeMigration, /ADD COLUMN "pipelineStatus"/);
  assert.match(pipelineLeaseMigration, /ADD COLUMN "pipelineStartedAt"/);
  assert.match(pipelineLeaseMigration, /DailyIngestionRun_pipelineStatus_pipelineStartedAt_idx/);
  assert.match(legacyOutcomeMigration, /WHERE "source" = 'AGGREGATED'/);
  assert.match(legacyOutcomeMigration, /"pipelineStatus" IS NULL/);
  assert.match(legacyOutcomeMigration, /::"DailyPipelineRunStatus"/);
  assert.match(generated, /CREATE TYPE "DailyPipelineRunStatus" AS ENUM/);
  assert.match(generated, /"pipelineStatus" "DailyPipelineRunStatus"/);
  assert.match(generated, /"pipelineStartedAt" TIMESTAMP\(3\)/);
});

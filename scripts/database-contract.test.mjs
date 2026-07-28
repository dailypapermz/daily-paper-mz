import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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

test("the committed PostgreSQL baseline is current and contains PostgreSQL primitives", async () => {
  const migration = await readFile(cloudMigrationPath, "utf8");
  const generated = runPrisma(
    ["migrate", "diff", "--from-empty", "--to-schema-datamodel", cloudSchemaPath, "--script"],
    "postgresql://placeholder:placeholder@127.0.0.1:5432/daily_paper"
  );

  assert.match(migration, /CREATE TYPE "CandidateSource" AS ENUM/);
  assert.match(migration, /CREATE TABLE "DailyIngestionRun"/);
  assert.match(migration, /JSONB/);
  assert.doesNotMatch(migration, /PRAGMA|AUTOINCREMENT/);
  assert.equal(migration.replace(/\r\n/g, "\n").trim(), generated.replace(/\r\n/g, "\n").trim());
});

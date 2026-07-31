import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
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
const localManualFallbackMigrationPath = resolve(
  projectDir,
  "prisma/migrations/20260731110000_manual_daily_fallback_idempotency/migration.sql"
);
const cloudManualFallbackMigrationPath = resolve(
  projectDir,
  "prisma/postgresql/migrations/20260731110000_manual_daily_fallback_idempotency/migration.sql"
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

test("manual fallback migrations conservatively suppress terminal legacy notifications", async () => {
  const [localMigration, cloudMigration] = await Promise.all([
    readFile(localManualFallbackMigrationPath, "utf8"),
    readFile(cloudManualFallbackMigrationPath, "utf8")
  ]);

  for (const migration of [localMigration, cloudMigration]) {
    assert.match(migration, /notificationDeliveryStatus/);
    assert.match(migration, /LEGACY_SUPPRESSED/);
    assert.match(migration, /"pipelineStatus" IN \('COMPLETE', 'COMPLETE_WITH_WARNINGS'\)/);
    assert.match(migration, /DailyRerankRun_requestKey_key/);
  }
});

test("the SQLite migration upgrades legacy terminal and rerank rows without duplication or loss", async () => {
  const testRoot = await mkdtemp(resolve(tmpdir(), "daily-paper-manual-fallback-"));
  const finalMigrationName = "20260731110000_manual_daily_fallback_idempotency";
  const migrationsDir = resolve(projectDir, "prisma", "migrations");
  const databasePath = resolve(testRoot, "legacy.db");

  try {
    const database = new DatabaseSync(databasePath);
    try {
      const migrationNames = (await readdir(migrationsDir, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory() && entry.name !== finalMigrationName)
        .map((entry) => entry.name)
        .sort();
      for (const migrationName of migrationNames) {
        database.exec(await readFile(resolve(migrationsDir, migrationName, "migration.sql"), "utf8"));
      }

      database.exec(`
        PRAGMA foreign_keys = OFF;
        INSERT INTO "DailyIngestionRun"
          ("id", "requestKey", "source", "status", "pipelineStatus", "runDate", "finishedAt", "pipelineFinishedAt", "updatedAt")
        VALUES
          ('legacy-complete', 'daily:v1:aggregated:arxiv+biorxiv+journal+pubmed:2026-07-29', 'AGGREGATED', 'SUCCESS', 'COMPLETE', '2026-07-29T00:00:00.000Z', '2026-07-30T00:30:00.000Z', '2026-07-30T00:30:00.000Z', '2026-07-30T00:30:00.000Z'),
          ('legacy-running', 'daily:v1:aggregated:arxiv+biorxiv+journal+pubmed:2026-07-30', 'AGGREGATED', 'SUCCESS', 'RUNNING', '2026-07-30T00:00:00.000Z', NULL, NULL, '2026-07-31T00:20:00.000Z');

        INSERT INTO "DailyRerankRun"
          ("id", "runId", "recallRunId", "profileSnapshotId", "status", "startedAt", "finishedAt", "requestedTopN", "candidateCount", "recommendedCount", "createdAt", "updatedAt")
        VALUES
          ('rerank-old', 'legacy-complete', 'recall-old', 'profile-old', 'SUCCESS', '2026-07-30T00:20:00.000Z', '2026-07-30T00:21:00.000Z', 10, 1, 1, '2026-07-30T00:20:00.000Z', '2026-07-30T00:21:00.000Z'),
          ('rerank-latest', 'legacy-complete', 'recall-latest', 'profile-old', 'SUCCESS', '2026-07-30T00:25:00.000Z', '2026-07-30T00:26:00.000Z', 10, 1, 1, '2026-07-30T00:25:00.000Z', '2026-07-30T00:26:00.000Z');

        INSERT INTO "DailyRecommendationResult"
          ("id", "rerankRunId", "canonicalCandidateId", "rank", "selected", "finalScore", "recallScore", "recentCoreScore", "stableLongTermScore", "highAttentionScore", "contentTagScore", "researchTypeScore", "collectionWeightScore", "sourcePriorityScore", "journalQualityScore", "userCorrectedScore", "recencyScore", "reasonsJson", "featureWeightsJson")
        VALUES
          ('result-old', 'rerank-old', 'candidate-old', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, '[]', '{}'),
          ('result-latest', 'rerank-latest', 'candidate-latest', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, '[]', '{}');
      `);
      database.exec(await readFile(resolve(migrationsDir, finalMigrationName, "migration.sql"), "utf8"));

      assert.deepEqual(
        database.prepare(`SELECT "id", "notificationDeliveryStatus" FROM "DailyIngestionRun" ORDER BY "id"`).all().map((row) => ({ ...row })),
        [
          { id: "legacy-complete", notificationDeliveryStatus: "LEGACY_SUPPRESSED" },
          { id: "legacy-running", notificationDeliveryStatus: null }
        ]
      );
      assert.deepEqual(
        database.prepare(`SELECT "id", "requestKey" FROM "DailyRerankRun" ORDER BY "id"`).all().map((row) => ({ ...row })),
        [
          { id: "rerank-latest", requestKey: "daily:rerank:legacy-complete" },
          { id: "rerank-old", requestKey: null }
        ]
      );
      assert.equal(database.prepare(`SELECT COUNT(*) AS "count" FROM "DailyRecommendationResult"`).get().count, 2);
    } finally {
      database.close();
    }
  } finally {
    await rm(testRoot, { recursive: true, force: true });
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
    createHash("sha256").update(migration.replaceAll("\r\n", "\n")).digest("hex"),
    "512588416548c90c6c721e70572c95902f964f7ea053fc2c27fc096ac0f50fee"
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

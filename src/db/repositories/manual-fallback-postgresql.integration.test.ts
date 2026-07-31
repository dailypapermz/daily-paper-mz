import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { PrismaClient as PostgresqlPrismaClient } from "../../generated/prisma-postgresql";
import { deliverDailyNotificationOnce } from "../../jobs/daily-notification-delivery";
import {
  createPrismaDailyNotificationStore,
  type DailyNotificationStoreDatabase
} from "../../jobs/daily-notification-store";

const projectDir = resolve(import.meta.dirname, "../../..");
const baseUrl = process.env.TEST_POSTGRES_DATABASE_URL?.trim();
const describePostgresql = baseUrl ? describe : describe.skip;
const schemaName = `daily_paper_manual_${randomBytes(8).toString("hex")}`;
const finalMigrationName = "20260731110000_manual_daily_fallback_idempotency";
let client: PostgresqlPrismaClient | undefined;
let testRoot: string | undefined;
let databaseUrl: string | undefined;

describePostgresql("PostgreSQL manual fallback upgrade and notification claim contract", () => {
  beforeAll(async () => {
    databaseUrl = isolatedTestUrl(baseUrl!);
    testRoot = await mkdtemp(resolve(tmpdir(), "daily-paper-postgresql-upgrade-"));
    const stagedPrismaDir = resolve(testRoot, "postgresql");
    const stagedSchemaPath = resolve(stagedPrismaDir, "schema.prisma");
    const stagedFinalMigration = resolve(stagedPrismaDir, "migrations", finalMigrationName);

    await cp(resolve(projectDir, "prisma/postgresql"), stagedPrismaDir, { recursive: true });
    await rm(stagedFinalMigration, { recursive: true, force: true });
    runMigrateDeploy(stagedSchemaPath, databaseUrl);

    const legacyClient = new PostgresqlPrismaClient({ datasourceUrl: databaseUrl });
    try {
      await seedLegacyRows(legacyClient);
    } finally {
      await legacyClient.$disconnect();
    }

    await cp(
      resolve(projectDir, "prisma/postgresql/migrations", finalMigrationName),
      stagedFinalMigration,
      { recursive: true }
    );
    runMigrateDeploy(stagedSchemaPath, databaseUrl);
    client = new PostgresqlPrismaClient({ datasourceUrl: databaseUrl });
  }, 120_000);

  afterAll(async () => {
    if (client) {
      if (!/^daily_paper_manual_[a-f0-9]{16}$/.test(schemaName)) {
        throw new Error("Refusing to clean up an unexpected PostgreSQL schema name.");
      }
      await client.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await client.$disconnect();
    }
    if (testRoot) await rm(testRoot, { recursive: true, force: true });
  }, 30_000);

  it("preserves legacy data, migrates idempotency state, and grants one notification sender", async () => {
    const db = client!;
    const legacyRun = await db.dailyIngestionRun.findUniqueOrThrow({
      where: { id: "legacy-complete" },
      select: {
        requestKey: true,
        pipelineStatus: true,
        candidatesCount: true,
        notificationDeliveryStatus: true,
        notificationChannel: true,
        notificationSentAt: true
      }
    });
    expect(legacyRun).toEqual({
      requestKey: "daily:v1:aggregated:arxiv+biorxiv+journal+pubmed:2026-07-29",
      pipelineStatus: "COMPLETE",
      candidatesCount: 2,
      notificationDeliveryStatus: "LEGACY_SUPPRESSED",
      notificationChannel: null,
      notificationSentAt: null
    });
    await expect(db.dailyIngestionRun.findUniqueOrThrow({
      where: { id: "legacy-running" },
      select: { notificationDeliveryStatus: true }
    })).resolves.toEqual({ notificationDeliveryStatus: null });

    const reranks = await db.dailyRerankRun.findMany({
      where: { runId: "legacy-complete" },
      orderBy: { id: "asc" },
      select: { id: true, requestKey: true, recommendedCount: true }
    });
    expect(reranks).toEqual([
      { id: "rerank-latest", requestKey: "daily:rerank:legacy-complete", recommendedCount: 1 },
      { id: "rerank-old", requestKey: null, recommendedCount: 1 }
    ]);
    expect(await db.dailyRecommendationResult.count({
      where: { rerankRun: { runId: "legacy-complete" } }
    })).toBe(2);

    const concurrentRunId = await createNotificationFixture(db, "concurrent");
    const left = notificationStore(db, concurrentRunId);
    const right = notificationStore(db, concurrentRunId);
    const claims = await Promise.all([left.claim(concurrentRunId), right.claim(concurrentRunId)]);
    expect([...claims].sort()).toEqual(["claimed", "delivery_outcome_unknown"]);
    const winner = claims[0] === "claimed" ? left : right;
    await winner.markSent({ runId: concurrentRunId, channel: "email" });
    await expect(right.claim(concurrentRunId)).resolves.toBe("already_sent");
    await expect(db.dailyIngestionRun.findUniqueOrThrow({
      where: { id: concurrentRunId },
      select: {
        notificationDeliveryStatus: true,
        notificationChannel: true,
        notificationSentAt: true
      }
    })).resolves.toEqual({
      notificationDeliveryStatus: "SENT",
      notificationChannel: "EMAIL",
      notificationSentAt: expect.any(Date)
    });

    const senderRunId = await createNotificationFixture(db, "single-sender");
    const send = vi.fn().mockResolvedValue({
      deliveryStatus: "sent",
      channel: "email",
      businessDate: "2026-07-30"
    });
    const senderResults = await Promise.all([
      deliverDailyNotificationOnce({
        runId: senderRunId,
        store: notificationStore(db, senderRunId),
        send
      }),
      deliverDailyNotificationOnce({
        runId: senderRunId,
        store: notificationStore(db, senderRunId),
        send
      })
    ]);
    expect(send).toHaveBeenCalledOnce();
    expect(senderResults.map((result) => result.deliveryStatus).sort()).toEqual(["sent", "skipped"]);
    expect(senderResults.find((result) => result.deliveryStatus === "skipped")).toMatchObject({
      reason: expect.stringMatching(/already_sent|delivery_outcome_unknown/),
      deduplicated: true
    });

    const failedRunId = await createNotificationFixture(db, "provider-failed");
    await expect(deliverDailyNotificationOnce({
      runId: failedRunId,
      store: notificationStore(db, failedRunId),
      send: vi.fn().mockResolvedValue({
        deliveryStatus: "failed",
        channel: "none",
        errorCategory: "delivery_failed"
      })
    })).resolves.toMatchObject({ deliveryStatus: "failed" });
    await expect(db.dailyIngestionRun.findUniqueOrThrow({
      where: { id: failedRunId },
      select: { notificationDeliveryStatus: true }
    })).resolves.toEqual({ notificationDeliveryStatus: "SENDING" });
    const retrySender = vi.fn();
    await expect(deliverDailyNotificationOnce({
      runId: failedRunId,
      store: notificationStore(db, failedRunId),
      send: retrySender
    })).resolves.toMatchObject({
      deliveryStatus: "skipped",
      reason: "delivery_outcome_unknown",
      deduplicated: true
    });
    expect(retrySender).not.toHaveBeenCalled();

    const recoverableRunId = await createNotificationFixture(db, "configuration-skip");
    await deliverDailyNotificationOnce({
      runId: recoverableRunId,
      store: notificationStore(db, recoverableRunId),
      send: vi.fn().mockResolvedValue({
        deliveryStatus: "skipped",
        channel: "none",
        reason: "configuration_incomplete"
      })
    });
    await expect(db.dailyIngestionRun.findUniqueOrThrow({
      where: { id: recoverableRunId },
      select: { notificationDeliveryStatus: true }
    })).resolves.toEqual({ notificationDeliveryStatus: null });
    await expect(notificationStore(db, recoverableRunId).claim(recoverableRunId)).resolves.toBe("claimed");

    await expect(notificationStore(db, "legacy-complete").claim("legacy-complete"))
      .resolves.toBe("legacy_suppressed");
  }, 120_000);
});

function isolatedTestUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("TEST_POSTGRES_DATABASE_URL must use postgresql: or postgres:.");
  }
  const databaseName = url.pathname.slice(1);
  const isLocal = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  if (!isLocal && !/(?:^|[_-])(?:test|ci)(?:$|[_-])/i.test(databaseName)) {
    throw new Error("Refusing a non-local PostgreSQL URL whose database name is not explicitly test/ci.");
  }
  if (process.env.DATABASE_URL?.trim() === value.trim()) {
    throw new Error("TEST_POSTGRES_DATABASE_URL must not equal DATABASE_URL.");
  }
  url.searchParams.set("schema", schemaName);
  return url.toString();
}

function runMigrateDeploy(schemaPath: string, url: string) {
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", schemaPath],
    {
      cwd: projectDir,
      env: { ...process.env, DATABASE_URL: url },
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
}

async function seedLegacyRows(db: PostgresqlPrismaClient) {
  await db.$executeRawUnsafe(`
    INSERT INTO "DailyIngestionRun"
      ("id", "requestKey", "source", "status", "pipelineStatus", "runDate", "finishedAt",
       "pipelineFinishedAt", "candidatesCount", "updatedAt")
    VALUES
      ('legacy-complete',
       'daily:v1:aggregated:arxiv+biorxiv+journal+pubmed:2026-07-29',
       'AGGREGATED', 'SUCCESS', 'COMPLETE', '2026-07-29T00:00:00.000Z',
       '2026-07-30T00:30:00.000Z', '2026-07-30T00:30:00.000Z', 2,
       '2026-07-30T00:30:00.000Z'),
      ('legacy-running',
       'daily:v1:aggregated:arxiv+biorxiv+journal+pubmed:2026-07-30',
       'AGGREGATED', 'SUCCESS', 'RUNNING', '2026-07-30T00:00:00.000Z',
       NULL, NULL, 1, '2026-07-31T00:20:00.000Z')
  `);
  await db.$executeRawUnsafe(`
    INSERT INTO "ProfileSnapshot" ("id", "status", "itemsCount", "summaryJson", "updatedAt")
    VALUES ('profile-legacy', 'ACTIVE', 1, '{"fixture":true}'::jsonb, CURRENT_TIMESTAMP)
  `);
  await db.$executeRawUnsafe(`
    INSERT INTO "DailyCanonicalCandidate"
      ("id", "runId", "canonicalKey", "title", "sourceProvenanceJson", "updatedAt")
    VALUES
      ('candidate-old', 'legacy-complete', 'candidate-old', 'Old recommendation',
       '{"sources":["pubmed"]}'::jsonb, CURRENT_TIMESTAMP),
      ('candidate-latest', 'legacy-complete', 'candidate-latest', 'Latest recommendation',
       '{"sources":["pubmed"]}'::jsonb, CURRENT_TIMESTAMP)
  `);
  await db.$executeRawUnsafe(`
    INSERT INTO "DailyRecallRun"
      ("id", "runId", "profileSnapshotId", "status", "finishedAt", "requestedTopN",
       "candidateCount", "recalledCount", "updatedAt")
    VALUES
      ('recall-old', 'legacy-complete', 'profile-legacy', 'SUCCESS', CURRENT_TIMESTAMP,
       10, 1, 1, CURRENT_TIMESTAMP),
      ('recall-latest', 'legacy-complete', 'profile-legacy', 'SUCCESS', CURRENT_TIMESTAMP,
       10, 1, 1, CURRENT_TIMESTAMP)
  `);
  await db.$executeRawUnsafe(`
    INSERT INTO "DailyRerankRun"
      ("id", "runId", "recallRunId", "profileSnapshotId", "status", "startedAt",
       "finishedAt", "requestedTopN", "candidateCount", "recommendedCount", "createdAt", "updatedAt")
    VALUES
      ('rerank-old', 'legacy-complete', 'recall-old', 'profile-legacy', 'SUCCESS',
       '2026-07-30T00:20:00.000Z', '2026-07-30T00:21:00.000Z', 10, 1, 1,
       '2026-07-30T00:20:00.000Z', '2026-07-30T00:21:00.000Z'),
      ('rerank-latest', 'legacy-complete', 'recall-latest', 'profile-legacy', 'SUCCESS',
       '2026-07-30T00:25:00.000Z', '2026-07-30T00:26:00.000Z', 10, 1, 1,
       '2026-07-30T00:25:00.000Z', '2026-07-30T00:26:00.000Z')
  `);
  await db.$executeRawUnsafe(`
    INSERT INTO "DailyRecommendationResult"
      ("id", "rerankRunId", "canonicalCandidateId", "rank", "selected", "finalScore",
       "recallScore", "recentCoreScore", "stableLongTermScore", "highAttentionScore",
       "contentTagScore", "researchTypeScore", "collectionWeightScore", "sourcePriorityScore",
       "journalQualityScore", "userCorrectedScore", "recencyScore", "reasonsJson",
       "featureWeightsJson")
    VALUES
      ('result-old', 'rerank-old', 'candidate-old', 1, true, 1, 1, 1, 1, 1, 1, 1,
       1, 1, 1, 1, 1, '["legacy-old"]'::jsonb, '{"weight":1}'::jsonb),
      ('result-latest', 'rerank-latest', 'candidate-latest', 1, true, 2, 2, 2, 2, 2, 2, 2,
       2, 2, 2, 2, 2, '["legacy-latest"]'::jsonb, '{"weight":2}'::jsonb)
  `);
}

async function createNotificationFixture(db: PostgresqlPrismaClient, label: string) {
  const id = `notification-${label}-${randomBytes(6).toString("hex")}`;
  await db.dailyIngestionRun.create({
    data: {
      id,
      requestKey: `manual-fallback:${label}:${id}`,
      source: "AGGREGATED",
      status: "SUCCESS",
      pipelineStatus: "COMPLETE",
      runDate: new Date("2026-07-30T00:00:00.000Z"),
      finishedAt: new Date("2026-07-31T00:30:00.000Z"),
      pipelineFinishedAt: new Date("2026-07-31T00:30:00.000Z")
    }
  });
  return id;
}

function notificationStore(db: PostgresqlPrismaClient, runId: string) {
  return createPrismaDailyNotificationStore(
    db as unknown as DailyNotificationStoreDatabase,
    runId
  );
}

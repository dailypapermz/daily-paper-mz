import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PrismaClient as RepositoryPrismaClient } from "../../generated/prisma";
import { PrismaClient as PostgresqlPrismaClient } from "../../generated/prisma-postgresql";
import type { DailySourceAdapterCandidate } from "../../modules/ingestion/types";
import { PrismaDailyIngestionRepository } from "./daily-ingestion-repository";

const baseUrl = process.env.TEST_POSTGRES_DATABASE_URL?.trim();
const describePostgresql = baseUrl ? describe : describe.skip;
const schemaName = `daily_paper_daily_${randomBytes(8).toString("hex")}`;
let client: PostgresqlPrismaClient | undefined;

describePostgresql("PostgreSQL persisted daily execution contract", () => {
  beforeAll(() => {
    const databaseUrl = isolatedUrl(baseUrl!);
    try {
      execFileSync(
        process.execPath,
        [
          "node_modules/prisma/build/index.js",
          "migrate",
          "deploy",
          "--schema",
          "prisma/postgresql/schema.prisma"
        ],
        {
          cwd: resolve(import.meta.dirname, "../../.."),
          env: { ...process.env, DATABASE_URL: databaseUrl },
          stdio: ["ignore", "pipe", "pipe"]
        }
      );
    } catch {
      throw new Error("PostgreSQL daily contract migration failed; verify the isolated test URL and connectivity.");
    }
    client = new PostgresqlPrismaClient({ datasourceUrl: databaseUrl });
  }, 120_000);

  afterAll(async () => {
    if (!client) return;
    if (!/^daily_paper_daily_[a-f0-9]{16}$/.test(schemaName)) {
      throw new Error("Refusing to clean up an unexpected PostgreSQL schema name.");
    }
    await client.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await client.$disconnect();
  }, 30_000);

  it("serializes concurrent acquisition and retries the same run id", async () => {
    const repository = createRepository();
    const input = runInput();
    const [left, right] = await Promise.all([
      repository.acquireRun(input),
      createRepository().acquireRun(input)
    ]);

    expect([left.disposition, right.disposition].sort()).toEqual(["acquired", "already_running"]);
    expect(left.run.id).toBe(right.run.id);

    await repository.markRunFailed({
      runId: left.run.id,
      attempt: left.run.attempt,
      errorMessage: "fixture failure"
    });
    await expect(repository.acquireRun(input)).resolves.toMatchObject({
      disposition: "retry",
      run: { id: left.run.id, attempt: 2 }
    });
  });

  it("atomically persists candidates, checkpoints, and success", async () => {
    const repository = createRepository();
    const acquired = await repository.acquireRun(runInput());
    const successfulAt = new Date("2026-07-27T00:15:00.000Z");

    await expect(repository.finalizeRunSuccess({
      runId: acquired.run.id,
      attempt: acquired.run.attempt,
      entries: [{ source: "journal", candidate: candidate(`journal-${randomUUID()}`) }],
      checkpoints: [{
        source: "journal",
        successfulAt,
        seenExternalIds: [`seen-${randomUUID()}`]
      }]
    })).resolves.toMatchObject({ status: "success", candidatesCount: 1 });

    await expect(repository.getSourceCursor("journal")).resolves.toEqual(successfulAt);
  });
});

function isolatedUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("TEST_POSTGRES_DATABASE_URL must use postgresql: or postgres:.");
  }
  url.searchParams.set("schema", schemaName);
  return url.toString();
}

function createRepository() {
  return new PrismaDailyIngestionRepository(client as unknown as RepositoryPrismaClient);
}

function runInput() {
  return {
    source: "aggregated" as const,
    runDate: new Date("2026-07-27T00:00:00.000Z"),
    requestKey: `postgres-integration:${randomUUID()}`
  };
}

function candidate(externalId: string): DailySourceAdapterCandidate {
  return {
    externalId,
    title: "PostgreSQL fixture paper",
    authors: [],
    sourcePayload: { fixture: true }
  };
}

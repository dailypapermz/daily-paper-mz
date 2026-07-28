import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../../generated/prisma";
import type { DailySourceAdapterCandidate } from "../../modules/ingestion/types";
import { PrismaDailyIngestionRepository } from "./daily-ingestion-repository";
import { createMigratedSqliteTestDatabase } from "./test-sqlite-database";

describe("PrismaDailyIngestionRepository persistence contract", () => {
  let cleanupDatabase = () => {};
  let clients: PrismaClient[] = [];
  let databaseUrl = "";

  beforeEach(() => {
    const database = createMigratedSqliteTestDatabase("daily-paper-idempotency");
    databaseUrl = database.databaseUrl;
    cleanupDatabase = database.cleanup;
  });

  afterEach(async () => {
    await Promise.all(clients.map((client) => client.$disconnect()));
    clients = [];
    cleanupDatabase();
  });

  it("allows one concurrent owner and reuses one persistent run", async () => {
    const [left, right] = makeRepositories();
    const input = runInput();
    const results = await Promise.all([left.acquireRun(input), right.acquireRun(input)]);

    expect(results.map((result) => result.disposition).sort()).toEqual(["acquired", "already_running"]);
    expect(new Set(results.map((result) => result.run.id)).size).toBe(1);
  });

  it("reclaims a failed ingestion with the same run id and a higher attempt", async () => {
    const [left, right] = makeRepositories();
    const input = runInput();
    const first = await left.acquireRun(input);
    await left.markRunFailed({ runId: first.run.id, attempt: first.run.attempt, errorMessage: "fixture failure" });

    const results = await Promise.all([left.acquireRun(input), right.acquireRun(input)]);
    const retry = results.find((result) => result.disposition === "retry");
    expect(retry?.run).toMatchObject({ id: first.run.id, attempt: 2, status: "running" });
    expect(results.some((result) => result.disposition === "already_running")).toBe(true);
  });

  it("reclaims a stale running ingestion but not an active lease", async () => {
    const [client] = makeClients(1);
    const initial = new PrismaDailyIngestionRepository(client);
    const input = runInput();
    const first = await initial.acquireRun(input);
    const now = new Date("2026-07-27T06:00:00.000Z");
    await client.dailyIngestionRun.update({
      where: { id: first.run.id },
      data: { startedAt: new Date("2026-07-27T02:00:00.000Z") }
    });
    const repository = new PrismaDailyIngestionRepository(client, {
      staleAfterMs: 180 * 60 * 1000,
      now: () => now
    });

    await expect(repository.acquireRun(input)).resolves.toMatchObject({
      disposition: "retry",
      run: { id: first.run.id, attempt: 2 }
    });
    await expect(repository.acquireRun(input)).resolves.toMatchObject({ disposition: "already_running" });
  });

  it("commits candidates, cursors, seen ids, and success atomically", async () => {
    const [client] = makeClients(1);
    const repository = new PrismaDailyIngestionRepository(client);
    const acquired = await repository.acquireRun(runInput());
    const successfulAt = new Date("2026-07-27T00:15:00.000Z");

    const run = await repository.finalizeRunSuccess({
      runId: acquired.run.id,
      attempt: acquired.run.attempt,
      entries: [{ source: "journal", candidate: candidate("journal-1") }],
      checkpoints: [{ source: "journal", successfulAt, seenExternalIds: ["journal-1", "journal-1"] }]
    });

    expect(run).toMatchObject({ status: "success", candidatesCount: 1 });
    await expect(repository.getSourceCursor("journal")).resolves.toEqual(successfulAt);
    await expect(repository.listSeenExternalIds("journal", ["journal-1"])).resolves.toEqual(new Set(["journal-1"]));
  });

  it("rolls back checkpoints when candidate persistence fails", async () => {
    const [client] = makeClients(1);
    const repository = new PrismaDailyIngestionRepository(client);
    const acquired = await repository.acquireRun(runInput());
    const duplicate = candidate("duplicate");

    await expect(repository.finalizeRunSuccess({
      runId: acquired.run.id,
      attempt: acquired.run.attempt,
      entries: [
        { source: "arxiv", candidate: duplicate },
        { source: "arxiv", candidate: duplicate }
      ],
      checkpoints: [{ source: "arxiv", successfulAt: new Date(), seenExternalIds: ["duplicate"] }]
    })).rejects.toBeDefined();

    await expect(repository.getSourceCursor("arxiv")).resolves.toBeUndefined();
    await expect(repository.listSeenExternalIds("arxiv", ["duplicate"])).resolves.toEqual(new Set());
    await expect(repository.getRun(acquired.run.id)).resolves.toMatchObject({ status: "running" });
    await expect(client.dailyCandidate.count({ where: { runId: acquired.run.id } })).resolves.toBe(0);
  });

  it("fences a former owner after a stale lease is reclaimed", async () => {
    const [client] = makeClients(1);
    const initial = new PrismaDailyIngestionRepository(client);
    const input = runInput();
    const first = await initial.acquireRun(input);
    await client.dailyIngestionRun.update({
      where: { id: first.run.id },
      data: { startedAt: new Date("2026-07-27T02:00:00.000Z") }
    });
    const retrying = new PrismaDailyIngestionRepository(client, {
      staleAfterMs: 180 * 60 * 1000,
      now: () => new Date("2026-07-27T06:00:00.000Z")
    });
    const retry = await retrying.acquireRun(input);

    await expect(initial.finalizeRunSuccess({
      runId: first.run.id,
      attempt: first.run.attempt,
      entries: [],
      checkpoints: []
    })).rejects.toThrow(/lease was lost/i);
    await expect(retrying.finalizeRunSuccess({
      runId: retry.run.id,
      attempt: retry.run.attempt,
      entries: [],
      checkpoints: []
    })).resolves.toMatchObject({ status: "success", attempt: 2 });
  });

  it("keeps an active downstream lease exclusive and reclaims only a stale pipeline attempt", async () => {
    const [leftClient, rightClient] = makeClients(2);
    const startedAt = new Date("2026-07-27T02:00:00.000Z");
    const initial = new PrismaDailyIngestionRepository(leftClient, { now: () => startedAt });
    const input = runInput();
    const acquired = await initial.acquireRun(input);
    const finalized = await initial.finalizeRunSuccess({
      runId: acquired.run.id,
      attempt: acquired.run.attempt,
      entries: [],
      checkpoints: [],
      pipelineInitialization: {
        ingestionStatus: "success",
        ingestionDetails: { sources: [] }
      }
    });
    expect(finalized).toMatchObject({
      status: "success",
      pipelineStatus: "running",
      attempt: 1
    });

    const active = new PrismaDailyIngestionRepository(rightClient, {
      staleAfterMs: 180 * 60 * 1000,
      now: () => new Date("2026-07-27T03:00:00.000Z")
    });
    await expect(active.acquireRun(input)).resolves.toMatchObject({
      disposition: "already_running",
      run: { id: acquired.run.id, attempt: 1 }
    });

    const staleNow = new Date("2026-07-27T06:00:00.000Z");
    const staleLeft = new PrismaDailyIngestionRepository(leftClient, {
      staleAfterMs: 180 * 60 * 1000,
      now: () => staleNow
    });
    const staleRight = new PrismaDailyIngestionRepository(rightClient, {
      staleAfterMs: 180 * 60 * 1000,
      now: () => staleNow
    });
    const claims = await Promise.all([staleLeft.acquireRun(input), staleRight.acquireRun(input)]);
    const winner = claims.find((claim) => claim.disposition === "pipeline_acquired");
    expect(winner?.run).toMatchObject({ id: acquired.run.id, attempt: 2, status: "success" });
    expect(claims.some((claim) => claim.disposition === "already_running")).toBe(true);

    await expect(initial.setPipelineOutcome({
      runId: acquired.run.id,
      attempt: 1,
      status: "complete"
    })).rejects.toThrow(/pipeline lease was lost/i);
    await expect(staleLeft.setPipelineOutcome({
      runId: acquired.run.id,
      attempt: 2,
      status: "complete"
    })).resolves.toMatchObject({ pipelineStatus: "complete", attempt: 2 });
  });

  it("claims a legacy successful aggregated run with no pipeline status", async () => {
    const [client] = makeClients(1);
    const input = runInput();
    const legacy = await client.dailyIngestionRun.create({
      data: {
        requestKey: input.requestKey,
        source: "AGGREGATED",
        status: "SUCCESS",
        pipelineStatus: null,
        runDate: input.runDate,
        finishedAt: new Date("2026-07-27T01:00:00.000Z")
      }
    });
    const repository = new PrismaDailyIngestionRepository(client, {
      now: () => new Date("2026-07-27T02:00:00.000Z")
    });

    await expect(repository.acquireRun(input)).resolves.toMatchObject({
      disposition: "pipeline_acquired",
      run: {
        id: legacy.id,
        attempt: 2,
        pipelineStatus: "running"
      }
    });
  });

  function makeClients(count: number) {
    const created = Array.from({ length: count }, () => new PrismaClient({ datasourceUrl: databaseUrl }));
    clients.push(...created);
    return created;
  }

  function makeRepositories() {
    const [left, right] = makeClients(2);
    return [new PrismaDailyIngestionRepository(left), new PrismaDailyIngestionRepository(right)] as const;
  }
});

function runInput() {
  return {
    source: "aggregated" as const,
    runDate: new Date("2026-07-27T00:00:00.000Z"),
    requestKey: `integration:${randomUUID()}`
  };
}

function candidate(externalId: string): DailySourceAdapterCandidate {
  return {
    externalId,
    title: "Fixture paper",
    authors: [],
    sourcePayload: { fixture: true }
  };
}

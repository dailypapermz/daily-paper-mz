import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../../generated/prisma";
import { createMigratedSqliteTestDatabase } from "./test-sqlite-database";
import { PrismaPipelineStageRepository } from "./pipeline-stage-repository";

describe("PrismaPipelineStageRepository", () => {
  let cleanupDatabase = () => {};
  let client: PrismaClient;

  beforeEach(() => {
    const database = createMigratedSqliteTestDatabase("daily-paper-stages");
    cleanupDatabase = database.cleanup;
    client = new PrismaClient({ datasourceUrl: database.databaseUrl });
  });

  afterEach(async () => {
    await client.$disconnect();
    cleanupDatabase();
  });

  it("persists a failed stage and skips every pending downstream stage", async () => {
    const run = await client.dailyIngestionRun.create({
      data: {
        requestKey: `stage-test:${randomUUID()}`,
        source: "AGGREGATED",
        status: "RUNNING",
        runDate: new Date("2026-07-10T00:00:00.000Z")
      }
    });
    const repository = new PrismaPipelineStageRepository(client);

    await repository.initialize({
      runId: run.id,
      ingestionStatus: "partial",
      ingestionDetails: { failedSources: ["pubmed"] }
    });
    await repository.start(run.id, "enrichment");
    await repository.fail({
      runId: run.id,
      stage: "enrichment",
      errorMessage: "provider timeout"
    });

    const stages = await repository.list(run.id);
    expect(stages).toHaveLength(7);
    expect(stages[0]).toMatchObject({ stage: "ingestion", status: "partial" });
    expect(stages[1]).toMatchObject({
      stage: "enrichment",
      status: "failed",
      errorMessage: "provider timeout"
    });
    expect(stages.slice(2).every((stage) => stage.status === "skipped")).toBe(true);
  });
});

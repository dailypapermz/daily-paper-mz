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
        status: "SUCCESS",
        pipelineStatus: "RUNNING",
        pipelineStartedAt: new Date(),
        runDate: new Date("2026-07-10T00:00:00.000Z")
      }
    });
    const repository = new PrismaPipelineStageRepository(client);

    await repository.initialize({
      runId: run.id,
      attempt: run.attempt,
      ingestionStatus: "partial",
      ingestionDetails: { failedSources: ["pubmed"] }
    });
    await repository.fail({
      runId: run.id,
      attempt: run.attempt,
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

  it("rejects stage and outcome writes from an attempt that lost the pipeline lease", async () => {
    const run = await client.dailyIngestionRun.create({
      data: {
        requestKey: `stage-fence:${randomUUID()}`,
        source: "AGGREGATED",
        status: "SUCCESS",
        pipelineStatus: "RUNNING",
        pipelineStartedAt: new Date(),
        runDate: new Date("2026-07-11T00:00:00.000Z")
      }
    });
    const repository = new PrismaPipelineStageRepository(client);
    await repository.initialize({
      runId: run.id,
      attempt: run.attempt,
      ingestionStatus: "success",
      ingestionDetails: { sources: [] }
    });
    await repository.start({ runId: run.id, attempt: 1, stage: "representation" });

    await client.dailyIngestionRun.update({
      where: { id: run.id },
      data: { attempt: 2, pipelineStartedAt: new Date() }
    });

    await expect(repository.initialize({
      runId: run.id,
      attempt: 1,
      ingestionStatus: "success",
      ingestionDetails: { sources: [] }
    })).rejects.toThrow(/pipeline lease was lost/i);

    await expect(repository.complete({
      runId: run.id,
      attempt: 1,
      stage: "representation"
    })).rejects.toThrow(/pipeline lease was lost/i);
    await repository.start({ runId: run.id, attempt: 2, stage: "representation" });
    await expect(repository.complete({
      runId: run.id,
      attempt: 2,
      stage: "representation"
    })).resolves.toBeUndefined();
  });
});

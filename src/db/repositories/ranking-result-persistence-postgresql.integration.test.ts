import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PrismaClient as RepositoryPrismaClient } from "../../generated/prisma";
import { PrismaClient as PostgresqlPrismaClient } from "../../generated/prisma-postgresql";
import type { RecallResultRecord } from "../../modules/ranking/recall/types";
import type { RerankResultRecord } from "../../modules/ranking/rerank/types";
import { PrismaRecallRankingRepository } from "./recall-ranking-repository";
import { PrismaRerankRepository } from "./rerank-repository";

const baseUrl = process.env.TEST_POSTGRES_DATABASE_URL?.trim();
const describePostgresql = baseUrl ? describe : describe.skip;
const schemaName = `daily_paper_rank_${randomBytes(8).toString("hex")}`;
let client: PostgresqlPrismaClient | undefined;

describePostgresql("PostgreSQL ranking result batch persistence", () => {
  beforeAll(() => {
    const databaseUrl = isolatedUrl(baseUrl!);
    execFileSync(
      process.execPath,
      ["node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", "prisma/postgresql/schema.prisma"],
      {
        cwd: resolve(import.meta.dirname, "../../.."),
        env: { ...process.env, DATABASE_URL: databaseUrl },
        stdio: ["ignore", "pipe", "pipe"]
      }
    );
    client = new PostgresqlPrismaClient({ datasourceUrl: databaseUrl });
  }, 120_000);

  afterAll(async () => {
    if (!client) return;
    if (!/^daily_paper_rank_[a-f0-9]{16}$/.test(schemaName)) {
      throw new Error("Refusing to clean up an unexpected PostgreSQL schema name.");
    }
    await client.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await client.$disconnect();
  }, 30_000);

  it("atomically persists and replaces 1000 recall and rerank results well below 60 seconds", async () => {
    const fixture = await createFixture(1_000);
    const recallRepository = new PrismaRecallRankingRepository(
      client! as unknown as RepositoryPrismaClient
    );
    const rerankRepository = new PrismaRerankRepository(
      client! as unknown as RepositoryPrismaClient
    );

    const recallStartedAt = performance.now();
    await recallRepository.saveRecallResults({
      recallRunId: fixture.recallRunId,
      results: fixture.recallResults
    });
    const recallElapsedMs = performance.now() - recallStartedAt;

    const rerankStartedAt = performance.now();
    await rerankRepository.saveRerankResults({
      rerankRunId: fixture.rerankRunId,
      results: fixture.rerankResults
    });
    const rerankElapsedMs = performance.now() - rerankStartedAt;
    console.info(
      `[ranking-postgresql] 1000 recall results in ${recallElapsedMs.toFixed(1)} ms; ` +
      `1000 rerank results in ${rerankElapsedMs.toFixed(1)} ms`
    );

    expect(recallElapsedMs).toBeLessThan(20_000);
    expect(rerankElapsedMs).toBeLessThan(20_000);
    await expectCountsAndMapping(fixture);

    await recallRepository.saveRecallResults({
      recallRunId: fixture.recallRunId,
      results: [...fixture.recallResults].reverse()
    });
    await rerankRepository.saveRerankResults({
      rerankRunId: fixture.rerankRunId,
      results: [...fixture.rerankResults].reverse()
    });
    await expectCountsAndMapping(fixture);
  }, 90_000);

  it("rolls back replacement when a batch contains an invalid candidate and reruns idempotently", async () => {
    const fixture = await createFixture(600);
    const repository = new PrismaRecallRankingRepository(client! as unknown as RepositoryPrismaClient);
    await repository.saveRecallResults({
      recallRunId: fixture.recallRunId,
      results: fixture.recallResults
    });

    const invalid = fixture.recallResults.map((result, index) =>
      index === 550 ? { ...result, candidateId: `missing-${randomUUID()}` } : result
    );
    await expect(repository.saveRecallResults({
      recallRunId: fixture.recallRunId,
      results: invalid
    })).rejects.toBeDefined();
    await expect(client!.dailyRecallResult.count({
      where: { recallRunId: fixture.recallRunId }
    })).resolves.toBe(600);

    await repository.saveRecallResults({
      recallRunId: fixture.recallRunId,
      results: fixture.recallResults
    });
    await expect(client!.dailyRecallResult.count({
      where: { recallRunId: fixture.recallRunId }
    })).resolves.toBe(600);
  }, 60_000);
});

async function createFixture(count: number) {
  const run = await client!.dailyIngestionRun.create({
    data: {
      requestKey: `ranking-persistence:${randomUUID()}`,
      source: "AGGREGATED",
      status: "SUCCESS",
      pipelineStatus: "RUNNING",
      runDate: new Date("2026-07-28T00:00:00.000Z")
    }
  });
  const profile = await client!.profileSnapshot.create({ data: {} });
  await client!.dailyCanonicalCandidate.createMany({
    data: Array.from({ length: count }, (_, index) => ({
      runId: run.id,
      canonicalKey: `candidate-${index}`,
      title: `Candidate ${index}`,
      sourceProvenanceJson: []
    }))
  });
  const candidates = await client!.dailyCanonicalCandidate.findMany({
    where: { runId: run.id },
    orderBy: { canonicalKey: "asc" },
    select: { id: true }
  });
  const recallRun = await client!.dailyRecallRun.create({
    data: {
      runId: run.id,
      profileSnapshotId: profile.id,
      requestedTopN: count,
      status: "RUNNING"
    }
  });
  const rerankRun = await client!.dailyRerankRun.create({
    data: {
      runId: run.id,
      recallRunId: recallRun.id,
      profileSnapshotId: profile.id,
      requestedTopN: count,
      status: "RUNNING"
    }
  });
  const recallResults = candidates.map((candidate, index): RecallResultRecord => ({
    candidateId: candidate.id,
    rank: index + 1,
    selected: index < 100,
    scores: {
      recallScore: 0.9,
      semanticScore: 0.8,
      tagOverlapScore: 0.7,
      researchTypeScore: 0.6,
      sourceScopeScore: 0.5,
      reasons: [`recall-${index}`]
    }
  }));
  const rerankResults = candidates.map((candidate, index): RerankResultRecord => ({
    candidateId: candidate.id,
    rank: index + 1,
    selected: index < 10,
    scores: {
      finalScore: 0.95,
      recallScore: 0.9,
      recentCoreScore: 0.8,
      stableLongTermScore: 0.7,
      highAttentionScore: 0.6,
      contentTagScore: 0.5,
      researchTypeScore: 0.4,
      collectionWeightScore: 0.3,
      sourcePriorityScore: 0.2,
      journalQualityScore: 0.1,
      userCorrectedScore: 0,
      recencyScore: 0.75,
      reasons: [`rerank-${index}`],
      featureWeights: { recall: 1 }
    }
  }));

  return {
    recallRunId: recallRun.id,
    rerankRunId: rerankRun.id,
    recallResults,
    rerankResults
  };
}

async function expectCountsAndMapping(fixture: Awaited<ReturnType<typeof createFixture>>) {
  const recallRows = await client!.dailyRecallResult.findMany({
    where: { recallRunId: fixture.recallRunId },
    select: { canonicalCandidateId: true, rank: true }
  });
  const rerankRows = await client!.dailyRecommendationResult.findMany({
    where: { rerankRunId: fixture.rerankRunId },
    select: { canonicalCandidateId: true, rank: true }
  });
  expect(recallRows).toHaveLength(fixture.recallResults.length);
  expect(rerankRows).toHaveLength(fixture.rerankResults.length);
  expect(new Map(recallRows.map((row) => [row.canonicalCandidateId, row.rank]))).toEqual(
    new Map(fixture.recallResults.map((row) => [row.candidateId, row.rank]))
  );
  expect(new Map(rerankRows.map((row) => [row.canonicalCandidateId, row.rank]))).toEqual(
    new Map(fixture.rerankResults.map((row) => [row.candidateId, row.rank]))
  );
}

function isolatedUrl(value: string) {
  const url = new URL(value);
  url.searchParams.set("schema", schemaName);
  return url.toString();
}

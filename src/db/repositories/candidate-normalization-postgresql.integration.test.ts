import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PrismaClient as RepositoryPrismaClient } from "../../generated/prisma";
import { PrismaClient as PostgresqlPrismaClient } from "../../generated/prisma-postgresql";
import type { CanonicalDailyCandidateCreateInput } from "../../modules/normalize-dedupe/types";
import { PrismaCandidateNormalizationRepository } from "./candidate-normalization-repository";

const baseUrl = process.env.TEST_POSTGRES_DATABASE_URL?.trim();
const describePostgresql = baseUrl ? describe : describe.skip;
const schemaName = `daily_paper_norm_${randomBytes(8).toString("hex")}`;
const performanceLimitMs = 20_000;
let client: PostgresqlPrismaClient | undefined;

describePostgresql("PostgreSQL candidate normalization batching", () => {
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
      throw new Error(
        "PostgreSQL normalization migration failed; verify the isolated test URL and direct database connectivity."
      );
    }
    client = new PostgresqlPrismaClient({ datasourceUrl: databaseUrl });
  }, 120_000);

  afterAll(async () => {
    if (!client) return;
    if (!/^daily_paper_norm_[a-f0-9]{16}$/.test(schemaName)) {
      throw new Error("Refusing to clean up an unexpected PostgreSQL schema name.");
    }
    await client.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await client.$disconnect();
  }, 30_000);

  it.each([100, 500, 1_000])(
    "persists %i canonical candidates and provenance well below the former transaction timeout",
    async (count) => {
      const fixture = await createFixture(count, `scale-${count}`);
      const repository = createRepository();

      const startedAt = performance.now();
      await repository.replaceCanonicalCandidates({
        runId: fixture.runId,
        canonicalCandidates: [...fixture.canonicalCandidates].reverse()
      });
      const elapsedMs = performance.now() - startedAt;
      console.info(`[normalization-postgresql] ${count} candidates persisted in ${elapsedMs.toFixed(1)} ms`);

      expect(elapsedMs).toBeLessThan(performanceLimitMs);
      await expectNormalizedState(fixture);
    },
    90_000
  );

  it("preserves ids while adding a mix of existing and new canonical candidates", async () => {
    const fixture = await createFixture(180, "mixed");
    const repository = createRepository();
    const existingInput = fixture.canonicalCandidates.slice(0, 70);

    await repository.replaceCanonicalCandidates({
      runId: fixture.runId,
      canonicalCandidates: existingInput
    });
    const existingIds = await canonicalIdMap(fixture.runId);

    await repository.replaceCanonicalCandidates({
      runId: fixture.runId,
      canonicalCandidates: fixture.canonicalCandidates
    });

    const allIds = await expectNormalizedState(fixture);
    for (const candidate of existingInput) {
      expect(allIds.get(candidate.canonicalKey)).toBe(existingIds.get(candidate.canonicalKey));
    }
  }, 60_000);

  it("is idempotent when the same batch is executed repeatedly", async () => {
    const fixture = await createFixture(150, "repeat");
    const repository = createRepository();

    await repository.replaceCanonicalCandidates({
      runId: fixture.runId,
      canonicalCandidates: fixture.canonicalCandidates
    });
    const firstIds = await expectNormalizedState(fixture);

    await repository.replaceCanonicalCandidates({
      runId: fixture.runId,
      canonicalCandidates: fixture.canonicalCandidates
    });
    const secondIds = await expectNormalizedState(fixture);

    expect(secondIds).toEqual(firstIds);
  }, 60_000);

  it("deduplicates repeated provenance without losing its canonical mapping", async () => {
    const fixture = await createFixture(1, "duplicate-provenance");
    const candidate = fixture.canonicalCandidates[0];
    const provenance = candidate.sourceProvenance[0];
    const repository = createRepository();

    await repository.replaceCanonicalCandidates({
      runId: fixture.runId,
      canonicalCandidates: [{
        ...candidate,
        sourceProvenance: [provenance, { ...provenance }, { ...provenance }]
      }]
    });

    const ids = await expectNormalizedState(fixture);
    const stored = await client!.dailyCanonicalCandidateProvenance.findMany({
      where: { sourceCandidateId: provenance.sourceCandidateId }
    });
    expect(stored).toHaveLength(1);
    expect(stored[0].canonicalCandidateId).toBe(ids.get(candidate.canonicalKey));
  });

  it("preserves the canonical id when provenance ordering changes", async () => {
    const fixture = await createFixture(2, "provenance-order");
    const repository = createRepository();
    const combined: CanonicalDailyCandidateCreateInput = {
      ...fixture.canonicalCandidates[0],
      mergedSourceCount: 1,
      sourceProvenance: [
        fixture.canonicalCandidates[0].sourceProvenance[0],
        fixture.canonicalCandidates[1].sourceProvenance[0]
      ]
    };

    await repository.replaceCanonicalCandidates({
      runId: fixture.runId,
      canonicalCandidates: [combined]
    });
    const firstIds = await canonicalIdMap(fixture.runId);

    await repository.replaceCanonicalCandidates({
      runId: fixture.runId,
      canonicalCandidates: [{ ...combined, sourceProvenance: [...combined.sourceProvenance].reverse() }]
    });
    const secondIds = await canonicalIdMap(fixture.runId);

    expect(secondIds).toEqual(firstIds);
    await expect(client!.dailyCanonicalCandidateProvenance.count({
      where: { canonicalCandidate: { runId: fixture.runId } }
    })).resolves.toBe(2);
  });

  it("rolls back an invalid provenance batch and reruns idempotently after the FK is repaired", async () => {
    const runId = await createRun("failed-provenance");
    const missingSourceCandidateId = sourceCandidateId(runId, 0);
    const canonicalCandidates = [canonicalInput(runId, 0)];
    const repository = createRepository();

    await expect(repository.replaceCanonicalCandidates({ runId, canonicalCandidates })).rejects.toBeDefined();
    await expect(client!.dailyCanonicalCandidate.count({ where: { runId } })).resolves.toBe(0);
    await expect(client!.dailyCanonicalCandidateProvenance.count({
      where: { sourceCandidateId: missingSourceCandidateId }
    })).resolves.toBe(0);

    await client!.dailyCandidate.create({ data: rawCandidateInput(runId, 0) });
    await repository.replaceCanonicalCandidates({ runId, canonicalCandidates });
    await repository.replaceCanonicalCandidates({ runId, canonicalCandidates });

    await expectNormalizedState({ runId, canonicalCandidates });
  });

  it("maps ids by canonical key even when findMany results are reversed", async () => {
    const fixture = await createFixture(120, "return-order");
    const reorderClient = client!.$extends({
      query: {
        dailyCanonicalCandidate: {
          async findMany({ args, query }) {
            return (await query(args)).reverse();
          }
        }
      }
    });
    const repository = new PrismaCandidateNormalizationRepository(
      reorderClient as unknown as RepositoryPrismaClient
    );

    await repository.replaceCanonicalCandidates({
      runId: fixture.runId,
      canonicalCandidates: fixture.canonicalCandidates
    });

    await expectNormalizedState(fixture);
  }, 60_000);
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
  return new PrismaCandidateNormalizationRepository(
    client as unknown as RepositoryPrismaClient
  );
}

async function createFixture(count: number, label: string) {
  const runId = await createRun(label);
  const indexes = Array.from({ length: count }, (_, index) => index);
  await client!.dailyCandidate.createMany({
    data: indexes.map((index) => rawCandidateInput(runId, index))
  });
  return {
    runId,
    canonicalCandidates: indexes.map((index) => canonicalInput(runId, index))
  };
}

async function createRun(label: string) {
  const runId = `normalization-${label}-${randomUUID()}`;
  await client!.dailyIngestionRun.create({
    data: {
      id: runId,
      requestKey: `normalization:${label}:${randomUUID()}`,
      source: "AGGREGATED",
      status: "SUCCESS",
      runDate: new Date("2026-07-28T00:00:00.000Z")
    }
  });
  return runId;
}

function rawCandidateInput(runId: string, index: number) {
  return {
    id: sourceCandidateId(runId, index),
    runId,
    source: "PUBMED" as const,
    externalId: externalId(index),
    title: `PostgreSQL normalization fixture ${index}`,
    doi: doi(index),
    authorsJson: [`Author ${index}`],
    sourcePayloadJson: { fixture: true, index }
  };
}

function canonicalInput(runId: string, index: number): CanonicalDailyCandidateCreateInput {
  return {
    runId,
    canonicalKey: canonicalKey(index),
    title: `PostgreSQL normalization fixture ${index}`,
    doi: doi(index),
    authors: [`Author ${index}`],
    mergedSourceCount: 1,
    sourceProvenance: [{
      sourceCandidateId: sourceCandidateId(runId, index),
      source: "pubmed",
      externalId: externalId(index),
      mergeReason: "doi"
    }]
  };
}

async function expectNormalizedState(fixture: {
  runId: string;
  canonicalCandidates: CanonicalDailyCandidateCreateInput[];
}) {
  const rows = await client!.dailyCanonicalCandidate.findMany({
    where: { runId: fixture.runId },
    select: {
      id: true,
      canonicalKey: true,
      provenances: {
        select: {
          canonicalCandidateId: true,
          sourceCandidateId: true,
          externalId: true
        }
      }
    }
  });
  const expectedByKey = new Map(fixture.canonicalCandidates.map((candidate) => [candidate.canonicalKey, candidate]));
  const idsByKey = new Map(rows.map((row) => [row.canonicalKey, row.id]));
  const provenance = rows.flatMap((row) => row.provenances);

  expect(rows).toHaveLength(expectedByKey.size);
  expect(idsByKey.size).toBe(expectedByKey.size);
  expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
  expect(provenance).toHaveLength(expectedByKey.size);
  expect(new Set(provenance.map((entry) => entry.sourceCandidateId)).size).toBe(provenance.length);

  for (const [key, candidate] of expectedByKey) {
    const candidateId = idsByKey.get(key);
    const expectedProvenance = candidate.sourceProvenance[0];
    expect(candidateId).toBeDefined();
    expect(provenance).toContainEqual({
      canonicalCandidateId: candidateId,
      sourceCandidateId: expectedProvenance.sourceCandidateId,
      externalId: expectedProvenance.externalId
    });
  }

  return idsByKey;
}

async function canonicalIdMap(runId: string) {
  const rows = await client!.dailyCanonicalCandidate.findMany({
    where: { runId },
    select: { id: true, canonicalKey: true }
  });
  return new Map(rows.map((row) => [row.canonicalKey, row.id]));
}

function sourceCandidateId(runId: string, index: number) {
  return `${runId}:source:${index}`;
}

function externalId(index: number) {
  return `pmid-${index}`;
}

function doi(index: number) {
  return `10.9999/normalization-${index}`;
}

function canonicalKey(index: number) {
  return `doi:${doi(index)}`;
}

import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "../../generated/prisma";
import type {
  CanonicalCandidateProvenanceRecord,
  CanonicalDailyCandidateCreateInput
} from "../../modules/normalize-dedupe/types";
import { PrismaCandidateNormalizationRepository } from "./candidate-normalization-repository";
import { createMigratedSqliteTestDatabase } from "./test-sqlite-database";

describe("PrismaCandidateNormalizationRepository batch unit", () => {
  it("uses bulk delegates and maps unordered persisted ids by canonical key", async () => {
    const canonicalCreateMany = vi.fn().mockResolvedValue({ count: 500 });
    const provenanceCreateMany = vi.fn().mockResolvedValue({ count: 500 });
    const canonicalCreate = vi.fn();
    const provenanceCreate = vi.fn();
    const candidates = Array.from({ length: 1_000 }, (_, index): CanonicalDailyCandidateCreateInput => ({
      runId: "unit-run",
      canonicalKey: `canonical-${index}`,
      title: `Candidate ${index}`,
      authors: [],
      mergedSourceCount: 1,
      sourceProvenance: [{
        sourceCandidateId: `source-${index}`,
        source: "pubmed",
        externalId: `pmid-${index}`,
        mergeReason: "source_external_id"
      }]
    }));
    const persisted = candidates
      .map((candidate, index) => ({ id: `candidate-id-${index}`, canonicalKey: candidate.canonicalKey }))
      .reverse();
    const canonicalFindMany = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(persisted);
    const transaction = {
      dailyCanonicalCandidate: {
        findMany: canonicalFindMany,
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: canonicalCreateMany,
        create: canonicalCreate
      },
      dailyCanonicalCandidateProvenance: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: provenanceCreateMany,
        create: provenanceCreate
      }
    };
    const db = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction))
    };
    const repository = new PrismaCandidateNormalizationRepository(db as unknown as PrismaClient);

    await repository.replaceCanonicalCandidates({
      runId: "unit-run",
      canonicalCandidates: candidates
    });

    expect(canonicalCreate).not.toHaveBeenCalled();
    expect(provenanceCreate).not.toHaveBeenCalled();
    expect(canonicalCreateMany).toHaveBeenCalledTimes(2);
    expect(provenanceCreateMany).toHaveBeenCalledTimes(2);
    const provenanceRows = provenanceCreateMany.mock.calls.flatMap(([args]) => args.data);
    const canonicalIdBySourceId = new Map(
      provenanceRows.map((row) => [row.sourceCandidateId, row.canonicalCandidateId])
    );
    expect(provenanceRows).toHaveLength(1_000);
    expect(canonicalIdBySourceId.size).toBe(1_000);
    for (let index = 0; index < 1_000; index += 1) {
      expect(canonicalIdBySourceId.get(`source-${index}`)).toBe(`candidate-id-${index}`);
    }
  });
});

describe("PrismaCandidateNormalizationRepository SQLite contract", () => {
  let cleanupDatabase = () => {};
  let client: PrismaClient;
  let repository: PrismaCandidateNormalizationRepository;
  let runId: string;

  beforeEach(async () => {
    const database = createMigratedSqliteTestDatabase("daily-paper-normalization");
    cleanupDatabase = database.cleanup;
    client = new PrismaClient({ datasourceUrl: database.databaseUrl });
    repository = new PrismaCandidateNormalizationRepository(client);

    const run = await client.dailyIngestionRun.create({
      data: {
        requestKey: `normalization-test:${randomUUID()}`,
        source: "AGGREGATED",
        status: "SUCCESS",
        pipelineStatus: "RUNNING",
        runDate: new Date("2026-07-28T00:00:00.000Z")
      }
    });
    runId = run.id;
  });

  afterEach(async () => {
    await client.$disconnect();
    cleanupDatabase();
  });

  it("deduplicates canonical keys and merges unique provenance before persistence", async () => {
    const [arxiv, pubmed] = await createSourceCandidates([
      { source: "ARXIV", externalId: "arxiv-1" },
      { source: "PUBMED", externalId: "pubmed-1" }
    ]);
    const arxivProvenance = provenance(arxiv.id, "arxiv", arxiv.externalId, "doi");
    const pubmedProvenance = provenance(pubmed.id, "pubmed", pubmed.externalId, "doi");

    await repository.replaceCanonicalCandidates({
      runId,
      canonicalCandidates: [
        canonical("doi:10.1000/shared", [arxivProvenance, arxivProvenance], {
          title: "First deterministic value",
          mergedSourceCount: 1
        }),
        canonical("doi:10.1000/shared", [arxivProvenance, pubmedProvenance], {
          title: "First deterministic value",
          mergedSourceCount: 2
        })
      ]
    });

    const stored = await repository.listCanonicalCandidates(runId);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      canonicalKey: "doi:10.1000/shared",
      title: "First deterministic value",
      mergedSourceCount: 2
    });
    expect(stored[0].sourceProvenance).toEqual(expect.arrayContaining([
      arxivProvenance,
      pubmedProvenance
    ]));
    expect(stored[0].sourceProvenance).toHaveLength(2);
    await expect(client.dailyCanonicalCandidate.count({ where: { runId } })).resolves.toBe(1);
    await expect(provenanceCount()).resolves.toBe(2);
  });

  it("maps existing and new candidates by canonical key and remains duplicate-free on rerun", async () => {
    const [existingSource, newSource] = await createSourceCandidates([
      { source: "ARXIV", externalId: "existing-source" },
      { source: "PUBMED", externalId: "new-source" }
    ]);
    const existingProvenance = provenance(
      existingSource.id,
      "arxiv",
      existingSource.externalId,
      "source_external_id"
    );
    const newProvenance = provenance(newSource.id, "pubmed", newSource.externalId, "doi");

    await repository.replaceCanonicalCandidates({
      runId,
      canonicalCandidates: [canonical("key-z-existing", [existingProvenance])]
    });
    const [initialExisting] = await repository.listCanonicalCandidates(runId);

    // Input order intentionally differs from database creation order. Correct provenance
    // association therefore requires canonicalKey -> id lookup, not array-index zipping.
    const replacement = [
      canonical("key-a-new", [newProvenance, newProvenance]),
      canonical("key-z-existing", [existingProvenance, existingProvenance])
    ];
    await repository.replaceCanonicalCandidates({ runId, canonicalCandidates: replacement });

    const firstPass = await repository.listCanonicalCandidates(runId);
    const firstByKey = new Map(firstPass.map((candidate) => [candidate.canonicalKey, candidate]));
    expect(firstByKey.get("key-z-existing")?.id).toBe(initialExisting.id);
    expect(firstByKey.get("key-z-existing")?.sourceProvenance).toEqual([existingProvenance]);
    expect(firstByKey.get("key-a-new")?.sourceProvenance).toEqual([newProvenance]);

    await repository.replaceCanonicalCandidates({ runId, canonicalCandidates: replacement });

    const secondPass = await repository.listCanonicalCandidates(runId);
    const secondByKey = new Map(secondPass.map((candidate) => [candidate.canonicalKey, candidate]));
    expect(secondPass).toHaveLength(2);
    expect(secondByKey.get("key-z-existing")?.id).toBe(initialExisting.id);
    expect(secondByKey.get("key-a-new")?.id).toBe(firstByKey.get("key-a-new")?.id);
    expect(secondByKey.get("key-z-existing")?.sourceProvenance).toEqual([existingProvenance]);
    expect(secondByKey.get("key-a-new")?.sourceProvenance).toEqual([newProvenance]);
    await expect(provenanceCount()).resolves.toBe(2);
  });

  it("preserves the canonical id when the same provenance set arrives in a different order", async () => {
    const [arxiv, pubmed] = await createSourceCandidates([
      { source: "ARXIV", externalId: "order-arxiv" },
      { source: "PUBMED", externalId: "order-pubmed" }
    ]);
    const arxivProvenance = provenance(arxiv.id, "arxiv", arxiv.externalId, "title");
    const pubmedProvenance = provenance(pubmed.id, "pubmed", pubmed.externalId, "title");

    await repository.replaceCanonicalCandidates({
      runId,
      canonicalCandidates: [canonical("canonical-order", [arxivProvenance, pubmedProvenance])]
    });
    const [first] = await repository.listCanonicalCandidates(runId);

    await repository.replaceCanonicalCandidates({
      runId,
      canonicalCandidates: [canonical("canonical-order", [pubmedProvenance, arxivProvenance])]
    });
    const [second] = await repository.listCanonicalCandidates(runId);

    expect(second.id).toBe(first.id);
    expect(second.sourceProvenance).toHaveLength(2);
    await expect(provenanceCount()).resolves.toBe(2);
  });

  it("rejects one source candidate being assigned to different canonical keys atomically", async () => {
    const [source] = await createSourceCandidates([
      { source: "JOURNAL", externalId: "conflicting-source" }
    ]);
    const sharedProvenance = provenance(
      source.id,
      "journal",
      source.externalId,
      "source_external_id"
    );

    await expect(repository.replaceCanonicalCandidates({
      runId,
      canonicalCandidates: [
        canonical("canonical-left", [sharedProvenance]),
        canonical("canonical-right", [sharedProvenance])
      ]
    })).rejects.toThrow(/sourceCandidateId|provenance|canonical/i);

    await expect(client.dailyCanonicalCandidate.count({ where: { runId } })).resolves.toBe(0);
    await expect(provenanceCount()).resolves.toBe(0);
  });

  it("removes stale canonical rows and provenance while updating retained canonical data", async () => {
    const [keptSource, removedSource] = await createSourceCandidates([
      { source: "BIORXIV", externalId: "kept-source" },
      { source: "JOURNAL", externalId: "removed-source" }
    ]);
    const keptProvenance = provenance(keptSource.id, "biorxiv", keptSource.externalId, "title");
    const removedProvenance = provenance(
      removedSource.id,
      "journal",
      removedSource.externalId,
      "source_external_id"
    );

    await repository.replaceCanonicalCandidates({
      runId,
      canonicalCandidates: [
        canonical("canonical-kept", [keptProvenance], { title: "Old title" }),
        canonical("canonical-removed", [removedProvenance])
      ]
    });
    const initial = await repository.listCanonicalCandidates(runId);
    const keptId = initial.find((candidate) => candidate.canonicalKey === "canonical-kept")?.id;

    await repository.replaceCanonicalCandidates({
      runId,
      canonicalCandidates: [
        canonical("canonical-kept", [keptProvenance], {
          title: "Updated title",
          abstractNote: "Updated canonical content"
        })
      ]
    });

    const [stored] = await repository.listCanonicalCandidates(runId);
    expect(stored).toMatchObject({
      canonicalKey: "canonical-kept",
      title: "Updated title",
      abstractNote: "Updated canonical content"
    });
    expect(stored.id).not.toBe(keptId);
    await expect(client.dailyCanonicalCandidate.count({ where: { runId } })).resolves.toBe(1);
    await expect(provenanceCount()).resolves.toBe(1);
    await expect(client.dailyCanonicalCandidateProvenance.findUnique({
      where: { sourceCandidateId: removedSource.id }
    })).resolves.toBeNull();
  });

  function canonical(
    canonicalKey: string,
    sourceProvenance: CanonicalCandidateProvenanceRecord[],
    overrides: Partial<CanonicalDailyCandidateCreateInput> = {}
  ): CanonicalDailyCandidateCreateInput {
    return {
      runId,
      canonicalKey,
      title: `Title for ${canonicalKey}`,
      authors: [],
      mergedSourceCount: sourceProvenance.length,
      sourceProvenance,
      ...overrides
    };
  }

  async function createSourceCandidates(
    candidates: Array<{
      source: "BIORXIV" | "ARXIV" | "PUBMED" | "JOURNAL";
      externalId: string;
    }>
  ) {
    return Promise.all(candidates.map((candidate) => client.dailyCandidate.create({
      data: {
        runId,
        source: candidate.source,
        externalId: candidate.externalId,
        title: `Raw ${candidate.externalId}`,
        authorsJson: [],
        sourcePayloadJson: { fixture: true }
      }
    })));
  }

  function provenance(
    sourceCandidateId: string,
    source: CanonicalCandidateProvenanceRecord["source"],
    externalId: string,
    mergeReason: CanonicalCandidateProvenanceRecord["mergeReason"]
  ): CanonicalCandidateProvenanceRecord {
    return { sourceCandidateId, source, externalId, mergeReason };
  }

  function provenanceCount() {
    return client.dailyCanonicalCandidateProvenance.count({
      where: { canonicalCandidate: { runId } }
    });
  }
});

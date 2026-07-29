import { Prisma, type PrismaClient } from "../../generated/prisma";
import type {
  CandidateNormalizationRepository,
  CanonicalDailyCandidateCreateInput,
  CanonicalDailyCandidateRecord,
  RawDailyCandidateRecord
} from "../../modules/normalize-dedupe/types";

const BATCH_SIZE = 500;

export class PrismaCandidateNormalizationRepository implements CandidateNormalizationRepository {
  constructor(private readonly db: PrismaClient) {}

  async listRunCandidates(runId: string): Promise<RawDailyCandidateRecord[]> {
    const rows = await this.db.dailyCandidate.findMany({
      where: { runId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });

    return rows.map((row) => ({
      id: row.id,
      runId: row.runId,
      source: fromDbSource(row.source),
      externalId: row.externalId,
      title: row.title ?? undefined,
      abstractNote: row.abstractNote ?? undefined,
      publishedAt: row.publishedAt ?? undefined,
      indexedAt: row.indexedAt ?? undefined,
      url: row.url ?? undefined,
      doi: row.doi ?? undefined,
      pmid: row.pmid ?? undefined,
      arxivId: row.arxivId ?? undefined,
      bioRxivId: row.bioRxivId ?? undefined,
      journalName: row.journalName ?? undefined,
      authors: toStringArray(row.authorsJson),
      sourcePayload: toObject(row.sourcePayloadJson)
    }));
  }

  async replaceCanonicalCandidates(input: {
    runId: string;
    canonicalCandidates: CanonicalDailyCandidateCreateInput[];
  }): Promise<void> {
    const canonicalCandidates = prepareCanonicalCandidates(input.runId, input.canonicalCandidates);

    await this.db.$transaction(async (tx) => {
      const existing = await tx.dailyCanonicalCandidate.findMany({
        where: { runId: input.runId },
        select: {
          id: true,
          canonicalKey: true,
          title: true,
          abstractNote: true,
          publishedAt: true,
          indexedAt: true,
          url: true,
          doi: true,
          pmid: true,
          arxivId: true,
          bioRxivId: true,
          journalName: true,
          authorsJson: true,
          mergedSourceCount: true,
          sourceProvenanceJson: true
        }
      });
      const desiredByKey = new Map(
        canonicalCandidates.map((candidate) => [candidate.canonicalKey, candidate])
      );
      const existingByKey = new Map(existing.map((candidate) => [candidate.canonicalKey, candidate]));
      const idsToReplace = existing
        .filter((candidate) => {
          const desired = desiredByKey.get(candidate.canonicalKey);
          return !desired || !sameCanonicalPayload(candidate, desired);
        })
        .map((candidate) => candidate.id);

      await tx.dailyCanonicalCandidateProvenance.deleteMany({
        where: {
          canonicalCandidate: {
            runId: input.runId
          }
        }
      });

      for (const ids of chunks(idsToReplace)) {
        await tx.dailyCanonicalCandidate.deleteMany({
          where: { id: { in: ids } }
        });
      }

      const replacedIds = new Set(idsToReplace);
      const candidatesToCreate = canonicalCandidates.filter((candidate) => {
        const current = existingByKey.get(candidate.canonicalKey);
        return !current || replacedIds.has(current.id);
      });
      for (const candidateBatch of chunks(candidatesToCreate)) {
        await tx.dailyCanonicalCandidate.createMany({
          data: candidateBatch.map((candidate) => ({
            runId: input.runId,
            canonicalKey: candidate.canonicalKey,
            title: candidate.title ?? null,
            abstractNote: candidate.abstractNote ?? null,
            publishedAt: candidate.publishedAt ?? null,
            indexedAt: candidate.indexedAt ?? null,
            url: candidate.url ?? null,
            doi: candidate.doi ?? null,
            pmid: candidate.pmid ?? null,
            arxivId: candidate.arxivId ?? null,
            bioRxivId: candidate.bioRxivId ?? null,
            journalName: candidate.journalName ?? null,
            authorsJson: candidate.authors as unknown as Prisma.InputJsonValue,
            mergedSourceCount: candidate.mergedSourceCount,
            sourceProvenanceJson: candidate.sourceProvenance as unknown as Prisma.InputJsonValue
          }))
        });
      }

      const persisted = await tx.dailyCanonicalCandidate.findMany({
        where: { runId: input.runId },
        select: { id: true, canonicalKey: true }
      });
      const candidateIdByKey = new Map(persisted.map((candidate) => [candidate.canonicalKey, candidate.id]));
      if (candidateIdByKey.size !== canonicalCandidates.length) {
        throw new Error("Canonical candidate batch persistence produced an incomplete key mapping.");
      }

      const provenanceRows = canonicalCandidates.flatMap((candidate) => {
        const canonicalCandidateId = candidateIdByKey.get(candidate.canonicalKey);
        if (!canonicalCandidateId) {
          throw new Error("Canonical candidate batch persistence could not resolve a stable key.");
        }
        return candidate.sourceProvenance.map((provenance) => ({
          canonicalCandidateId,
          sourceCandidateId: provenance.sourceCandidateId,
          source: toDbSource(provenance.source),
          externalId: provenance.externalId,
          mergeReason: toDbMergeReason(provenance.mergeReason)
        }));
      });
      for (const provenanceBatch of chunks(provenanceRows)) {
        await tx.dailyCanonicalCandidateProvenance.createMany({
          data: provenanceBatch
        });
      }
    }, { timeout: 60_000 });
  }

  async listCanonicalCandidates(runId: string): Promise<CanonicalDailyCandidateRecord[]> {
    const rows = await this.db.dailyCanonicalCandidate.findMany({
      where: { runId },
      include: {
        provenances: {
          orderBy: [{ sourceCandidateId: "asc" }]
        }
      },
      orderBy: [{ createdAt: "asc" }]
    });

    return rows.map((row) => ({
      id: row.id,
      runId: row.runId,
      canonicalKey: row.canonicalKey,
      title: row.title ?? undefined,
      abstractNote: row.abstractNote ?? undefined,
      publishedAt: row.publishedAt ?? undefined,
      indexedAt: row.indexedAt ?? undefined,
      url: row.url ?? undefined,
      doi: row.doi ?? undefined,
      pmid: row.pmid ?? undefined,
      arxivId: row.arxivId ?? undefined,
      bioRxivId: row.bioRxivId ?? undefined,
      journalName: row.journalName ?? undefined,
      authors: toStringArray(row.authorsJson),
      mergedSourceCount: row.mergedSourceCount,
      sourceProvenance: row.provenances.map((provenance) => ({
        sourceCandidateId: provenance.sourceCandidateId,
        source: fromDbSource(provenance.source),
        externalId: provenance.externalId,
        mergeReason: fromDbMergeReason(provenance.mergeReason)
      }))
    }));
  }
}

type PreparedCanonicalCandidate = CanonicalDailyCandidateCreateInput;

type PersistedCanonicalPayload = {
  title: string | null;
  abstractNote: string | null;
  publishedAt: Date | null;
  indexedAt: Date | null;
  url: string | null;
  doi: string | null;
  pmid: string | null;
  arxivId: string | null;
  bioRxivId: string | null;
  journalName: string | null;
  authorsJson: Prisma.JsonValue | null;
  mergedSourceCount: number;
  sourceProvenanceJson: Prisma.JsonValue;
};

function prepareCanonicalCandidates(
  runId: string,
  candidates: CanonicalDailyCandidateCreateInput[]
): PreparedCanonicalCandidate[] {
  const byCanonicalKey = new Map<string, PreparedCanonicalCandidate>();
  const provenanceOwner = new Map<string, { canonicalKey: string; signature: string }>();

  for (const candidate of candidates) {
    const existing = byCanonicalKey.get(candidate.canonicalKey);
    if (existing && canonicalInputSignature(existing) !== canonicalInputSignature(candidate)) {
      throw new Error("Conflicting canonical candidate payloads share the same stable key.");
    }
    const prepared = existing ?? {
      ...candidate,
      runId,
      authors: [...candidate.authors],
      sourceProvenance: []
    };
    if (!existing) byCanonicalKey.set(candidate.canonicalKey, prepared);

    for (const provenance of candidate.sourceProvenance) {
      const signature = stableJson({
        source: provenance.source,
        externalId: provenance.externalId,
        mergeReason: provenance.mergeReason
      });
      const owner = provenanceOwner.get(provenance.sourceCandidateId);
      if (owner) {
        if (owner.canonicalKey !== candidate.canonicalKey || owner.signature !== signature) {
          throw new Error("A source candidate cannot map to conflicting canonical provenance.");
        }
        continue;
      }
      provenanceOwner.set(provenance.sourceCandidateId, {
        canonicalKey: candidate.canonicalKey,
        signature
      });
      prepared.sourceProvenance.push({ ...provenance });
    }
  }

  return [...byCanonicalKey.values()].map((candidate) => {
    const sourceProvenance = [...candidate.sourceProvenance].sort(compareProvenance);
    return {
      ...candidate,
      sourceProvenance,
      mergedSourceCount: sourceProvenance.length > 0
        ? new Set(sourceProvenance.map((provenance) => provenance.source)).size
        : candidate.mergedSourceCount
    };
  });
}

function canonicalInputSignature(candidate: CanonicalDailyCandidateCreateInput) {
  return stableJson({
    title: candidate.title ?? null,
    abstractNote: candidate.abstractNote ?? null,
    publishedAt: candidate.publishedAt?.toISOString() ?? null,
    indexedAt: candidate.indexedAt?.toISOString() ?? null,
    url: candidate.url ?? null,
    doi: candidate.doi ?? null,
    pmid: candidate.pmid ?? null,
    arxivId: candidate.arxivId ?? null,
    bioRxivId: candidate.bioRxivId ?? null,
    journalName: candidate.journalName ?? null,
    authors: candidate.authors
  });
}

function sameCanonicalPayload(
  persisted: PersistedCanonicalPayload,
  desired: PreparedCanonicalCandidate
) {
  return stableJson({
    title: persisted.title,
    abstractNote: persisted.abstractNote,
    publishedAt: persisted.publishedAt?.toISOString() ?? null,
    indexedAt: persisted.indexedAt?.toISOString() ?? null,
    url: persisted.url,
    doi: persisted.doi,
    pmid: persisted.pmid,
    arxivId: persisted.arxivId,
    bioRxivId: persisted.bioRxivId,
    journalName: persisted.journalName,
    authors: persisted.authorsJson,
    mergedSourceCount: persisted.mergedSourceCount,
    sourceProvenance: normalizePersistedProvenance(persisted.sourceProvenanceJson)
  }) === stableJson({
    title: desired.title ?? null,
    abstractNote: desired.abstractNote ?? null,
    publishedAt: desired.publishedAt?.toISOString() ?? null,
    indexedAt: desired.indexedAt?.toISOString() ?? null,
    url: desired.url ?? null,
    doi: desired.doi ?? null,
    pmid: desired.pmid ?? null,
    arxivId: desired.arxivId ?? null,
    bioRxivId: desired.bioRxivId ?? null,
    journalName: desired.journalName ?? null,
    authors: desired.authors,
    mergedSourceCount: desired.mergedSourceCount,
    sourceProvenance: desired.sourceProvenance
  });
}

function compareProvenance(
  left: CanonicalDailyCandidateCreateInput["sourceProvenance"][number],
  right: CanonicalDailyCandidateCreateInput["sourceProvenance"][number]
) {
  return stableJson(left).localeCompare(stableJson(right));
}

function normalizePersistedProvenance(value: Prisma.JsonValue) {
  return Array.isArray(value)
    ? [...value].sort((left, right) => stableJson(left).localeCompare(stableJson(right)))
    : value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortJson(entry)])
  );
}

function chunks<T>(values: T[], size = BATCH_SIZE): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function toDbSource(
  source: "biorxiv" | "arxiv" | "pubmed" | "journal"
): "BIORXIV" | "ARXIV" | "PUBMED" | "JOURNAL" {
  if (source === "biorxiv") {
    return "BIORXIV";
  }
  if (source === "arxiv") {
    return "ARXIV";
  }
  if (source === "pubmed") {
    return "PUBMED";
  }
  return "JOURNAL";
}

function fromDbSource(source: "BIORXIV" | "ARXIV" | "PUBMED" | "JOURNAL") {
  if (source === "BIORXIV") {
    return "biorxiv";
  }
  if (source === "ARXIV") {
    return "arxiv";
  }
  if (source === "PUBMED") {
    return "pubmed";
  }
  return "journal";
}

function toDbMergeReason(
  value: "doi" | "title_url" | "title" | "source_external_id"
): "DOI" | "TITLE_URL" | "TITLE" | "SOURCE_EXTERNAL_ID" {
  if (value === "doi") {
    return "DOI";
  }
  if (value === "title_url") {
    return "TITLE_URL";
  }
  if (value === "title") {
    return "TITLE";
  }
  return "SOURCE_EXTERNAL_ID";
}

function fromDbMergeReason(value: "DOI" | "TITLE_URL" | "TITLE" | "SOURCE_EXTERNAL_ID") {
  if (value === "DOI") {
    return "doi";
  }
  if (value === "TITLE_URL") {
    return "title_url";
  }
  if (value === "TITLE") {
    return "title";
  }
  return "source_external_id";
}

function toStringArray(value: Prisma.JsonValue | null): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function toObject(value: Prisma.JsonValue): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

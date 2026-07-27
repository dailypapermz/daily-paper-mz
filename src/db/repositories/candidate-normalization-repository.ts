import { Prisma, type PrismaClient } from "../../generated/prisma";
import type {
  CandidateNormalizationRepository,
  CanonicalDailyCandidateRecord,
  RawDailyCandidateRecord
} from "../../modules/normalize-dedupe/types";

export class PrismaCandidateNormalizationRepository implements CandidateNormalizationRepository {
  constructor(private readonly db: PrismaClient) {}

  async listRunCandidates(runId: string): Promise<RawDailyCandidateRecord[]> {
    const rows = await this.db.dailyCandidate.findMany({
      where: { runId },
      orderBy: [{ createdAt: "asc" }]
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
    canonicalCandidates: Array<{
      runId: string;
      canonicalKey: string;
      title?: string;
      abstractNote?: string;
      publishedAt?: Date;
      indexedAt?: Date;
      url?: string;
      doi?: string;
      pmid?: string;
      arxivId?: string;
      bioRxivId?: string;
      journalName?: string;
      authors: string[];
      mergedSourceCount: number;
      sourceProvenance: Array<{
        sourceCandidateId: string;
        source: "biorxiv" | "arxiv" | "pubmed" | "journal";
        externalId: string;
        mergeReason: "doi" | "title_url" | "title" | "source_external_id";
      }>;
    }>;
  }): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await tx.dailyCanonicalCandidateProvenance.deleteMany({
        where: {
          canonicalCandidate: {
            runId: input.runId
          }
        }
      });

      await tx.dailyCanonicalCandidate.deleteMany({
        where: {
          runId: input.runId
        }
      });

      for (const candidate of input.canonicalCandidates) {
        await tx.dailyCanonicalCandidate.create({
          data: {
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
            sourceProvenanceJson: candidate.sourceProvenance as unknown as Prisma.InputJsonValue,
            provenances: {
              create: candidate.sourceProvenance.map((provenance) => ({
                sourceCandidateId: provenance.sourceCandidateId,
                source: toDbSource(provenance.source),
                externalId: provenance.externalId,
                mergeReason: toDbMergeReason(provenance.mergeReason)
              }))
            }
          }
        });
      }
    }, { timeout: 60_000 });
  }

  async listCanonicalCandidates(runId: string): Promise<CanonicalDailyCandidateRecord[]> {
    const rows = await this.db.dailyCanonicalCandidate.findMany({
      where: { runId },
      include: {
        provenances: true
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

function toDbSource(source: "biorxiv" | "arxiv" | "pubmed" | "journal") {
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

function toDbMergeReason(value: "doi" | "title_url" | "title" | "source_external_id") {
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

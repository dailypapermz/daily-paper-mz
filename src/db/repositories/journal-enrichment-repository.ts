import { Prisma, type PrismaClient } from "../../generated/prisma";
import type {
  JournalEnrichmentRepository,
  JournalMetricRecord
} from "../../modules/candidate-enrich/types";

export class PrismaJournalEnrichmentRepository implements JournalEnrichmentRepository {
  constructor(private readonly db: PrismaClient) {}

  async listCandidatesForRun(runId: string) {
    const rows = await this.db.dailyCandidate.findMany({
      where: { runId },
      select: {
        id: true,
        journalName: true
      }
    });

    return rows.map((row) => ({
      candidateId: row.id,
      journalName: row.journalName ?? undefined
    }));
  }

  async getFreshCache(input: { provider: string; journalName: string; now?: Date }) {
    const now = input.now ?? new Date();

    const cache = await this.db.journalEnrichmentCache.findUnique({
      where: {
        journalName_provider: {
          journalName: input.journalName,
          provider: input.provider
        }
      }
    });

    if (!cache || cache.expiresAt < now) {
      return null;
    }

    return {
      quartile: cache.quartile ?? undefined,
      impactScore: cache.impactScore ?? undefined,
      rawPayload: toObject(cache.rawPayloadJson),
      normalized: toObject(cache.normalizedJson)
    } satisfies JournalMetricRecord;
  }

  async upsertCache(input: {
    provider: string;
    journalName: string;
    metric: JournalMetricRecord;
    expiresAt: Date;
  }) {
    await this.db.journalEnrichmentCache.upsert({
      where: {
        journalName_provider: {
          journalName: input.journalName,
          provider: input.provider
        }
      },
      create: {
        journalName: input.journalName,
        provider: input.provider,
        quartile: input.metric.quartile ?? null,
        impactScore: input.metric.impactScore ?? null,
        rawPayloadJson: toJson(input.metric.rawPayload),
        normalizedJson: toJson(input.metric.normalized),
        fetchedAt: new Date(),
        expiresAt: input.expiresAt
      },
      update: {
        quartile: input.metric.quartile ?? null,
        impactScore: input.metric.impactScore ?? null,
        rawPayloadJson: toJson(input.metric.rawPayload),
        normalizedJson: toJson(input.metric.normalized),
        fetchedAt: new Date(),
        expiresAt: input.expiresAt
      }
    });
  }

  async saveCandidateEnrichment(input: {
    candidateId: string;
    provider: string;
    status: "enriched" | "not_found" | "failed";
    metric?: JournalMetricRecord;
    errorMessage?: string;
  }) {
    await this.db.dailyCandidateJournalEnrichment.upsert({
      where: {
        candidateId: input.candidateId
      },
      create: {
        candidateId: input.candidateId,
        provider: input.provider,
        status: toDbStatus(input.status),
        quartile: input.metric?.quartile ?? null,
        impactScore: input.metric?.impactScore ?? null,
        rawPayloadJson: toJson(input.metric?.rawPayload),
        normalizedJson: toJson(input.metric?.normalized),
        errorMessage: input.errorMessage ?? null,
        enrichedAt: new Date()
      },
      update: {
        provider: input.provider,
        status: toDbStatus(input.status),
        quartile: input.metric?.quartile ?? null,
        impactScore: input.metric?.impactScore ?? null,
        rawPayloadJson: toJson(input.metric?.rawPayload),
        normalizedJson: toJson(input.metric?.normalized),
        errorMessage: input.errorMessage ?? null,
        enrichedAt: new Date()
      }
    });
  }
}

function toDbStatus(value: "enriched" | "not_found" | "failed") {
  if (value === "enriched") {
    return "ENRICHED";
  }
  if (value === "not_found") {
    return "NOT_FOUND";
  }
  return "FAILED";
}

function toObject(value: Prisma.JsonValue | null): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function toJson(
  value: Record<string, unknown> | undefined
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (!value) {
    return Prisma.JsonNull;
  }

  return value as Prisma.InputJsonValue;
}


import { logger } from "../../lib/logging";
import type {
  CandidateJournalRecord,
  JournalEnrichmentRepository,
  JournalEnrichmentResult,
  JournalEnrichmentService,
  JournalEnrichmentProvider,
  JournalMetricRecord
} from "./types";

type JournalEnrichmentServiceOptions = {
  cacheTtlHours?: number;
};

export class DefaultJournalEnrichmentService implements JournalEnrichmentService {
  private readonly cacheTtlHours: number;

  constructor(
    private readonly repository: JournalEnrichmentRepository,
    private readonly provider: JournalEnrichmentProvider,
    options?: JournalEnrichmentServiceOptions
  ) {
    this.cacheTtlHours = options?.cacheTtlHours && options.cacheTtlHours > 0 ? options.cacheTtlHours : 24 * 30;
  }

  async enrichRun(runId: string): Promise<JournalEnrichmentResult> {
    const candidates = await this.repository.listCandidatesForRun(runId);

    let processed = 0;
    let enriched = 0;
    let notFound = 0;
    let failed = 0;

    for (const candidate of candidates) {
      processed += 1;

      const status = await this.enrichCandidate(candidate);
      if (status === "enriched") {
        enriched += 1;
      } else if (status === "not_found") {
        notFound += 1;
      } else {
        failed += 1;
      }
    }

    return {
      runId,
      provider: this.provider.name,
      processed,
      enriched,
      notFound,
      failed
    };
  }

  private async enrichCandidate(candidate: CandidateJournalRecord): Promise<"enriched" | "not_found" | "failed"> {
    const journalName = normalizeJournalName(candidate.journalName);

    if (!journalName) {
      await this.safeSaveCandidateStatus({
        candidateId: candidate.candidateId,
        provider: this.provider.name,
        status: "not_found"
      });
      return "not_found";
    }

    try {
      const cached = await this.repository.getFreshCache({
        provider: this.provider.name,
        journalName
      });

      if (cached) {
        await this.safeSaveCandidateStatus({
          candidateId: candidate.candidateId,
          provider: this.provider.name,
          status: "enriched",
          metric: cached
        });
        return "enriched";
      }

      const metric = await this.provider.fetchJournalMetric(journalName);

      if (!metric) {
        await this.safeSaveCandidateStatus({
          candidateId: candidate.candidateId,
          provider: this.provider.name,
          status: "not_found"
        });
        return "not_found";
      }

      await this.repository.upsertCache({
        provider: this.provider.name,
        journalName,
        metric,
        expiresAt: addHours(new Date(), this.cacheTtlHours)
      });

      await this.safeSaveCandidateStatus({
        candidateId: candidate.candidateId,
        provider: this.provider.name,
        status: "enriched",
        metric
      });
      return "enriched";
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown enrichment error";

      logger.warn("Journal enrichment failed for candidate", {
        candidateId: candidate.candidateId,
        journalName,
        provider: this.provider.name,
        errorMessage
      });

      await this.safeSaveCandidateStatus({
        candidateId: candidate.candidateId,
        provider: this.provider.name,
        status: "failed",
        errorMessage
      });
      return "failed";
    }
  }

  private async safeSaveCandidateStatus(input: {
    candidateId: string;
    provider: string;
    status: "enriched" | "not_found" | "failed";
    metric?: JournalMetricRecord;
    errorMessage?: string;
  }) {
    try {
      await this.repository.saveCandidateEnrichment(input);
    } catch (error) {
      logger.error("Failed to persist candidate journal enrichment status", {
        candidateId: input.candidateId,
        provider: input.provider,
        status: input.status,
        errorMessage: error instanceof Error ? error.message : "Unknown persistence error"
      });
    }
  }
}

function normalizeJournalName(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

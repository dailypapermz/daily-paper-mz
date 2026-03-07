import { describe, expect, it, vi } from "vitest";

import { AppError } from "../../lib/errors";
import { DefaultJournalEnrichmentService } from "./journal-enrichment.service";
import type {
  CandidateJournalRecord,
  JournalEnrichmentProvider,
  JournalMetricRecord
} from "./types";

describe("DefaultJournalEnrichmentService", () => {
  it("uses cache and provider lookup and persists enrichment statuses", async () => {
    const candidates: CandidateJournalRecord[] = [
      { candidateId: "candidate-1", journalName: "Nature" },
      { candidateId: "candidate-2", journalName: " " },
      { candidateId: "candidate-3", journalName: "Cell" }
    ];
    const saveCandidateEnrichment = vi.fn();
    const upsertCache = vi.fn();
    const getFreshCache = vi
      .fn()
      .mockResolvedValueOnce({
        quartile: "Q1",
        impactScore: 15.4
      } satisfies JournalMetricRecord)
      .mockResolvedValueOnce(null);

    const provider: JournalEnrichmentProvider = {
      name: "easyscholar",
      fetchJournalMetric: vi.fn().mockResolvedValue({
        quartile: "Q1",
        impactScore: 14.9
      } satisfies JournalMetricRecord)
    };

    const service = new DefaultJournalEnrichmentService(
      {
        listCandidatesForRun: vi.fn().mockResolvedValue(candidates),
        getFreshCache,
        upsertCache,
        saveCandidateEnrichment
      },
      provider
    );

    const result = await service.enrichRun("run-1");

    expect(result).toEqual({
      runId: "run-1",
      provider: "easyscholar",
      processed: 3,
      enriched: 2,
      notFound: 1,
      failed: 0
    });
    expect(upsertCache).toHaveBeenCalledTimes(1);
    expect(saveCandidateEnrichment).toHaveBeenCalledTimes(3);
    expect(saveCandidateEnrichment).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        candidateId: "candidate-2",
        status: "not_found"
      })
    );
  });

  it("returns not_found when provider has no journal match", async () => {
    const saveCandidateEnrichment = vi.fn();
    const provider: JournalEnrichmentProvider = {
      name: "easyscholar",
      fetchJournalMetric: vi.fn().mockResolvedValue(null)
    };

    const service = new DefaultJournalEnrichmentService(
      {
        listCandidatesForRun: vi.fn().mockResolvedValue([{ candidateId: "candidate-1", journalName: "Unknown Journal" }]),
        getFreshCache: vi.fn().mockResolvedValue(null),
        upsertCache: vi.fn(),
        saveCandidateEnrichment
      },
      provider
    );

    const result = await service.enrichRun("run-2");

    expect(result.notFound).toBe(1);
    expect(result.failed).toBe(0);
    expect(saveCandidateEnrichment).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: "candidate-1",
        status: "not_found"
      })
    );
  });

  it("gracefully degrades when provider fails", async () => {
    const saveCandidateEnrichment = vi.fn();
    const provider: JournalEnrichmentProvider = {
      name: "unavailable",
      fetchJournalMetric: vi
        .fn()
        .mockRejectedValue(new AppError("JOURNAL_ENRICHMENT_UNAVAILABLE", "Provider not configured", 503))
    };

    const service = new DefaultJournalEnrichmentService(
      {
        listCandidatesForRun: vi.fn().mockResolvedValue([{ candidateId: "candidate-1", journalName: "Nature" }]),
        getFreshCache: vi.fn().mockResolvedValue(null),
        upsertCache: vi.fn(),
        saveCandidateEnrichment
      },
      provider
    );

    const result = await service.enrichRun("run-3");

    expect(result.enriched).toBe(0);
    expect(result.failed).toBe(1);
    expect(saveCandidateEnrichment).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: "candidate-1",
        status: "failed"
      })
    );
  });
});

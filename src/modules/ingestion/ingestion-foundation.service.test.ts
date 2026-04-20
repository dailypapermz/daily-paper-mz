import { describe, expect, it } from "vitest";

import { AppError } from "../../lib/errors";
import { createAdapterMap, DefaultDailyIngestionService } from "./ingestion-foundation.service";
import type {
  DailyIngestionRepository,
  DailySourceAdapter,
  DailySourceAdapterCandidate
} from "./types";

class FakeRepository implements DailyIngestionRepository {
  private latestRun: {
    id: string;
    source: "biorxiv" | "arxiv" | "pubmed" | "journal" | "aggregated";
    status: "running" | "success" | "failed";
    runDate: string;
    startedAt: string;
    candidatesCount: number;
  } | null = null;

  private candidates: Array<{
    id: string;
    runId: string;
    source: "biorxiv" | "arxiv" | "pubmed" | "journal";
    externalId: string;
    sourcePayload: Record<string, unknown>;
    authors: string[];
  }> = [];

  async createRun(input: {
    source: "biorxiv" | "arxiv" | "pubmed" | "journal" | "aggregated";
    runDate: Date;
  }) {
    this.latestRun = {
      id: "run-1",
      source: input.source,
      status: "running",
      runDate: input.runDate.toISOString(),
      startedAt: new Date().toISOString(),
      candidatesCount: 0
    };
    return { id: "run-1" };
  }

  async saveCandidates(input: {
    runId: string;
    entries: Array<{
      source: "biorxiv" | "arxiv" | "pubmed" | "journal";
      candidate: DailySourceAdapterCandidate;
    }>;
  }) {
    this.candidates = input.entries.map((entry, index) => ({
      id: `c-${index + 1}`,
      runId: input.runId,
      source: entry.source,
      externalId: entry.candidate.externalId,
      sourcePayload: entry.candidate.sourcePayload,
      authors: entry.candidate.authors
    }));

    return this.candidates.length;
  }

  async markRunSucceeded(input: { runId: string; candidatesCount: number }) {
    this.latestRun = {
      id: input.runId,
      source: this.latestRun?.source ?? "biorxiv",
      status: "success",
      runDate: this.latestRun?.runDate ?? new Date().toISOString(),
      startedAt: this.latestRun?.startedAt ?? new Date().toISOString(),
      candidatesCount: input.candidatesCount
    };

    return {
      ...this.latestRun,
      finishedAt: new Date().toISOString()
    };
  }

  async markRunFailed(input: { runId: string; errorMessage: string }) {
    this.latestRun = {
      id: input.runId,
      source: this.latestRun?.source ?? "biorxiv",
      status: "failed",
      runDate: this.latestRun?.runDate ?? new Date().toISOString(),
      startedAt: this.latestRun?.startedAt ?? new Date().toISOString(),
      candidatesCount: 0
    };

    return {
      ...this.latestRun,
      finishedAt: new Date().toISOString(),
      errorMessage: input.errorMessage
    };
  }

  async getLatestRun() {
    return this.latestRun;
  }

  async listCandidatesByRun() {
    return this.candidates;
  }
}

describe("DefaultDailyIngestionService", () => {
  it("runs ingestion with configured adapter and stores today-only candidates", async () => {
    const adapter: DailySourceAdapter = {
      source: "biorxiv",
      async fetchCandidatesForDay(window) {
        return [
          {
            externalId: " today-1 ",
            publishedAt: new Date(window.dayStart.getTime() + 60 * 60 * 1000),
            sourcePayload: { id: 1 },
            authors: ["Alice", " Alice "]
          },
          {
            externalId: "today-1",
            publishedAt: new Date(window.dayStart.getTime() + 90 * 60 * 1000),
            sourcePayload: { id: "duplicate" },
            authors: ["Duplicate"]
          },
          {
            externalId: "old-1",
            publishedAt: new Date(window.dayStart.getTime() - 60 * 60 * 1000),
            sourcePayload: { id: 2 },
            authors: []
          }
        ];
      }
    };

    const service = new DefaultDailyIngestionService(createAdapterMap([adapter]), new FakeRepository());

    const result = await service.runSourceIngestion({
      source: "biorxiv",
      runDate: "2026-03-07T00:00:00.000Z"
    });

    expect(result.run.status).toBe("success");
    expect(result.run.candidatesCount).toBe(1);
    expect(result.candidates[0].externalId).toBe("today-1");
    expect(result.candidates[0].sourcePayload.id).toBe(1);
  });

  it("throws controlled error when adapter is missing", async () => {
    const service = new DefaultDailyIngestionService(createAdapterMap([]), new FakeRepository());

    await expect(service.runSourceIngestion({ source: "pubmed" })).rejects.toBeInstanceOf(AppError);
  });

  it("runs aggregated ingestion and preserves per-source provenance", async () => {
    const adapters: DailySourceAdapter[] = [
      {
        source: "arxiv",
        async fetchCandidatesForDay(window) {
          return [
            {
              externalId: "ax-1",
              publishedAt: new Date(window.dayStart.getTime() + 30 * 60 * 1000),
              sourcePayload: { id: "ax-1" },
              authors: ["Author A"]
            }
          ];
        }
      },
      {
        source: "pubmed",
        async fetchCandidatesForDay(window) {
          return [
            {
              externalId: "pm-1",
              publishedAt: new Date(window.dayEnd.getTime() + 1),
              indexedAt: new Date(window.dayStart.getTime() + 45 * 60 * 1000),
              sourcePayload: { id: "pm-1" },
              authors: ["Author P"]
            }
          ];
        }
      }
    ];

    const service = new DefaultDailyIngestionService(createAdapterMap(adapters), new FakeRepository());
    const result = await service.runAggregatedIngestion({
      runDate: "2026-03-07T00:00:00.000Z",
      sources: ["arxiv", "pubmed"]
    });

    expect(result.run.source).toBe("aggregated");
    expect(result.run.status).toBe("success");
    expect(result.run.candidatesCount).toBe(2);
    expect(result.sourceSummaries).toEqual([
      { source: "arxiv", status: "success", candidatesCount: 1 },
      { source: "pubmed", status: "success", candidatesCount: 1 }
    ]);
    expect(result.candidates.map((candidate) => candidate.source)).toEqual(["arxiv", "pubmed"]);
  });

  it("continues aggregated ingestion when one source fails and another succeeds", async () => {
    const adapters: DailySourceAdapter[] = [
      {
        source: "biorxiv",
        async fetchCandidatesForDay() {
          throw new Error("bioRxiv unavailable");
        }
      },
      {
        source: "arxiv",
        async fetchCandidatesForDay(window) {
          return [
            {
              externalId: "ax-1",
              publishedAt: new Date(window.dayStart.getTime() + 30 * 60 * 1000),
              sourcePayload: { id: "ax-1" },
              authors: []
            }
          ];
        }
      }
    ];

    const service = new DefaultDailyIngestionService(createAdapterMap(adapters), new FakeRepository());
    const result = await service.runAggregatedIngestion({
      runDate: "2026-03-07T00:00:00.000Z",
      sources: ["biorxiv", "arxiv"]
    });

    expect(result.run.status).toBe("success");
    expect(result.run.candidatesCount).toBe(1);
    expect(result.sourceSummaries).toEqual([
      {
        source: "biorxiv",
        status: "failed",
        candidatesCount: 0,
        errorMessage: "bioRxiv unavailable"
      },
      { source: "arxiv", status: "success", candidatesCount: 1 }
    ]);
    expect(result.candidates.map((candidate) => candidate.source)).toEqual(["arxiv"]);
  });
});

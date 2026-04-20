import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runAggregatedIngestion: vi.fn(),
  enrichRun: vi.fn(),
  runForIngestionRun: vi.fn(),
  generateForRun: vi.fn(),
  runRecall: vi.fn(),
  runRerank: vi.fn()
}));

vi.mock("../ingestion", () => ({
  createDailyIngestionService: () => ({
    runAggregatedIngestion: mocks.runAggregatedIngestion
  })
}));

vi.mock("../candidate-enrich", () => ({
  createJournalEnrichmentService: () => ({
    enrichRun: mocks.enrichRun
  })
}));

vi.mock("../normalize-dedupe", () => ({
  createCandidateNormalizationService: () => ({
    runForIngestionRun: mocks.runForIngestionRun
  })
}));

vi.mock("../summary", () => ({
  createCandidateOutputService: () => ({
    generateForRun: mocks.generateForRun
  })
}));

vi.mock("../ranking/recall", () => ({
  createRecallRankingService: () => ({
    runRecall: mocks.runRecall
  })
}));

vi.mock("../ranking/rerank", () => ({
  createRerankService: () => ({
    runRerank: mocks.runRerank
  })
}));

import { runDailyRecommendationPipeline } from "./daily-pipeline";

describe("runDailyRecommendationPipeline", () => {
  beforeEach(() => {
    mocks.runAggregatedIngestion.mockReset();
    mocks.enrichRun.mockReset();
    mocks.runForIngestionRun.mockReset();
    mocks.generateForRun.mockReset();
    mocks.runRecall.mockReset();
    mocks.runRerank.mockReset();
  });

  it("runs aggregated ingestion and downstream stages once", async () => {
    mocks.runAggregatedIngestion.mockResolvedValue({
      run: { id: "run-1" },
      sourceSummaries: [{ source: "arxiv", candidatesCount: 2 }]
    });

    const result = await runDailyRecommendationPipeline({
      sources: ["arxiv"]
    });

    expect(mocks.runAggregatedIngestion).toHaveBeenCalledWith({
      runDate: undefined,
      sources: ["arxiv"]
    });
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].status).toBe("success");
    expect(result.sources[0].runId).toBe("run-1");
    expect(mocks.enrichRun).toHaveBeenCalledWith("run-1");
    expect(mocks.runForIngestionRun).toHaveBeenCalledWith("run-1");
    expect(mocks.generateForRun).toHaveBeenCalledWith({ runId: "run-1" });
    expect(mocks.runRecall).toHaveBeenCalledWith({ runId: "run-1" });
    expect(mocks.runRerank).toHaveBeenCalledWith({ runId: "run-1" });
  });

  it("preserves per-source failures from partial aggregated ingestion", async () => {
    mocks.runAggregatedIngestion.mockResolvedValue({
      run: { id: "run-1" },
      sourceSummaries: [
        {
          source: "biorxiv",
          status: "failed",
          candidatesCount: 0,
          errorMessage: "bioRxiv unavailable"
        },
        { source: "pubmed", status: "success", candidatesCount: 10 }
      ]
    });

    const result = await runDailyRecommendationPipeline({
      sources: ["biorxiv", "pubmed"]
    });

    expect(result.sources).toEqual([
      {
        source: "biorxiv",
        status: "failed",
        errorMessage: "bioRxiv unavailable"
      },
      {
        source: "pubmed",
        runId: "run-1",
        status: "success"
      }
    ]);
    expect(mocks.enrichRun).toHaveBeenCalledWith("run-1");
    expect(mocks.runForIngestionRun).toHaveBeenCalledWith("run-1");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../lib/errors";

const mocks = vi.hoisted(() => ({
  runAggregatedIngestion: vi.fn(),
  failRun: vi.fn(),
  enrichRun: vi.fn(),
  runForIngestionRun: vi.fn(),
  generateLabelsForRun: vi.fn(),
  generateSummariesForRun: vi.fn(),
  runRecall: vi.fn(),
  runRerank: vi.fn(),
  initializeStages: vi.fn(),
  startStage: vi.fn(),
  completeStage: vi.fn(),
  failStage: vi.fn(),
  listStages: vi.fn()
}));

vi.mock("../ingestion", () => ({
  createDailyIngestionService: () => ({
    runAggregatedIngestion: mocks.runAggregatedIngestion,
    failRun: mocks.failRun
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
    generateLabelsForRun: mocks.generateLabelsForRun,
    generateSummariesForRun: mocks.generateSummariesForRun
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

vi.mock("../pipeline-status", () => ({
  STAGE_ORDER: ["ingestion", "enrichment", "normalization", "representation", "recall", "rerank", "summary"],
  createPipelineStageService: () => ({
    initialize: mocks.initializeStages,
    start: mocks.startStage,
    complete: mocks.completeStage,
    fail: mocks.failStage,
    list: mocks.listStages
  })
}));

import { runDailyRecommendationPipeline } from "./daily-pipeline";

describe("runDailyRecommendationPipeline", () => {
  beforeEach(() => {
    mocks.runAggregatedIngestion.mockReset();
    mocks.failRun.mockReset();
    mocks.enrichRun.mockReset();
    mocks.runForIngestionRun.mockReset();
    mocks.generateLabelsForRun.mockReset();
    mocks.generateSummariesForRun.mockReset();
    mocks.runRecall.mockReset();
    mocks.runRerank.mockReset();
    mocks.initializeStages.mockReset();
    mocks.startStage.mockReset();
    mocks.completeStage.mockReset();
    mocks.failStage.mockReset();
    mocks.listStages.mockReset();
    mocks.enrichRun.mockResolvedValue({ processed: 0, enriched: 0, notFound: 0, failed: 0 });
    mocks.runForIngestionRun.mockResolvedValue({ canonicalCount: 0 });
    mocks.generateLabelsForRun.mockResolvedValue({ requested: 0, generated: 0, failed: 0 });
    mocks.generateSummariesForRun.mockResolvedValue({ requested: 0, generated: 0, failed: 0 });
    mocks.runRecall.mockResolvedValue({ run: { id: "recall-1" } });
    mocks.runRerank.mockResolvedValue({ run: { id: "rerank-1" } });
    mocks.listStages.mockResolvedValue([
      { stage: "ingestion", status: "success" },
      { stage: "summary", status: "success" }
    ]);
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
    expect(result.status).toBe("complete");
    expect(result.retryable).toBe(false);
    expect(mocks.enrichRun).toHaveBeenCalledWith("run-1");
    expect(mocks.runForIngestionRun).toHaveBeenCalledWith("run-1");
    expect(mocks.startStage).toHaveBeenCalledTimes(6);
    expect(mocks.runRecall).toHaveBeenCalledWith({ runId: "run-1" });
    expect(mocks.runRerank).toHaveBeenCalledWith({ runId: "run-1", topN: 20 });
    expect(mocks.generateLabelsForRun).toHaveBeenCalledWith({ runId: "run-1" });
    expect(mocks.generateSummariesForRun).toHaveBeenCalledWith({
      runId: "run-1",
      limit: 20,
      selectedOnly: true
    });
    expect(mocks.generateLabelsForRun.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.runRecall.mock.invocationCallOrder[0]
    );
    expect(mocks.runRecall.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.runRerank.mock.invocationCallOrder[0]
    );
    expect(mocks.runRerank.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.generateSummariesForRun.mock.invocationCallOrder[0]
    );
  });

  it("preserves per-source failures from partial aggregated ingestion", async () => {
    mocks.listStages.mockResolvedValueOnce([
      { stage: "ingestion", status: "partial" },
      { stage: "summary", status: "success" }
    ]);
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
    expect(result.status).toBe("partial");
    expect(mocks.initializeStages).toHaveBeenCalledWith(
      expect.objectContaining({ runId: "run-1", ingestionStatus: "partial" })
    );
  });

  it("reuses a completed persistent run without duplicating downstream stages", async () => {
    mocks.runAggregatedIngestion.mockResolvedValue({
      run: { id: "run-existing" },
      disposition: "already_succeeded",
      sourceSummaries: [{ source: "pubmed", status: "success", candidatesCount: 10 }]
    });
    mocks.listStages.mockResolvedValue([
      { stage: "ingestion", status: "success" },
      { stage: "enrichment", status: "success" },
      { stage: "normalization", status: "success" },
      { stage: "representation", status: "success" },
      { stage: "recall", status: "success" },
      { stage: "rerank", status: "success" },
      { stage: "summary", status: "success" }
    ]);

    const result = await runDailyRecommendationPipeline({ sources: ["pubmed"] });

    expect(result.sources[0]).toMatchObject({ source: "pubmed", runId: "run-existing", status: "success" });
    expect(result.status).toBe("already_succeeded");
    expect(mocks.enrichRun).not.toHaveBeenCalled();
    expect(mocks.runForIngestionRun).not.toHaveBeenCalled();
    expect(mocks.runRecall).not.toHaveBeenCalled();
    expect(mocks.runRerank).not.toHaveBeenCalled();
  });

  it("resumes from the first partial downstream stage", async () => {
    mocks.runAggregatedIngestion.mockResolvedValue({
      run: { id: "run-existing" },
      disposition: "already_succeeded",
      sourceSummaries: [{ source: "pubmed", status: "success", candidatesCount: 10 }]
    });
    mocks.listStages
      .mockResolvedValueOnce([
        { stage: "ingestion", status: "success" },
        { stage: "enrichment", status: "partial" },
        { stage: "normalization", status: "success" },
        { stage: "representation", status: "partial" },
        { stage: "recall", status: "success" },
        { stage: "rerank", status: "success" },
        { stage: "summary", status: "partial" }
      ])
      .mockResolvedValueOnce([
        { stage: "ingestion", status: "success" },
        { stage: "enrichment", status: "partial" },
        { stage: "normalization", status: "success" },
        { stage: "representation", status: "success" },
        { stage: "recall", status: "success" },
        { stage: "rerank", status: "success" },
        { stage: "summary", status: "success" }
      ]);

    const result = await runDailyRecommendationPipeline({ sources: ["pubmed"] });

    expect(result.status).toBe("partial");
    expect(mocks.enrichRun).not.toHaveBeenCalled();
    expect(mocks.runForIngestionRun).not.toHaveBeenCalled();
    expect(mocks.generateLabelsForRun).toHaveBeenCalledWith({ runId: "run-existing" });
    expect(mocks.runRecall).toHaveBeenCalled();
    expect(mocks.runRerank).toHaveBeenCalled();
    expect(mocks.generateSummariesForRun).toHaveBeenCalled();
  });

  it("keeps successful ingestion reusable when a downstream stage fails", async () => {
    mocks.runAggregatedIngestion.mockResolvedValue({
      run: { id: "run-1" },
      disposition: "acquired",
      sourceSummaries: [{ source: "arxiv", status: "success", candidatesCount: 2 }]
    });
    mocks.enrichRun.mockRejectedValueOnce(new Error("enrichment failed"));

    const result = await runDailyRecommendationPipeline({ sources: ["arxiv"] });

    expect(mocks.failRun).not.toHaveBeenCalled();
    expect(result.sources[0]).toMatchObject({ source: "arxiv", status: "failed" });
    expect(result).toMatchObject({ status: "failed", failedStage: "enrichment", retryable: true });
    expect(mocks.failStage).toHaveBeenCalledWith({
      runId: "run-1",
      stage: "enrichment",
      errorMessage: "enrichment failed"
    });
  });

  it("resumes a persisted hard failure without rerunning successful ingestion", async () => {
    mocks.runAggregatedIngestion.mockResolvedValue({
      run: { id: "run-existing" },
      disposition: "already_succeeded",
      sourceSummaries: [{ source: "pubmed", status: "success", candidatesCount: 10 }]
    });
    mocks.listStages
      .mockResolvedValueOnce([
        { stage: "ingestion", status: "success" },
        { stage: "enrichment", status: "success" },
        { stage: "normalization", status: "success" },
        { stage: "representation", status: "failed" },
        { stage: "recall", status: "skipped" },
        { stage: "rerank", status: "skipped" },
        { stage: "summary", status: "skipped" }
      ])
      .mockResolvedValueOnce([
        { stage: "ingestion", status: "success" },
        { stage: "enrichment", status: "success" },
        { stage: "normalization", status: "success" },
        { stage: "representation", status: "success" },
        { stage: "recall", status: "success" },
        { stage: "rerank", status: "success" },
        { stage: "summary", status: "success" }
      ]);

    const result = await runDailyRecommendationPipeline({ sources: ["pubmed"] });

    expect(result.status).toBe("complete");
    expect(mocks.enrichRun).not.toHaveBeenCalled();
    expect(mocks.runForIngestionRun).not.toHaveBeenCalled();
    expect(mocks.generateLabelsForRun).toHaveBeenCalledWith({ runId: "run-existing" });
    expect(mocks.runRecall).toHaveBeenCalledWith({ runId: "run-existing" });
    expect(mocks.runRerank).toHaveBeenCalledWith({ runId: "run-existing", topN: 20 });
    expect(mocks.generateSummariesForRun).toHaveBeenCalledWith({
      runId: "run-existing",
      limit: 20,
      selectedOnly: true
    });
  });

  it("returns already-running without presenting the trigger as retryable", async () => {
    mocks.runAggregatedIngestion.mockRejectedValue(
      new AppError("DAILY_RUN_ALREADY_RUNNING", "run active", 409, { runId: "run-active" })
    );

    const result = await runDailyRecommendationPipeline({ sources: ["pubmed"] });

    expect(result).toMatchObject({ status: "already_running", runId: "run-active", retryable: false });
    expect(mocks.failRun).not.toHaveBeenCalled();
  });
});

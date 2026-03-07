import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runSourceIngestion: vi.fn(),
  enrichRun: vi.fn(),
  runForIngestionRun: vi.fn(),
  generateForRun: vi.fn(),
  runRecall: vi.fn(),
  runRerank: vi.fn()
}));

vi.mock("../ingestion", () => ({
  createDailyIngestionService: () => ({
    runSourceIngestion: mocks.runSourceIngestion
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
    mocks.runSourceIngestion.mockReset();
    mocks.enrichRun.mockReset();
    mocks.runForIngestionRun.mockReset();
    mocks.generateForRun.mockReset();
    mocks.runRecall.mockReset();
    mocks.runRerank.mockReset();
  });

  it("runs ingestion and downstream stages per source", async () => {
    mocks.runSourceIngestion.mockResolvedValue({
      run: { id: "run-1" }
    });

    const result = await runDailyRecommendationPipeline({
      sources: ["arxiv"]
    });

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].status).toBe("success");
    expect(mocks.enrichRun).toHaveBeenCalledWith("run-1");
    expect(mocks.runForIngestionRun).toHaveBeenCalledWith("run-1");
    expect(mocks.generateForRun).toHaveBeenCalledWith({ runId: "run-1" });
    expect(mocks.runRecall).toHaveBeenCalledWith({ runId: "run-1" });
    expect(mocks.runRerank).toHaveBeenCalledWith({ runId: "run-1" });
  });
});

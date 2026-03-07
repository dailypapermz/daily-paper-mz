import { describe, expect, it, vi } from "vitest";

import { DefaultDailyRecommendationService } from "./daily-recommendations.service";

describe("DefaultDailyRecommendationService", () => {
  it("filters selected recommendations by default", async () => {
    const service = new DefaultDailyRecommendationService({
      getLatestFeed: vi.fn().mockResolvedValue({
        rerankRunId: "rerank-1",
        runId: "run-1",
        generatedAt: new Date().toISOString(),
        recommendations: [
          {
            candidateId: "candidate-1",
            rank: 1,
            selected: true,
            finalScore: 0.8,
            sources: ["journal"],
            identifiers: {},
            labels: {},
            reasons: []
          },
          {
            candidateId: "candidate-2",
            rank: 2,
            selected: false,
            finalScore: 0.4,
            sources: ["arxiv"],
            identifiers: {},
            labels: {},
            reasons: []
          }
        ]
      })
    });

    const result = await service.getDailyFeed();

    expect(result?.recommendations).toHaveLength(1);
    expect(result?.recommendations[0].candidateId).toBe("candidate-1");
  });

  it("supports source filtering", async () => {
    const service = new DefaultDailyRecommendationService({
      getLatestFeed: vi.fn().mockResolvedValue({
        rerankRunId: "rerank-1",
        runId: "run-1",
        generatedAt: new Date().toISOString(),
        recommendations: [
          {
            candidateId: "candidate-1",
            rank: 1,
            selected: true,
            finalScore: 0.8,
            sources: ["journal"],
            identifiers: {},
            labels: {},
            reasons: []
          },
          {
            candidateId: "candidate-2",
            rank: 2,
            selected: true,
            finalScore: 0.7,
            sources: ["arxiv"],
            identifiers: {},
            labels: {},
            reasons: []
          }
        ]
      })
    });

    const result = await service.getDailyFeed({
      source: "arxiv",
      selectedOnly: true
    });

    expect(result?.recommendations).toHaveLength(1);
    expect(result?.recommendations[0].candidateId).toBe("candidate-2");
  });
});

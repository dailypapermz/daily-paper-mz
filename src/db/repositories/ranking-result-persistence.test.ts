import { describe, expect, it, vi } from "vitest";

import { PrismaClient } from "../../generated/prisma";
import type { RecallResultRecord } from "../../modules/ranking/recall/types";
import type { RerankResultRecord } from "../../modules/ranking/rerank/types";
import { PrismaRecallRankingRepository } from "./recall-ranking-repository";
import { PrismaRerankRepository } from "./rerank-repository";

describe("ranking result batch persistence", () => {
  it("writes 1000 recall results in two bulk operations without row creates", async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 500 });
    const create = vi.fn();
    const transaction = {
      dailyRecallResult: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany,
        create
      }
    };
    const db = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction))
    };

    await new PrismaRecallRankingRepository(db as unknown as PrismaClient).saveRecallResults({
      recallRunId: "recall-run",
      results: Array.from({ length: 1_000 }, (_, index) => recallResult(index))
    });

    expect(create).not.toHaveBeenCalled();
    expect(createMany).toHaveBeenCalledTimes(2);
    expect(createMany.mock.calls.map(([args]) => args.data)).toHaveLength(2);
    expect(createMany.mock.calls.flatMap(([args]) => args.data)).toHaveLength(1_000);
  });

  it("writes 1000 rerank results in two bulk operations without row creates", async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 500 });
    const create = vi.fn();
    const transaction = {
      dailyRecommendationResult: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany,
        create
      }
    };
    const db = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction))
    };

    await new PrismaRerankRepository(db as unknown as PrismaClient).saveRerankResults({
      rerankRunId: "rerank-run",
      results: Array.from({ length: 1_000 }, (_, index) => rerankResult(index))
    });

    expect(create).not.toHaveBeenCalled();
    expect(createMany).toHaveBeenCalledTimes(2);
    expect(createMany.mock.calls.flatMap(([args]) => args.data)).toHaveLength(1_000);
  });
});

function recallResult(index: number): RecallResultRecord {
  return {
    candidateId: `candidate-${index}`,
    rank: index + 1,
    selected: index < 100,
    scores: {
      recallScore: 0.9,
      semanticScore: 0.8,
      tagOverlapScore: 0.7,
      researchTypeScore: 0.6,
      sourceScopeScore: 0.5,
      reasons: [`reason-${index}`]
    }
  };
}

function rerankResult(index: number): RerankResultRecord {
  return {
    candidateId: `candidate-${index}`,
    rank: index + 1,
    selected: index < 10,
    scores: {
      finalScore: 0.95,
      recallScore: 0.9,
      recentCoreScore: 0.8,
      stableLongTermScore: 0.7,
      highAttentionScore: 0.6,
      contentTagScore: 0.5,
      researchTypeScore: 0.4,
      collectionWeightScore: 0.3,
      sourcePriorityScore: 0.2,
      journalQualityScore: 0.1,
      userCorrectedScore: 0,
      recencyScore: 0.75,
      reasons: [`reason-${index}`],
      featureWeights: { recall: 1 }
    }
  };
}

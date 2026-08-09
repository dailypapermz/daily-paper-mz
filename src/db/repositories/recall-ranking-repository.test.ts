import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../../generated/prisma";
import { PrismaRecallRankingRepository } from "./recall-ranking-repository";

describe("PrismaRecallRankingRepository profile snapshot selection", () => {
  it("requires the expected refreshed snapshot to still be active", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: "snapshot-refreshed",
      builtAt: new Date("2026-08-09T00:00:00.000Z"),
      itemSignals: [],
      researchTypePreferences: [],
      summaryJson: {}
    });
    const repository = new PrismaRecallRankingRepository({
      profileSnapshot: { findFirst }
    } as unknown as PrismaClient);

    await expect(repository.getProfileSnapshot("snapshot-refreshed")).resolves.toMatchObject({
      id: "snapshot-refreshed"
    });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: "snapshot-refreshed",
        status: "ACTIVE"
      }
    }));
  });

  it("preserves active-snapshot lookup for callers without an expected id", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const repository = new PrismaRecallRankingRepository({
      profileSnapshot: { findFirst }
    } as unknown as PrismaClient);

    await expect(repository.getProfileSnapshot()).resolves.toBeNull();
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        status: "ACTIVE"
      }
    }));
  });
});

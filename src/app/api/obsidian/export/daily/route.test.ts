import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exportDailyRecommendations: vi.fn()
}));

vi.mock("../../../../../modules/obsidian", () => ({
  createObsidianExportService: () => ({
    exportDailyRecommendations: mocks.exportDailyRecommendations
  })
}));

import { POST } from "./route";

describe("/api/obsidian/export/daily", () => {
  beforeEach(() => {
    mocks.exportDailyRecommendations.mockReset();
  });

  it("exports daily recommendations", async () => {
    mocks.exportDailyRecommendations.mockResolvedValueOnce({
      runId: "run-1",
      dailyNotePath: "D:\\Obsidian\\Literature\\Daily Triage\\2026-04-20.md",
      paperNotePaths: [],
      recommendationCount: 0
    });

    const response = await POST(
      new Request("http://localhost/api/obsidian/export/daily", {
        method: "POST",
        body: JSON.stringify({
          runId: "run-1",
          selectedOnly: true,
          source: "pubmed",
          vaultPath: "D:\\Obsidian"
        })
      })
    );
    const payload = (await response.json()) as { status: string };

    expect(response.status).toBe(200);
    expect(payload.status).toBe("ok");
    expect(mocks.exportDailyRecommendations).toHaveBeenCalledWith({
      runId: "run-1",
      selectedOnly: true,
      source: "pubmed",
      vaultPath: "D:\\Obsidian",
      dailyDir: undefined,
      papersDir: undefined
    });
  });
});

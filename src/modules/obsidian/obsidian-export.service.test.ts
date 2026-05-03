import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DefaultObsidianExportService } from "./obsidian-export.service";
import type { ObsidianRecommendationFeedProvider } from "./types";

describe("DefaultObsidianExportService", () => {
  let tempRoot: string;
  let provider: ObsidianRecommendationFeedProvider;

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "daily-paper-obsidian-"));
    provider = {
      getDailyFeed: vi.fn().mockResolvedValue({
        rerankRunId: "rerank-1",
        runId: "run-1",
        generatedAt: "2026-04-20T08:00:00.000Z",
        recommendations: [
          {
            candidateId: "candidate-1",
            rank: 1,
            selected: true,
            finalScore: 0.95,
            title: "A Genomics AI Paper",
            publishedAt: "2026-04-20T00:00:00.000Z",
            sources: ["pubmed"],
            identifiers: {
              doi: "10.1000/demo",
              pmid: "12345"
            },
            labels: {
              contentRecall: {
                label: "single-cell foundation model",
                provider: "test",
                provenance: "generated"
              },
              researchType: {
                category: "method",
                primaryKeyword: "foundation model",
                secondaryKeyword: "single-cell",
                provider: "test",
                provenance: "generated"
              }
            },
            reasons: ["matched recent profile"]
          }
        ]
      })
    };
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("exports a daily note and paper notes into the vault", async () => {
    const service = new DefaultObsidianExportService(provider, {
      vaultPath: tempRoot,
      dailyDir: "Daily",
      papersDir: "Papers"
    });

    const result = await service.exportDailyRecommendations();

    expect(result.recommendationCount).toBe(1);
    expect(result.dailyNotePath).toBe(path.join(tempRoot, "Daily", "2026-04-20.md"));
    expect(result.paperNotePaths).toHaveLength(1);
    expect(result.paperNotePaths[0]).toBe(
      path.join(tempRoot, "Papers", "2026-04-20", "001 - A Genomics AI Paper.md")
    );

    const dailyNote = await readFile(result.dailyNotePath, "utf8");
    const paperNote = await readFile(result.paperNotePaths[0], "utf8");
    expect(dailyNote).toContain("Daily Literature Triage - 2026-04-20");
    expect(dailyNote).toContain("A Genomics AI Paper");
    expect(paperNote).toContain("<!-- daily-paper:start -->");
    expect(paperNote).toContain("## My Notes");
  });

  it("preserves manual notes when updating an existing paper note", async () => {
    const service = new DefaultObsidianExportService(provider, {
      vaultPath: tempRoot,
      dailyDir: "Daily",
      papersDir: "Papers"
    });

    const first = await service.exportDailyRecommendations();
    await writeManualNote(first.paperNotePaths[0]);
    const second = await service.exportDailyRecommendations();

    const paperNote = await readFile(second.paperNotePaths[0], "utf8");
    expect(paperNote).toContain("manual note survives");
    expect(paperNote).toContain("<!-- daily-paper:start -->");
  });
});

async function writeManualNote(filePath: string) {
  const content = await readFile(filePath, "utf8");
  await import("node:fs/promises").then(({ writeFile }) =>
    writeFile(`${filePath}`, `${content}\nManual section\nmanual note survives\n`, "utf8")
  );
}

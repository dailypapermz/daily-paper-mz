import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { AppError } from "../../lib/errors";
import {
  renderDailyNote,
  renderPaperNote,
  replaceGeneratedBlock
} from "./markdown-template";
import type {
  ObsidianExportConfig,
  ObsidianExportRequest,
  ObsidianExportResult,
  ObsidianExportService,
  ObsidianRecommendationFeedProvider
} from "./types";

const DEFAULT_CONFIG: ObsidianExportConfig = {
  vaultPath: "D:\\Obsidian",
  dailyDir: "Literature/Daily Triage",
  papersDir: "Literature/Papers"
};

export class DefaultObsidianExportService implements ObsidianExportService {
  constructor(
    private readonly feedProvider: ObsidianRecommendationFeedProvider,
    private readonly defaultConfig: ObsidianExportConfig = DEFAULT_CONFIG
  ) {}

  async exportDailyRecommendations(input?: ObsidianExportRequest): Promise<ObsidianExportResult> {
    const config = this.resolveConfig(input);
    const feed = await this.feedProvider.getDailyFeed({
      runId: input?.runId,
      selectedOnly: input?.selectedOnly ?? true,
      source: input?.source
    });

    if (!feed) {
      throw new AppError("NO_DAILY_RECOMMENDATION_FEED", "No daily recommendation feed found", 404);
    }

    const dailyDirPath = safeJoin(config.vaultPath, config.dailyDir);
    const papersDirPath = safeJoin(config.vaultPath, config.papersDir);
    await mkdir(dailyDirPath, { recursive: true });
    await mkdir(papersDirPath, { recursive: true });

    const date = feed.generatedAt.slice(0, 10);
    const dailyNotePath = path.join(dailyDirPath, `${date}.md`);
    await writeFile(dailyNotePath, renderDailyNote(feed), "utf8");

    const paperNotePaths: string[] = [];
    for (const recommendation of feed.recommendations) {
      const paperNotePath = path.join(
        papersDirPath,
        `${makePaperFileName(recommendation.rank, recommendation.title, recommendation.candidateId)}.md`
      );
      const generated = renderPaperNote({ recommendation, feed });
      await writeFilePreservingNotes(paperNotePath, generated);
      paperNotePaths.push(paperNotePath);
    }

    return {
      runId: feed.runId,
      dailyNotePath,
      paperNotePaths,
      recommendationCount: feed.recommendations.length
    };
  }

  private resolveConfig(input?: ObsidianExportRequest): ObsidianExportConfig {
    return {
      vaultPath: input?.vaultPath?.trim() || this.defaultConfig.vaultPath,
      dailyDir: input?.dailyDir?.trim() || this.defaultConfig.dailyDir,
      papersDir: input?.papersDir?.trim() || this.defaultConfig.papersDir
    };
  }
}

export function getDefaultObsidianConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ObsidianExportConfig {
  return {
    vaultPath: env.OBSIDIAN_VAULT_PATH?.trim() || DEFAULT_CONFIG.vaultPath,
    dailyDir: env.OBSIDIAN_DAILY_DIR?.trim() || DEFAULT_CONFIG.dailyDir,
    papersDir: env.OBSIDIAN_PAPERS_DIR?.trim() || DEFAULT_CONFIG.papersDir
  };
}

async function writeFilePreservingNotes(filePath: string, generated: string): Promise<void> {
  try {
    const existing = await readFile(filePath, "utf8");
    await writeFile(filePath, replaceGeneratedBlock(existing, generated), "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      await writeFile(filePath, generated, "utf8");
      return;
    }
    throw error;
  }
}

function safeJoin(root: string, relativePath: string): string {
  const normalizedRoot = path.resolve(root);
  const target = path.resolve(normalizedRoot, normalizeRelativePath(relativePath));
  if (target !== normalizedRoot && !target.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new AppError("INVALID_OBSIDIAN_PATH", "Obsidian export path must stay inside the vault", 400);
  }
  return target;
}

function normalizeRelativePath(value: string): string {
  return value
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part && part !== "." && part !== "..")
    .join(path.sep);
}

function makePaperFileName(rank: number, title: string | undefined, candidateId: string): string {
  const base = sanitizeFileName(title ?? candidateId).slice(0, 120) || sanitizeFileName(candidateId);
  return `${String(rank).padStart(3, "0")} - ${base}`;
}

function sanitizeFileName(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

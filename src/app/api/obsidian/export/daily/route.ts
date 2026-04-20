import { NextResponse } from "next/server";

import { AppError } from "../../../../../lib/errors";
import {
  createObsidianExportService,
  type ObsidianExportRequest
} from "../../../../../modules/obsidian";

type ObsidianExportBody = ObsidianExportRequest;

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as ObsidianExportBody;
    const service = createObsidianExportService();
    const result = await service.exportDailyRecommendations({
      runId: normalizeOptionalString(body.runId),
      selectedOnly: typeof body.selectedOnly === "boolean" ? body.selectedOnly : undefined,
      source: normalizeSource(body.source),
      vaultPath: normalizeOptionalString(body.vaultPath),
      dailyDir: normalizeOptionalString(body.dailyDir),
      papersDir: normalizeOptionalString(body.papersDir)
    });

    return NextResponse.json({
      status: "ok",
      result
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        {
          status: "error",
          code: error.code,
          message: error.message,
          details: error.details
        },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      {
        status: "error",
        code: "OBSIDIAN_EXPORT_FAILED",
        message: error instanceof Error ? error.message : "Unknown Obsidian export error"
      },
      { status: 500 }
    );
  }
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeSource(value: unknown) {
  if (value === "biorxiv" || value === "arxiv" || value === "pubmed" || value === "journal") {
    return value;
  }
  return undefined;
}

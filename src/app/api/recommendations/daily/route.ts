import { NextResponse } from "next/server";

import { createDailyRecommendationService } from "../../../../modules/ranking/explain";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("runId")?.trim();
  const source = normalizeSource(searchParams.get("source"));
  const selectedOnly = normalizeSelectedOnly(searchParams.get("selectedOnly"));

  const service = createDailyRecommendationService();
  const feed = await service.getDailyFeed({
    runId,
    selectedOnly,
    source
  });

  return NextResponse.json({
    status: "ok",
    feed
  });
}

function normalizeSelectedOnly(value: string | null): boolean {
  if (!value) {
    return true;
  }
  return value !== "false" && value !== "0";
}

function normalizeSource(value: string | null): "biorxiv" | "arxiv" | "pubmed" | "journal" | undefined {
  if (!value) {
    return undefined;
  }
  if (value === "biorxiv" || value === "arxiv" || value === "pubmed" || value === "journal") {
    return value;
  }
  return undefined;
}

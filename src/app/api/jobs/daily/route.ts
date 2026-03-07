import { NextResponse } from "next/server";

import { runDailyRecommendationPipeline } from "../../../../modules/scheduler";

type DailyJobBody = {
  runDate?: string;
  sources?: Array<"biorxiv" | "arxiv" | "pubmed" | "journal">;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as DailyJobBody;

  const result = await runDailyRecommendationPipeline({
    runDate: body.runDate,
    sources: Array.isArray(body.sources) ? body.sources : undefined
  });

  return NextResponse.json({
    status: "ok",
    result
  });
}

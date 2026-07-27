import { NextResponse } from "next/server";

import { rejectCloudCapability, sanitizedInternalError } from "../../../../lib/http/cloud-boundary";

type DailyJobBody = {
  runDate?: string;
  sources?: Array<"biorxiv" | "arxiv" | "pubmed" | "journal">;
};

export async function POST(request: Request) {
  const unavailable = rejectCloudCapability("daily_pipeline");
  if (unavailable) return unavailable;
  const body = (await request.json().catch(() => ({}))) as DailyJobBody;

  try {
    const { runDailyRecommendationPipeline } = await import("../../../../modules/scheduler");
    const result = await runDailyRecommendationPipeline({
      runDate: body.runDate,
      sources: Array.isArray(body.sources) ? body.sources : undefined
    });

    return NextResponse.json({ status: "ok", result });
  } catch {
    return sanitizedInternalError("DAILY_JOB_FAILED");
  }
}

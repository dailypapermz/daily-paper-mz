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

    const httpStatus = result.disposition === "already_running"
      ? 409
      : result.status === "failed" || (result.status === "partial" && result.retryable)
        ? 503
        : 200;
    return NextResponse.json(
      { status: result.status, disposition: result.disposition, result },
      { status: httpStatus }
    );
  } catch {
    return sanitizedInternalError("DAILY_JOB_FAILED");
  }
}

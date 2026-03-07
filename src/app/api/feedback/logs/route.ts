import { NextResponse } from "next/server";

import { createFeedbackService } from "../../../../modules/feedback";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("runId")?.trim() || undefined;
  const candidateId = searchParams.get("candidateId")?.trim() || undefined;
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Math.max(1, Math.min(500, Number.parseInt(limitParam, 10) || 100)) : 100;

  const service = createFeedbackService();
  const logs = await service.listLogs({
    runId,
    candidateId,
    limit
  });

  return NextResponse.json({
    status: "ok",
    logs
  });
}

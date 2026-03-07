import { NextResponse } from "next/server";

import { createFeedbackService } from "../../../../modules/feedback";

type FeedbackActionBody = {
  runId?: string;
  candidateId?: string;
  action?: "save" | "dismiss" | "promote";
  metadata?: Record<string, unknown>;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as FeedbackActionBody;
  const runId = body.runId?.trim();
  const candidateId = body.candidateId?.trim();

  if (!runId || !candidateId || !isTriageAction(body.action)) {
    return NextResponse.json(
      {
        status: "error",
        code: "INVALID_PAYLOAD",
        message: "runId, candidateId, and action(save|dismiss|promote) are required"
      },
      { status: 400 }
    );
  }

  const service = createFeedbackService();
  const log = await service.logTriageAction({
    runId,
    candidateId,
    action: body.action,
    metadata: body.metadata
  });

  return NextResponse.json({
    status: "ok",
    log
  });
}

function isTriageAction(value: unknown): value is "save" | "dismiss" | "promote" {
  return value === "save" || value === "dismiss" || value === "promote";
}

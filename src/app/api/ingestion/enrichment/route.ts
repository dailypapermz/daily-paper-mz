import { NextResponse } from "next/server";

import { AppError } from "../../../../lib/errors";
import { createJournalEnrichmentService } from "../../../../modules/candidate-enrich";

type JournalEnrichmentRequestBody = {
  runId?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as JournalEnrichmentRequestBody;
    const runId = body.runId?.trim();

    if (!runId) {
      return NextResponse.json(
        {
          status: "error",
          code: "INVALID_PAYLOAD",
          message: "runId is required"
        },
        { status: 400 }
      );
    }

    const service = createJournalEnrichmentService();
    const result = await service.enrichRun(runId);

    return NextResponse.json({
      status: "ok",
      result
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

function toErrorResponse(error: unknown) {
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
      code: "UNKNOWN_ERROR"
    },
    { status: 500 }
  );
}

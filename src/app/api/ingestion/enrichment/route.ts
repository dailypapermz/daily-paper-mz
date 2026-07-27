import { NextResponse } from "next/server";

import { AppError } from "../../../../lib/errors";
import { appErrorResponse, rejectCloudCapability } from "../../../../lib/http/cloud-boundary";
import { createJournalEnrichmentService } from "../../../../modules/candidate-enrich";

type JournalEnrichmentRequestBody = {
  runId?: string;
};

export async function POST(request: Request) {
  try {
    const unavailable = rejectCloudCapability("journal_enrichment_execution");
    if (unavailable) return unavailable;
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
    return appErrorResponse(error);
  }

  return NextResponse.json(
    {
      status: "error",
      code: "UNKNOWN_ERROR"
    },
    { status: 500 }
  );
}

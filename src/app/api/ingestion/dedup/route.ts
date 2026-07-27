import { NextResponse } from "next/server";

import { AppError } from "../../../../lib/errors";
import { appErrorResponse, rejectCloudCapability } from "../../../../lib/http/cloud-boundary";
import { createCandidateNormalizationService } from "../../../../modules/normalize-dedupe";

type CandidateDedupRequestBody = {
  runId?: string;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const runId = searchParams.get("runId")?.trim();

    if (!runId) {
      return NextResponse.json(
        {
          status: "error",
          code: "INVALID_QUERY",
          message: "runId is required"
        },
        { status: 400 }
      );
    }

    const service = createCandidateNormalizationService();
    const canonicalCandidates = await service.getCanonicalCandidates(runId);

    return NextResponse.json({
      status: "ok",
      runId,
      canonicalCandidates
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const unavailable = rejectCloudCapability("normalization_execution");
    if (unavailable) return unavailable;
    const body = (await request.json().catch(() => ({}))) as CandidateDedupRequestBody;
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

    const service = createCandidateNormalizationService();
    const result = await service.runForIngestionRun(runId);

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

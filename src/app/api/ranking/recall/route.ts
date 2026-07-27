import { NextResponse } from "next/server";

import { AppError } from "../../../../lib/errors";
import { appErrorResponse, rejectCloudCapability } from "../../../../lib/http/cloud-boundary";
import { createRecallRankingService } from "../../../../modules/ranking/recall";

type RecallRequestBody = {
  runId?: string;
  topN?: number;
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

    const service = createRecallRankingService();
    const result = await service.getLatestRecallRun({
      runId
    });

    return NextResponse.json({
      status: "ok",
      result
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const unavailable = rejectCloudCapability("recall_execution");
    if (unavailable) return unavailable;
    const body = (await request.json().catch(() => ({}))) as RecallRequestBody;
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

    const service = createRecallRankingService();
    const result = await service.runRecall({
      runId,
      topN: body.topN
    });

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

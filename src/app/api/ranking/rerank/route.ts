import { NextResponse } from "next/server";

import { AppError } from "../../../../lib/errors";
import { createRerankService } from "../../../../modules/ranking/rerank";

type RerankRequestBody = {
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

    const service = createRerankService();
    const result = await service.getLatestRerankRun(runId);

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
    const body = (await request.json().catch(() => ({}))) as RerankRequestBody;
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

    const service = createRerankService();
    const result = await service.runRerank({
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

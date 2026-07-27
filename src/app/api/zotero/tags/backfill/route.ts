import { NextResponse } from "next/server";

import { AppError } from "../../../../../lib/errors";
import { rejectCloudCapability } from "../../../../../lib/http/cloud-boundary";
import { createTagBackfillService } from "../../../../../modules/tagging";

type BackfillRequestBody = {
  limit?: number;
};

export async function GET() {
  try {
    const unavailable = rejectCloudCapability("zotero_tag_backfill");
    if (unavailable) return unavailable;
    const service = createTagBackfillService();
    const latestJob = await service.getLatestJob();

    return NextResponse.json({
      status: "ok",
      latestJob
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const unavailable = rejectCloudCapability("zotero_tag_backfill");
    if (unavailable) return unavailable;
    const body = (await request.json().catch(() => ({}))) as BackfillRequestBody;

    if (body.limit !== undefined && !isPositiveInteger(body.limit)) {
      return NextResponse.json(
        {
          status: "error",
          code: "INVALID_PAYLOAD",
          message: "limit must be a positive integer"
        },
        { status: 400 }
      );
    }

    const service = createTagBackfillService();
    const result = await service.runBackfill({
      limit: body.limit
    });

    return NextResponse.json({
      status: "ok",
      job: result.job
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
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

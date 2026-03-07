import { NextResponse } from "next/server";

import { AppError } from "../../../../lib/errors";
import { createProfileRefreshService } from "../../../../modules/profile-build";

export async function GET() {
  try {
    const service = createProfileRefreshService();
    const status = await service.getRefreshStatus();

    return NextResponse.json({
      status: "ok",
      ...status
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST() {
  try {
    const service = createProfileRefreshService();
    const result = await service.runManualRefresh();

    return NextResponse.json({
      status: "ok",
      ...result
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

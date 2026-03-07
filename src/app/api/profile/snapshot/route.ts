import { NextResponse } from "next/server";

import { AppError } from "../../../../lib/errors";
import { createProfileBuildService } from "../../../../modules/profile-build";

export async function GET() {
  try {
    const service = createProfileBuildService();
    const snapshot = await service.getActiveSnapshot();

    return NextResponse.json({
      status: "ok",
      snapshot
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST() {
  try {
    const service = createProfileBuildService();
    const snapshot = await service.buildSnapshot();

    return NextResponse.json({
      status: "ok",
      snapshot
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

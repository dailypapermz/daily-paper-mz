import { NextResponse } from "next/server";

import { AppError } from "../../../../lib/errors";
import { appErrorResponse, rejectCloudCapability } from "../../../../lib/http/cloud-boundary";
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
    const unavailable = rejectCloudCapability("profile_snapshot_build");
    if (unavailable) return unavailable;
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

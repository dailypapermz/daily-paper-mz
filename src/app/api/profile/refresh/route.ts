import { NextResponse } from "next/server";

import { AppError } from "../../../../lib/errors";
import { appErrorResponse, rejectCloudCapability } from "../../../../lib/http/cloud-boundary";
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
    const unavailable = rejectCloudCapability("profile_refresh_execution");
    if (unavailable) return unavailable;
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

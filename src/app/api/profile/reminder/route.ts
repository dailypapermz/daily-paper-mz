import { NextResponse } from "next/server";

import { AppError } from "../../../../lib/errors";
import { createProfileRefreshService } from "../../../../modules/profile-build";

export async function GET() {
  try {
    const service = createProfileRefreshService();
    const reminder = await service.runMonthlyReminderCheck();

    return NextResponse.json({
      status: "ok",
      reminder
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

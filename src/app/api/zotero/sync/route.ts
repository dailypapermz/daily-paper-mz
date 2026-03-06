import { NextResponse } from "next/server";

import { AppError } from "../../../../lib/errors";
import { EnvValidationError } from "../../../../lib/config";
import { createZoteroSyncService } from "../../../../modules/zotero-sync";

type SyncRequestBody = {
  mode?: "full" | "incremental";
};

export async function GET() {
  try {
    const service = createZoteroSyncService();
    const latestRun = await service.getLatestRun();

    return NextResponse.json({
      status: "ok",
      latestRun
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as SyncRequestBody;

    if (body.mode && body.mode !== "full" && body.mode !== "incremental") {
      return NextResponse.json(
        {
          status: "error",
          code: "INVALID_SYNC_MODE",
          message: "mode must be either 'full' or 'incremental'"
        },
        { status: 400 }
      );
    }

    const service = createZoteroSyncService();
    const runSummary = await service.runSync(body.mode);

    return NextResponse.json({
      status: "ok",
      run: runSummary
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

function toErrorResponse(error: unknown) {
  if (error instanceof EnvValidationError) {
    return NextResponse.json(
      {
        status: "error",
        code: "ENV_VALIDATION_ERROR",
        message: error.message,
        missingKeys: error.missingKeys
      },
      { status: 500 }
    );
  }

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

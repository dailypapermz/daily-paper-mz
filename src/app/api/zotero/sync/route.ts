import { NextResponse } from "next/server";

import { getApplicationPrismaClient } from "../../../../db/prisma/application-client";
import { PrismaZoteroSyncRepository } from "../../../../db/repositories";
import { AppError } from "../../../../lib/errors";
import { EnvValidationError } from "../../../../lib/config";
import { appErrorResponse, isCloudDeployment, rejectCloudCapability } from "../../../../lib/http/cloud-boundary";
import { createZoteroSyncService } from "../../../../modules/zotero-sync";
import { mapRunSummary } from "../../../../modules/zotero-sync/zotero-sync.service";

type SyncRequestBody = {
  mode?: "full" | "incremental";
};

export async function GET() {
  try {
    const repository = new PrismaZoteroSyncRepository(getApplicationPrismaClient());
    const row = await repository.getLatestRun();
    const latestRun = row ? mapRunSummary(row) : null;

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
    const unavailable = rejectCloudCapability("zotero_sync_execution");
    if (unavailable) return unavailable;
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
    if (isCloudDeployment()) {
      return NextResponse.json(
        { status: "error", code: "ENV_VALIDATION_ERROR" },
        { status: 500 }
      );
    }
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

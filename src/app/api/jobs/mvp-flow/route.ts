import { NextResponse } from "next/server";

import { EnvValidationError } from "../../../../lib/config";
import { AppError } from "../../../../lib/errors";
import { rejectCloudCapability } from "../../../../lib/http/cloud-boundary";
import type { RunMvpFlowInput } from "../../../../modules/scheduler";

type MvpFlowRequestBody = RunMvpFlowInput;

export async function POST(request: Request) {
  try {
    const unavailable = rejectCloudCapability("mvp_pipeline");
    if (unavailable) return unavailable;
    const body = (await request.json().catch(() => ({}))) as MvpFlowRequestBody;

    if (body.syncMode && body.syncMode !== "full" && body.syncMode !== "incremental") {
      return NextResponse.json(
        {
          status: "error",
          code: "INVALID_SYNC_MODE",
          message: "syncMode must be either 'full' or 'incremental'"
        },
        { status: 400 }
      );
    }

    if (body.sources && !isValidSources(body.sources)) {
      return NextResponse.json(
        {
          status: "error",
          code: "INVALID_SOURCES",
          message: "sources must only contain biorxiv, arxiv, pubmed, journal"
        },
        { status: 400 }
      );
    }

    const { runMvpIntegrationFlow } = await import("../../../../modules/scheduler");
    const result = await runMvpIntegrationFlow(body);

    return NextResponse.json({
      status: "ok",
      result
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

function isValidSources(value: unknown): value is Array<"biorxiv" | "arxiv" | "pubmed" | "journal"> {
  if (!Array.isArray(value)) {
    return false;
  }
  return value.every(
    (entry) =>
      entry === "biorxiv" || entry === "arxiv" || entry === "pubmed" || entry === "journal"
  );
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

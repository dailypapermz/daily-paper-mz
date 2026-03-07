import { NextResponse } from "next/server";

import { AppError } from "../../../../lib/errors";
import { createCandidateOutputService } from "../../../../modules/summary";
import type { CandidateStructuredLabels, CandidateSummaryFields } from "../../../../modules/summary/types";

type GenerateCandidateContentBody = {
  runId?: string;
  limit?: number;
};

type UpdateCandidateContentBody = {
  candidateId?: string;
  summary?: CandidateSummaryFields;
  labels?: CandidateStructuredLabels;
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

    const service = createCandidateOutputService();
    const outputs = await service.listRunOutputs(runId);

    return NextResponse.json({
      status: "ok",
      runId,
      outputs
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as GenerateCandidateContentBody;
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

    const service = createCandidateOutputService();
    const result = await service.generateForRun({
      runId,
      limit: body.limit
    });

    return NextResponse.json({
      status: "ok",
      result
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as UpdateCandidateContentBody;
    const candidateId = body.candidateId?.trim();

    if (!candidateId) {
      return NextResponse.json(
        {
          status: "error",
          code: "INVALID_PAYLOAD",
          message: "candidateId is required"
        },
        { status: 400 }
      );
    }

    const service = createCandidateOutputService();
    const updated = await service.updateCandidateOutput({
      candidateId,
      summary: body.summary,
      labels: body.labels
    });

    return NextResponse.json({
      status: "ok",
      output: updated
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

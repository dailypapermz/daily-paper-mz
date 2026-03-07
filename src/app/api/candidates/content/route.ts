import { NextResponse } from "next/server";

import { AppError } from "../../../../lib/errors";
import { createFeedbackService } from "../../../../modules/feedback";
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
    const before = await service.getCandidateOutput(candidateId);
    const updated = await service.updateCandidateOutput({
      candidateId,
      summary: body.summary,
      labels: body.labels
    });
    const runId = updated?.runId ?? before?.runId;
    if (runId && updated) {
      const feedbackService = createFeedbackService();

      if (body.summary !== undefined) {
        await feedbackService.logSummaryEdit({
          runId,
          candidateId,
          oldValue: before?.summary ? (before.summary as unknown as Record<string, unknown>) : undefined,
          newValue: updated.summary ? (updated.summary as unknown as Record<string, unknown>) : undefined,
          metadata: {
            source: "candidate_content_put"
          }
        });
      }

      if (body.labels !== undefined) {
        await feedbackService.logLabelEdit({
          runId,
          candidateId,
          oldValue: before?.labels ? (before.labels as unknown as Record<string, unknown>) : undefined,
          newValue: updated.labels ? (updated.labels as unknown as Record<string, unknown>) : undefined,
          metadata: {
            source: "candidate_content_put"
          }
        });
      }
    }

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

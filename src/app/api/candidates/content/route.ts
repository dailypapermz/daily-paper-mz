import { NextResponse } from "next/server";

import { AppError } from "../../../../lib/errors";
import {
  isCloudDeployment,
  readJsonMutationBody,
  rejectCloudCapability
} from "../../../../lib/http/cloud-boundary";
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

    const service = createCandidateOutputService(undefined, { allowGeneration: false });
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
    const unavailable = rejectCloudCapability("candidate_content_generation");
    if (unavailable) return unavailable;
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
    const parsed = await readJsonMutationBody(request);
    if (!parsed.ok) return parsed.response;
    const body = isPlainObject(parsed.value) ? (parsed.value as UpdateCandidateContentBody) : {};
    const candidateId = body.candidateId?.trim();

    if (
      !candidateId ||
      candidateId.length > 191 ||
      (body.summary === undefined && body.labels === undefined) ||
      !isValidSummary(body.summary) ||
      !isValidLabels(body.labels)
    ) {
      return NextResponse.json(
        {
          status: "error",
          code: "INVALID_PAYLOAD",
          message: "candidateId is required"
        },
        { status: 400 }
      );
    }

    const service = createCandidateOutputService(undefined, { allowGeneration: false });
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
        ...(isCloudDeployment() ? {} : { details: error.details })
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

function isValidSummary(value: unknown): value is CandidateSummaryFields | undefined {
  if (value === undefined) return true;
  if (!isPlainObject(value)) return false;
  const summary = value as Record<string, unknown>;
  const expected = ["researchQuestion", "method", "mainFinding", "relevanceToUser"];
  return (
    Object.keys(summary).every((key) => expected.includes(key)) &&
    expected.every(
      (key) => typeof summary[key] === "string" && (summary[key] as string).length <= 10_000
    )
  );
}

function isValidLabels(value: unknown): value is CandidateStructuredLabels | undefined {
  if (value === undefined) return true;
  if (!isPlainObject(value)) return false;
  const labels = value as Record<string, unknown>;
  if (!Object.keys(labels).every((key) => key === "contentRecallLabel" || key === "researchType")) {
    return false;
  }
  if (!isOptionalShortString(labels.contentRecallLabel)) return false;
  if (labels.researchType === undefined) return true;
  if (!isPlainObject(labels.researchType)) return false;
  const researchType = labels.researchType as Record<string, unknown>;
  if (
    !Object.keys(researchType).every((key) =>
      ["category", "primaryKeyword", "secondaryKeyword", "rawText"].includes(key)
    )
  ) return false;
  return (
    (researchType.category === undefined ||
      researchType.category === "method" ||
      researchType.category === "biology" ||
      researchType.category === "resource" ||
      researchType.category === "benchmark") &&
    isOptionalShortString(researchType.primaryKeyword) &&
    isOptionalShortString(researchType.secondaryKeyword) &&
    isOptionalShortString(researchType.rawText, 2_000)
  );
}

function isOptionalShortString(value: unknown, maxLength = 500): boolean {
  return value === undefined || (typeof value === "string" && value.length <= maxLength);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

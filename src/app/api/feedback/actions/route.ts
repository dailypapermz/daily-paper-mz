import { NextResponse } from "next/server";

import { AppError } from "../../../../lib/errors";
import {
  readJsonMutationBody,
  sanitizedInternalError
} from "../../../../lib/http/cloud-boundary";
import { createFeedbackService } from "../../../../modules/feedback";

type FeedbackActionBody = {
  runId?: string;
  candidateId?: string;
  action?: "save" | "dismiss" | "promote";
  metadata?: Record<string, unknown>;
};

export async function POST(request: Request) {
  const parsed = await readJsonMutationBody(request, { maxBytes: 16 * 1024 });
  if (!parsed.ok) return parsed.response;
  const body = isPlainObject(parsed.value) ? (parsed.value as FeedbackActionBody) : {};
  const runId = body.runId?.trim();
  const candidateId = body.candidateId?.trim();

  if (
    !runId ||
    runId.length > 191 ||
    !candidateId ||
    candidateId.length > 191 ||
    !isTriageAction(body.action) ||
    !isValidMetadata(body.metadata)
  ) {
    return NextResponse.json(
      {
        status: "error",
        code: "INVALID_PAYLOAD",
        message: "runId, candidateId, and action(save|dismiss|promote) are required"
      },
      { status: 400 }
    );
  }

  try {
    const service = createFeedbackService();
    const log = await service.logTriageAction({
      runId,
      candidateId,
      action: body.action,
      metadata: body.metadata
    });

    return NextResponse.json({
      status: "ok",
      log
    });
  } catch (error) {
    if (error instanceof AppError && error.statusCode < 500) {
      return NextResponse.json(
        { status: "error", code: error.code, message: error.message },
        { status: error.statusCode }
      );
    }
    return sanitizedInternalError("FEEDBACK_WRITE_FAILED");
  }
}

function isTriageAction(value: unknown): value is "save" | "dismiss" | "promote" {
  return value === "save" || value === "dismiss" || value === "promote";
}

function isValidMetadata(value: unknown): value is Record<string, unknown> | undefined {
  if (value === undefined) return true;
  if (!isPlainObject(value)) return false;
  try {
    return JSON.stringify(value).length <= 8 * 1024;
  } catch {
    return false;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

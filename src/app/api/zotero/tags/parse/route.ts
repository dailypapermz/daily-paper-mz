import { NextResponse } from "next/server";

import { AppError } from "../../../../../lib/errors";
import { createTagSemanticsService } from "../../../../../modules/tagging";

type ParseTagsRequestBody = {
  zoteroItemKeys?: string[];
};

export async function GET() {
  try {
    const service = createTagSemanticsService();
    const summary = await service.getSummary();

    return NextResponse.json({
      status: "ok",
      summary
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as ParseTagsRequestBody;

    if (body.zoteroItemKeys && !isStringArray(body.zoteroItemKeys)) {
      return NextResponse.json(
        {
          status: "error",
          code: "INVALID_PAYLOAD",
          message: "zoteroItemKeys must be an array of strings"
        },
        { status: 400 }
      );
    }

    const service = createTagSemanticsService();
    const result = await service.parseAndPersist({
      zoteroItemKeys: body.zoteroItemKeys
    });

    return NextResponse.json({
      status: "ok",
      result
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
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

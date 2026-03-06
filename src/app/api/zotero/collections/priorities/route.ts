import { NextResponse } from "next/server";

import { AppError } from "../../../../../lib/errors";
import {
  createCollectionPriorityService,
  type CollectionPriorityValue
} from "../../../../../modules/collections";

type UpdatePriorityRequestBody = {
  zoteroCollectionKey?: string;
  priority?: CollectionPriorityValue | null;
};

export async function GET() {
  try {
    const service = createCollectionPriorityService();
    const tree = await service.getPriorityTree();

    return NextResponse.json({
      status: "ok",
      tree
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as UpdatePriorityRequestBody;

    if (!body.zoteroCollectionKey || typeof body.zoteroCollectionKey !== "string") {
      return NextResponse.json(
        {
          status: "error",
          code: "INVALID_PAYLOAD",
          message: "zoteroCollectionKey is required"
        },
        { status: 400 }
      );
    }

    if (!isValidPriority(body.priority)) {
      return NextResponse.json(
        {
          status: "error",
          code: "INVALID_PAYLOAD",
          message: "priority must be one of primary, secondary, excluded, or null"
        },
        { status: 400 }
      );
    }

    const service = createCollectionPriorityService();
    const result = await service.updateCollectionPriority({
      zoteroCollectionKey: body.zoteroCollectionKey,
      priority: body.priority ?? null
    });

    return NextResponse.json({
      status: "ok",
      updatedNode: result.updatedNode,
      tree: result.tree
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

function isValidPriority(value: unknown): value is CollectionPriorityValue | null | undefined {
  return (
    value === undefined ||
    value === null ||
    value === "primary" ||
    value === "secondary" ||
    value === "excluded"
  );
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

import { NextResponse } from "next/server";

import { AppError } from "../../../../lib/errors";
import {
  createDailyIngestionService,
  type DailyCandidateSourceValue
} from "../../../../modules/ingestion";

type IngestionRequestBody = {
  source?: DailyCandidateSourceValue;
  runDate?: string;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sourceParam = searchParams.get("source");
    const source = sourceParam && isCandidateSource(sourceParam) ? sourceParam : undefined;

    if (sourceParam && !isCandidateSource(sourceParam)) {
      return NextResponse.json(
        {
          status: "error",
          code: "INVALID_SOURCE",
          message: "source must be one of biorxiv, arxiv, pubmed, journal"
        },
        { status: 400 }
      );
    }

    const service = createDailyIngestionService();
    const latestRun = await service.getLatestRun({
      source
    });

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
    const body = (await request.json().catch(() => ({}))) as IngestionRequestBody;

    if (!body.source || !isCandidateSource(body.source)) {
      return NextResponse.json(
        {
          status: "error",
          code: "INVALID_SOURCE",
          message: "source must be one of biorxiv, arxiv, pubmed, journal"
        },
        { status: 400 }
      );
    }

    const service = createDailyIngestionService();
    const result = await service.runSourceIngestion({
      source: body.source,
      runDate: body.runDate
    });

    return NextResponse.json({
      status: "ok",
      ...result
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

function isCandidateSource(value: string): value is DailyCandidateSourceValue {
  return value === "biorxiv" || value === "arxiv" || value === "pubmed" || value === "journal";
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

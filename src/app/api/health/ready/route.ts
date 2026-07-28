import { NextResponse } from "next/server";

import {
  getApplicationPrismaClient,
  releaseApplicationPrismaClient
} from "../../../../db/prisma/application-client";

export async function GET() {
  let client: ReturnType<typeof getApplicationPrismaClient> | undefined;
  let phase: "client" | "query" = "client";
  try {
    client = getApplicationPrismaClient();
    phase = "query";
    await client.$queryRawUnsafe("SELECT 1");
    return NextResponse.json(
      { status: "ready" },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error(JSON.stringify({
      event: "database_readiness_failed",
      phase,
      errorName: safeErrorName(error),
      errorCode: safeErrorCode(error)
    }));
    return NextResponse.json(
      { status: "unavailable", code: "DATABASE_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  } finally {
    if (client) {
      await releaseApplicationPrismaClient(client).catch(() => undefined);
    }
  }
}

function safeErrorName(error: unknown): string {
  if (!(error instanceof Error)) {
    return "UnknownError";
  }
  return /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(error.name)
    ? error.name
    : "Error";
}

function safeErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return undefined;
  }
  const value = (error as { code?: unknown }).code;
  return typeof value === "string" && /^[A-Za-z0-9_.-]{1,32}$/.test(value)
    ? value
    : undefined;
}

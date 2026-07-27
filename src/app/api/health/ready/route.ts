import { NextResponse } from "next/server";

import {
  getApplicationPrismaClient,
  releaseApplicationPrismaClient
} from "../../../../db/prisma/application-client";

export async function GET() {
  let client: ReturnType<typeof getApplicationPrismaClient> | undefined;
  try {
    client = getApplicationPrismaClient();
    await client.$queryRawUnsafe("SELECT 1");
    return NextResponse.json(
      { status: "ready" },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
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

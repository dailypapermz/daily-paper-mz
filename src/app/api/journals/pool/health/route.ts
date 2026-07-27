import { NextResponse } from "next/server";

import { getApplicationPrismaClient } from "../../../../../db/prisma/application-client";
import { PrismaJournalFeedRepository } from "../../../../../db/repositories";
import { checkJournalFeedPoolHealth } from "../../../../../modules/ingestion/journal-feed-health";
import { rejectCloudCapability } from "../../../../../lib/http/cloud-boundary";

export async function GET(request: Request) {
  const unavailable = rejectCloudCapability("journal_feed_health_probe");
  if (unavailable) return unavailable;
  const prisma = getApplicationPrismaClient();
  const url = new URL(request.url);
  const activeOnly = url.searchParams.get("activeOnly") !== "false";
  const repository = new PrismaJournalFeedRepository(prisma);
  const feeds = activeOnly ? await repository.listActiveFeeds() : await repository.listFeeds();
  const reports = await checkJournalFeedPoolHealth(feeds);

  return NextResponse.json({
    status: "ok",
    reports
  });
}

import { NextResponse } from "next/server";

import { prisma } from "../../../../../db/prisma/client";
import { PrismaJournalFeedRepository } from "../../../../../db/repositories";
import { checkJournalFeedPoolHealth } from "../../../../../modules/ingestion/journal-feed-health";

export async function GET(request: Request) {
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

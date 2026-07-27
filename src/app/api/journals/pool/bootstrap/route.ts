import { NextResponse } from "next/server";

import { getApplicationPrismaClient } from "../../../../../db/prisma/application-client";
import { PrismaJournalFeedRepository } from "../../../../../db/repositories";
import { getEnv } from "../../../../../lib/config";
import { rejectCloudCapability } from "../../../../../lib/http/cloud-boundary";

type BootstrapJournalPoolBody = {
  allowWhenNotEmpty?: boolean;
};

export async function POST(request: Request) {
  const unavailable = rejectCloudCapability("journal_pool_bootstrap");
  if (unavailable) return unavailable;
  const prisma = getApplicationPrismaClient();
  const body = (await request.json().catch(() => ({}))) as BootstrapJournalPoolBody;
  const allowWhenNotEmpty = body.allowWhenNotEmpty ?? false;

  const repository = new PrismaJournalFeedRepository(prisma);
  const existing = await repository.listFeeds();
  if (existing.length > 0 && !allowWhenNotEmpty) {
    return NextResponse.json(
      {
        status: "error",
        code: "POOL_NOT_EMPTY",
        message: "journal pool is not empty; set allowWhenNotEmpty=true to bootstrap anyway"
      },
      { status: 409 }
    );
  }

  const env = getEnv();
  if (env.JOURNAL_FEED_URLS.length === 0) {
    return NextResponse.json(
      {
        status: "error",
        code: "NO_BOOTSTRAP_FEEDS",
        message: "JOURNAL_FEED_URLS is empty"
      },
      { status: 400 }
    );
  }

  const invalidUrls = env.JOURNAL_FEED_URLS.filter((feedUrl) => !isValidUrl(feedUrl));
  if (invalidUrls.length > 0) {
    return NextResponse.json(
      {
        status: "error",
        code: "INVALID_BOOTSTRAP_FEED_URLS",
        message: "JOURNAL_FEED_URLS contains invalid URLs",
        invalidUrls
      },
      { status: 400 }
    );
  }

  const feeds = await repository.upsertFeeds(
    env.JOURNAL_FEED_URLS.map((feedUrl) => ({
      journalName: deriveJournalName(feedUrl),
      feedUrl,
      isActive: true
    }))
  );

  return NextResponse.json({
    status: "ok",
    feeds,
    importedCount: feeds.length
  });
}

function deriveJournalName(feedUrl: string): string {
  const host = new URL(feedUrl).hostname.replace(/^www\./i, "");
  const token = host.split(".")[0] ?? host;
  const words = token
    .split(/[-_]+/g)
    .map((part) => part.trim())
    .filter(Boolean);

  if (words.length === 0) {
    return host;
  }

  return words
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function isValidUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

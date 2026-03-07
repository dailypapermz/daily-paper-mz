import { NextResponse } from "next/server";

import { prisma } from "../../../../db/prisma/client";
import { PrismaJournalFeedRepository } from "../../../../db/repositories";

type JournalFeedInput = {
  journalName: string;
  feedUrl: string;
  isActive?: boolean;
};

type ImportJournalPoolBody = {
  feeds?: JournalFeedInput[];
};

type UpdateJournalPoolBody = {
  id?: string;
  isActive?: boolean;
};

export async function GET() {
  const repository = new PrismaJournalFeedRepository(prisma);
  const feeds = await repository.listFeeds();

  return NextResponse.json({
    status: "ok",
    feeds
  });
}

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => ({}))) as UpdateJournalPoolBody;
  const id = body.id?.trim();

  if (!id || typeof body.isActive !== "boolean") {
    return NextResponse.json(
      {
        status: "error",
        code: "INVALID_PAYLOAD",
        message: "id and isActive(boolean) are required"
      },
      { status: 400 }
    );
  }

  const repository = new PrismaJournalFeedRepository(prisma);
  const existing = await repository.getFeedById(id);
  if (!existing) {
    return NextResponse.json(
      {
        status: "error",
        code: "FEED_NOT_FOUND",
        message: `journal feed '${id}' does not exist`
      },
      { status: 404 }
    );
  }

  const feed = await repository.updateFeedActive({
    id,
    isActive: body.isActive
  });

  return NextResponse.json({
    status: "ok",
    feed
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as ImportJournalPoolBody;

  if (!Array.isArray(body.feeds) || body.feeds.length === 0) {
    return NextResponse.json(
      {
        status: "error",
        code: "INVALID_PAYLOAD",
        message: "feeds must be a non-empty array"
      },
      { status: 400 }
    );
  }

  const normalized: JournalFeedInput[] = [];

  for (const feed of body.feeds) {
    if (!feed || typeof feed.journalName !== "string" || typeof feed.feedUrl !== "string") {
      return NextResponse.json(
        {
          status: "error",
          code: "INVALID_FEED_ENTRY",
          message: "each feed must contain journalName and feedUrl"
        },
        { status: 400 }
      );
    }

    const journalName = feed.journalName.trim();
    const feedUrl = feed.feedUrl.trim();

    if (!journalName || !feedUrl || !isValidUrl(feedUrl)) {
      return NextResponse.json(
        {
          status: "error",
          code: "INVALID_FEED_ENTRY",
          message: "journalName must be non-empty and feedUrl must be a valid URL"
        },
        { status: 400 }
      );
    }

    normalized.push({
      journalName,
      feedUrl,
      isActive: feed.isActive ?? true
    });
  }

  const repository = new PrismaJournalFeedRepository(prisma);
  const feeds = await repository.upsertFeeds(normalized);

  return NextResponse.json({
    status: "ok",
    feeds
  });
}

function isValidUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

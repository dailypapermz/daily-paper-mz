import { NextResponse } from "next/server";

import { getApplicationPrismaClient } from "../../../../db/prisma/application-client";
import { PrismaJournalFeedRepository } from "../../../../db/repositories";
import {
  isCloudDeployment,
  readJsonMutationBody,
  sanitizedInternalError
} from "../../../../lib/http/cloud-boundary";

type JournalFeedInput = {
  journalName: string;
  feedUrl: string;
  isActive?: boolean;
};

type ImportJournalPoolBody = { feeds?: JournalFeedInput[] };
type UpdateJournalPoolBody = { id?: string; isActive?: boolean };

export async function GET() {
  try {
    const repository = new PrismaJournalFeedRepository(getApplicationPrismaClient());
    return NextResponse.json({ status: "ok", feeds: await repository.listFeeds() });
  } catch {
    return sanitizedInternalError("JOURNAL_POOL_READ_FAILED");
  }
}

export async function PUT(request: Request) {
  const parsed = await readJsonMutationBody(request, { maxBytes: 8 * 1024 });
  if (!parsed.ok) return parsed.response;
  const body = isPlainObject(parsed.value) ? (parsed.value as UpdateJournalPoolBody) : {};
  const id = body.id?.trim();

  if (!id || id.length > 191 || typeof body.isActive !== "boolean") {
    return NextResponse.json(
      { status: "error", code: "INVALID_PAYLOAD", message: "id and isActive(boolean) are required" },
      { status: 400 }
    );
  }

  try {
    const repository = new PrismaJournalFeedRepository(getApplicationPrismaClient());
    if (!(await repository.getFeedById(id))) {
      return NextResponse.json(
        { status: "error", code: "FEED_NOT_FOUND", message: "Journal feed not found." },
        { status: 404 }
      );
    }
    return NextResponse.json({
      status: "ok",
      feed: await repository.updateFeedActive({ id, isActive: body.isActive })
    });
  } catch {
    return sanitizedInternalError("JOURNAL_POOL_WRITE_FAILED");
  }
}

export async function POST(request: Request) {
  const parsed = await readJsonMutationBody(request, { maxBytes: 64 * 1024 });
  if (!parsed.ok) return parsed.response;
  const body = isPlainObject(parsed.value) ? (parsed.value as ImportJournalPoolBody) : {};

  if (!Array.isArray(body.feeds) || body.feeds.length === 0 || body.feeds.length > 100) {
    return NextResponse.json(
      { status: "error", code: "INVALID_PAYLOAD", message: "feeds must contain between 1 and 100 entries" },
      { status: 400 }
    );
  }

  const normalized: JournalFeedInput[] = [];
  for (const feed of body.feeds) {
    if (!isPlainObject(feed) || typeof feed.journalName !== "string" || typeof feed.feedUrl !== "string") {
      return invalidFeedEntry();
    }
    const journalName = feed.journalName.trim();
    const feedUrl = feed.feedUrl.trim();
    if (
      !journalName ||
      journalName.length > 300 ||
      !feedUrl ||
      feedUrl.length > 2_048 ||
      !isValidFeedUrl(feedUrl) ||
      (feed.isActive !== undefined && typeof feed.isActive !== "boolean")
    ) {
      return invalidFeedEntry();
    }
    normalized.push({ journalName, feedUrl, isActive: feed.isActive ?? true });
  }

  try {
    const repository = new PrismaJournalFeedRepository(getApplicationPrismaClient());
    return NextResponse.json({ status: "ok", feeds: await repository.upsertFeeds(normalized) });
  } catch {
    return sanitizedInternalError("JOURNAL_POOL_WRITE_FAILED");
  }
}

function invalidFeedEntry() {
  return NextResponse.json(
    {
      status: "error",
      code: "INVALID_FEED_ENTRY",
      message: "Each feed requires a valid journal name and allowed feed URL."
    },
    { status: 400 }
  );
}

function isValidFeedUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    if (isCloudDeployment()) return parsed.protocol === "https:" && isPublicHostname(parsed.hostname);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function isPublicHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost" || normalized.endsWith(".localhost") || normalized.endsWith(".local")) return false;
  if (normalized === "::1" || normalized === "::" || normalized.startsWith("fe80:")) return false;
  const parts = normalized.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [first, second] = parts;
  return !(
    first === 0 || first === 10 || first === 127 || first >= 224 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 100 && second >= 64 && second <= 127)
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

import { AppError } from "../../lib/errors";
import { logger } from "../../lib/logging";
import { fetchWithRetry } from "./http";
import type {
  DailySourceAdapter,
  DailySourceAdapterCandidate,
  JournalFeedRepository,
  JournalFeedSourceRecord,
  UtcDayWindow
} from "./types";

const REQUEST_TIMEOUT_MS = 10000;

export class JournalFeedSourceAdapter implements DailySourceAdapter {
  readonly source = "journal" as const;

  constructor(private readonly repository: JournalFeedRepository) {}

  async fetchCandidatesForDay(_window: UtcDayWindow): Promise<DailySourceAdapterCandidate[]> {
    const feeds = await this.repository.listActiveFeeds();
    const records: DailySourceAdapterCandidate[] = [];

    for (const feed of feeds) {
      try {
        const response = await this.fetchFeed(feed);
        const xml = await response.text();
        records.push(...parseFeedXml(xml, feed));
      } catch (error) {
        logger.warn("Journal feed fetch failed; continuing remaining feeds", {
          feedId: feed.id,
          feedUrl: feed.feedUrl,
          errorMessage: toErrorMessage(error)
        });
      }
    }

    return records;
  }

  private async fetchFeed(feed: JournalFeedSourceRecord): Promise<Response> {
    let response: Response;

    try {
      response = await fetchWithRetry(
        feed.feedUrl,
        {
          headers: {
            Accept: "application/rss+xml, application/atom+xml, application/xml"
          }
        },
        {
          timeoutMs: REQUEST_TIMEOUT_MS
        }
      );
    } catch (error) {
      throw new AppError(
        "JOURNAL_FEED_FETCH_FAILED",
        error instanceof Error ? error.message : `Journal feed request failed for ${feed.feedUrl}`
      );
    }

    if (!response.ok) {
      throw new AppError(
        "JOURNAL_FEED_FETCH_FAILED",
        `Journal feed fetch failed (${response.status}) for ${feed.feedUrl}`
      );
    }

    return response;
  }
}

export function parseFeedXml(xml: string, feed: JournalFeedSourceRecord): DailySourceAdapterCandidate[] {
  const rssItems = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];
  const atomEntries = xml.match(/<entry[\s\S]*?<\/entry>/gi) ?? [];

  const rawEntries = rssItems.length > 0 ? rssItems : atomEntries;

  return rawEntries.map((entry) => mapFeedEntry(entry, feed));
}

function mapFeedEntry(entry: string, feed: JournalFeedSourceRecord): DailySourceAdapterCandidate {
  const externalId =
    sanitize(extractTag(entry, "guid")) ??
    sanitize(extractTag(entry, "id")) ??
    sanitize(extractLink(entry)) ??
    `${feed.feedUrl}#${hashText(entry)}`;

  const publishedAt =
    toDate(extractTag(entry, "pubDate")) ??
    toDate(extractTag(entry, "published")) ??
    toDate(extractTag(entry, "updated"));

  const summary = sanitize(extractTag(entry, "description")) ?? sanitize(extractTag(entry, "summary"));
  const title = sanitize(extractTag(entry, "title"));
  const link = sanitize(extractLink(entry));

  return {
    externalId,
    title,
    abstractNote: summary,
    publishedAt,
    indexedAt: publishedAt,
    url: link,
    journalName: feed.journalName,
    authors: extractAuthors(entry),
    sourcePayload: {
      feedUrl: feed.feedUrl,
      journalName: feed.journalName,
      rawEntry: entry
    }
  };
}

function extractTag(entry: string, tag: string): string | undefined {
  const match = entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match?.[1];
}

function extractLink(entry: string): string | undefined {
  const rss = extractTag(entry, "link");
  if (rss) {
    return rss;
  }

  const atomMatch = entry.match(/<link[^>]*href="([^"]+)"[^>]*\/?>(?:<\/link>)?/i);
  return atomMatch?.[1];
}

function extractAuthors(entry: string): string[] {
  const authorTags = entry.match(/<author>[\s\S]*?<\/author>/gi) ?? [];
  const fromAuthorTags = authorTags
    .map((authorTag) =>
      sanitize(extractTag(authorTag, "name")) ?? sanitize(authorTag.replace(/<[^>]+>/g, " "))
    )
    .filter((author): author is string => Boolean(author));

  if (fromAuthorTags.length > 0) {
    return fromAuthorTags;
  }

  const creator = sanitize(extractTag(entry, "dc:creator"));
  if (creator) {
    return creator
      .split(",")
      .map((author) => author.trim())
      .filter(Boolean);
  }

  return [];
}

function sanitize(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : undefined;
}

function toDate(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function hashText(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash).toString(16);
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}

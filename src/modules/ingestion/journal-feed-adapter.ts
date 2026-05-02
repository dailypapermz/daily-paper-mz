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
        const content = await response.text();
        records.push(...parseJournalFeedContent(content, feed));
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
            Accept: "application/rss+xml, application/atom+xml, application/xml, text/html;q=0.9, */*;q=0.1"
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

export function parseJournalFeedContent(
  content: string,
  feed: JournalFeedSourceRecord
): DailySourceAdapterCandidate[] {
  if (isFeedDocument(content)) {
    return parseFeedXml(content, feed);
  }

  if (isGenomeResearchPage(feed.feedUrl, content)) {
    return parseGenomeResearchPage(content, feed);
  }

  return [];
}

export function parseFeedXml(xml: string, feed: JournalFeedSourceRecord): DailySourceAdapterCandidate[] {
  const rssItems = xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi) ?? [];
  const atomEntries = xml.match(/<entry[\s\S]*?<\/entry>/gi) ?? [];
  const rawEntries = rssItems.length > 0 ? rssItems : atomEntries;
  return rawEntries.map((entry) => mapFeedEntry(entry, feed));
}

export function parseGenomeResearchPage(
  html: string,
  feed: JournalFeedSourceRecord
): DailySourceAdapterCandidate[] {
  const articleMatches =
    html.match(/<article[^>]*class="[^"]*\barticle-section\b[^"]*"[^>]*>[\s\S]*?<\/article>/gi) ?? [];

  return articleMatches
    .map((entry) => mapGenomeResearchEntry(entry, feed))
    .filter((candidate): candidate is DailySourceAdapterCandidate => Boolean(candidate));
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

function mapGenomeResearchEntry(
  entry: string,
  feed: JournalFeedSourceRecord
): DailySourceAdapterCandidate | null {
  const linkMatch = entry.match(
    /<h5[^>]*class="[^"]*\btitle\b[^"]*"[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h5>/i
  );
  if (!linkMatch) {
    return null;
  }

  const relativePath = sanitize(linkMatch[1]);
  const title = sanitize(linkMatch[2]);
  const url = relativePath ? toAbsoluteUrl(feed.feedUrl, relativePath) : undefined;
  const publishedAt = toMonthDayYearDate(sanitize(extractFirstPublished(entry)));

  return {
    externalId: relativePath ?? url ?? `${feed.feedUrl}#${hashText(entry)}`,
    title,
    abstractNote: undefined,
    publishedAt,
    indexedAt: publishedAt,
    url,
    journalName: feed.journalName,
    authors: extractGenomeResearchAuthors(entry),
    sourcePayload: {
      feedUrl: feed.feedUrl,
      journalName: feed.journalName,
      parser: "genome_research_page",
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

function extractGenomeResearchAuthors(entry: string): string[] {
  const authorListMatch = entry.match(
    /<div[^>]*class="[^"]*\barticle__authorname\b[^"]*"[^>]*>[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/i
  );
  if (!authorListMatch) {
    return [];
  }

  return (authorListMatch[1].match(/<li[^>]*>([\s\S]*?)<\/li>/gi) ?? [])
    .map((item) => sanitize(item.replace(/<[^>]+>/g, " ")))
    .filter((author): author is string => Boolean(author))
    .filter((author) => !author.includes("[+"))
    .filter((author) => author !== "...");
}

function extractFirstPublished(entry: string): string | undefined {
  const match = entry.match(
    /<span[^>]*class="[^"]*\bcard-citation-value\b[^"]*"[^>]*>([\s\S]*?)<\/span>/i
  );
  return match?.[1];
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

function toMonthDayYearDate(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.replace(/\.$/, "").trim();
  const match = normalized.match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/);
  if (!match) {
    return toDate(normalized);
  }

  const [, monthName, dayValue, yearValue] = match;
  const monthIndex = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december"
  ].indexOf(monthName.toLowerCase());

  if (monthIndex < 0) {
    return toDate(normalized);
  }

  return new Date(Date.UTC(Number(yearValue), monthIndex, Number(dayValue)));
}

function toAbsoluteUrl(baseUrl: string, relativePath: string): string {
  if (/^https?:\/\//i.test(relativePath)) {
    return relativePath;
  }

  return new URL(relativePath, baseUrl).toString();
}

function isFeedDocument(content: string): boolean {
  return /<(rss|feed|rdf:RDF)\b/i.test(content);
}

function isGenomeResearchPage(feedUrl: string, content: string): boolean {
  return /genome\.cshlp\.org/i.test(feedUrl) && /<article class="article-section">/i.test(content);
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

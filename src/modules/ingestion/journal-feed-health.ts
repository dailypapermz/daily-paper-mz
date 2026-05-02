import { fetchWithRetry } from "./http";
import { parseJournalFeedContent } from "./journal-feed-adapter";
import type { JournalFeedSourceRecord } from "./types";

const REQUEST_TIMEOUT_MS = 10000;
const DEFAULT_CONCURRENCY = 4;

export type JournalFeedHealthStatus = "healthy" | "http_error" | "invalid_feed" | "request_failed";

export type JournalFeedHealthReport = {
  id: string;
  journalName: string;
  feedUrl: string;
  isActive: boolean;
  status: JournalFeedHealthStatus;
  checkedAt: string;
  itemCount: number;
  httpStatus?: number;
  contentType?: string;
  finalUrl?: string;
  errorMessage?: string;
};

export async function checkJournalFeedHealth(
  feed: JournalFeedSourceRecord
): Promise<JournalFeedHealthReport> {
  const checkedAt = new Date().toISOString();

  try {
    const response = await fetchWithRetry(
      feed.feedUrl,
      {
        headers: {
          Accept:
            "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, text/html;q=0.8, */*;q=0.1",
          "User-Agent": "daily-paper-feed-check/1.0"
        }
      },
      {
        timeoutMs: REQUEST_TIMEOUT_MS
      }
    );

    const text = await response.text();
    const baseReport = {
      id: feed.id,
      journalName: feed.journalName,
      feedUrl: feed.feedUrl,
      isActive: feed.isActive,
      checkedAt,
      httpStatus: response.status,
      contentType: response.headers.get("content-type") ?? undefined,
      finalUrl: response.url
    };

    if (!response.ok) {
      return {
        ...baseReport,
        status: "http_error",
        itemCount: 0,
        errorMessage: `Feed returned HTTP ${response.status}`
      };
    }

    const candidates = parseJournalFeedContent(text, feed);
    if (candidates.length === 0) {
      return {
        ...baseReport,
        status: "invalid_feed",
        itemCount: 0,
        errorMessage: "Response did not contain a supported feed or page format"
      };
    }

    return {
      ...baseReport,
      status: "healthy",
      itemCount: candidates.length
    };
  } catch (error) {
    return {
      id: feed.id,
      journalName: feed.journalName,
      feedUrl: feed.feedUrl,
      isActive: feed.isActive,
      status: "request_failed",
      checkedAt,
      itemCount: 0,
      errorMessage: error instanceof Error ? error.message : "Unknown feed check error"
    };
  }
}

export async function checkJournalFeedPoolHealth(
  feeds: JournalFeedSourceRecord[],
  concurrency = DEFAULT_CONCURRENCY
): Promise<JournalFeedHealthReport[]> {
  if (feeds.length === 0) {
    return [];
  }

  const reports: JournalFeedHealthReport[] = [];

  for (let index = 0; index < feeds.length; index += concurrency) {
    const batch = feeds.slice(index, index + concurrency);
    const batchReports = await Promise.all(batch.map((feed) => checkJournalFeedHealth(feed)));
    reports.push(...batchReports);
  }

  return reports;
}

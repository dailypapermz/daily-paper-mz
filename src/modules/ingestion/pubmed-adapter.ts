import { AppError } from "../../lib/errors";
import type { DailySourceAdapter, DailySourceAdapterCandidate, UtcDayWindow } from "./types";

const PUBMED_EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const MAX_IDS = 200;

type PubmedESearchResponse = {
  esearchresult?: {
    idlist?: string[];
  };
};

type PubmedESummaryResponse = {
  result?: {
    uids?: string[];
    [key: string]: unknown;
  };
};

type PubmedSummaryRecord = {
  uid?: string;
  title?: string;
  pubdate?: string;
  sortpubdate?: string;
  articleids?: Array<{ idtype?: string; value?: string }>;
  authors?: Array<{ name?: string }>;
  [key: string]: unknown;
};

export class PubmedSourceAdapter implements DailySourceAdapter {
  readonly source = "pubmed" as const;

  private readonly queryScope: string;

  constructor(input?: { queryScope?: string }) {
    this.queryScope = input?.queryScope?.trim() || "all[sb]";
  }

  async fetchCandidatesForDay(window: UtcDayWindow): Promise<DailySourceAdapterCandidate[]> {
    const date = toPubmedDate(window.runDate);
    const ids = await this.searchIds(date);

    if (ids.length === 0) {
      return [];
    }

    const records = await this.fetchSummaries(ids);

    return records.map((record) => mapPubmedRecord(record));
  }

  private async searchIds(date: string): Promise<string[]> {
    const searchUrl =
      `${PUBMED_EUTILS_BASE}/esearch.fcgi` +
      `?db=pubmed&retmode=json&retmax=${MAX_IDS}` +
      `&datetype=edat&mindate=${encodeURIComponent(date)}&maxdate=${encodeURIComponent(date)}` +
      `&term=${encodeURIComponent(this.queryScope)}`;

    const response = await fetch(searchUrl, {
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new AppError(
        "PUBMED_API_ERROR",
        `PubMed esearch failed with status ${response.status}`
      );
    }

    const payload = (await response.json()) as PubmedESearchResponse;
    const ids = payload.esearchresult?.idlist;

    return Array.isArray(ids) ? ids.filter((id) => typeof id === "string" && id.trim() !== "") : [];
  }

  private async fetchSummaries(ids: string[]): Promise<PubmedSummaryRecord[]> {
    const summaryUrl =
      `${PUBMED_EUTILS_BASE}/esummary.fcgi` +
      `?db=pubmed&retmode=json&id=${encodeURIComponent(ids.join(","))}`;

    const response = await fetch(summaryUrl, {
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new AppError(
        "PUBMED_API_ERROR",
        `PubMed esummary failed with status ${response.status}`
      );
    }

    const payload = (await response.json()) as PubmedESummaryResponse;
    const result = payload.result;

    if (!result || !Array.isArray(result.uids)) {
      return [];
    }

    return result.uids
      .map((uid) => result[uid])
      .filter((record): record is PubmedSummaryRecord => typeof record === "object" && record !== null);
  }
}

function mapPubmedRecord(record: PubmedSummaryRecord): DailySourceAdapterCandidate {
  const pmid = sanitize(record.uid) ?? "unknown";
  const doi = Array.isArray(record.articleids)
    ? sanitize(record.articleids.find((id) => id.idtype === "doi")?.value)
    : undefined;

  return {
    externalId: pmid,
    title: sanitize(record.title),
    abstractNote: undefined,
    publishedAt: toDate(record.sortpubdate ?? record.pubdate),
    indexedAt: toDate(record.sortpubdate ?? record.pubdate),
    url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    doi,
    pmid,
    journalName: undefined,
    authors: Array.isArray(record.authors)
      ? record.authors.map((author) => sanitize(author.name) ?? "").filter(Boolean)
      : [],
    sourcePayload: record as unknown as Record<string, unknown>
  };
}

function toPubmedDate(value: Date): string {
  const year = value.getUTCFullYear();
  const month = `${value.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${value.getUTCDate()}`.padStart(2, "0");

  return `${year}/${month}/${day}`;
}

function sanitize(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function toDate(value: unknown): Date | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

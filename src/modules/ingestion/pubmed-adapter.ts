import { AppError } from "../../lib/errors";
import { fetchWithRetry } from "./http";
import type { DailySourceAdapter, DailySourceAdapterCandidate, UtcDayWindow } from "./types";

const PUBMED_EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const PUBMED_PAGE_SIZE = 200;
const PUBMED_MAX_SEARCH_PAGES = 5;
const PUBMED_SUMMARY_BATCH_SIZE = 200;
const PUBMED_ABSTRACT_BATCH_SIZE = 100;
const REQUEST_TIMEOUT_MS = 12000;

type PubmedESearchResponse = {
  esearchresult?: {
    idlist?: string[];
    count?: string;
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
  history?: Array<{ pubstatus?: string; date?: string }>;
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

    const summaries = await this.fetchSummaries(ids);
    const abstracts = await this.fetchAbstracts(ids);

    return ids.map((id) => {
      const summary = summaries.get(id) ?? { uid: id };
      return mapPubmedRecord(summary, abstracts.get(id));
    });
  }

  private async searchIds(date: string): Promise<string[]> {
    const ids: string[] = [];
    let totalCount: number | null = null;

    for (let page = 0; page < PUBMED_MAX_SEARCH_PAGES; page += 1) {
      const retstart = page * PUBMED_PAGE_SIZE;
      const searchUrl =
        `${PUBMED_EUTILS_BASE}/esearch.fcgi` +
        `?db=pubmed&retmode=json&retmax=${PUBMED_PAGE_SIZE}&retstart=${retstart}` +
        `&datetype=edat&mindate=${encodeURIComponent(date)}&maxdate=${encodeURIComponent(date)}` +
        `&term=${encodeURIComponent(this.queryScope)}`;

      const payload = await this.requestJson<PubmedESearchResponse>(searchUrl, "esearch");
      const pageIds = Array.isArray(payload.esearchresult?.idlist)
        ? payload.esearchresult?.idlist.filter((id) => typeof id === "string" && id.trim() !== "")
        : [];

      ids.push(...pageIds);

      if (totalCount === null) {
        totalCount = Number.parseInt(payload.esearchresult?.count ?? "", 10);
        if (!Number.isFinite(totalCount)) {
          totalCount = null;
        }
      }

      if (pageIds.length < PUBMED_PAGE_SIZE) {
        break;
      }

      if (totalCount !== null && ids.length >= totalCount) {
        break;
      }
    }

    return Array.from(new Set(ids));
  }

  private async fetchSummaries(ids: string[]): Promise<Map<string, PubmedSummaryRecord>> {
    const records = new Map<string, PubmedSummaryRecord>();

    for (const batch of chunk(ids, PUBMED_SUMMARY_BATCH_SIZE)) {
      const summaryUrl =
        `${PUBMED_EUTILS_BASE}/esummary.fcgi` +
        `?db=pubmed&retmode=json&id=${encodeURIComponent(batch.join(","))}`;

      const payload = await this.requestJson<PubmedESummaryResponse>(summaryUrl, "esummary");
      const result = payload.result;

      if (!result || !Array.isArray(result.uids)) {
        continue;
      }

      for (const uid of result.uids) {
        const row = result[uid];
        if (typeof row === "object" && row !== null) {
          records.set(uid, row as PubmedSummaryRecord);
        }
      }
    }

    return records;
  }

  private async fetchAbstracts(ids: string[]): Promise<Map<string, string>> {
    const abstracts = new Map<string, string>();

    for (const batch of chunk(ids, PUBMED_ABSTRACT_BATCH_SIZE)) {
      const fetchUrl =
        `${PUBMED_EUTILS_BASE}/efetch.fcgi` +
        `?db=pubmed&retmode=xml&id=${encodeURIComponent(batch.join(","))}`;

      const xml = await this.requestText(fetchUrl, "efetch");
      const parsed = parsePubmedAbstracts(xml);

      for (const [pmid, text] of parsed.entries()) {
        abstracts.set(pmid, text);
      }
    }

    return abstracts;
  }

  private async requestJson<T>(url: string, endpoint: "esearch" | "esummary"): Promise<T> {
    let response: Response;

    try {
      response = await fetchWithRetry(
        url,
        {
          headers: {
            Accept: "application/json"
          }
        },
        {
          timeoutMs: REQUEST_TIMEOUT_MS
        }
      );
    } catch (error) {
      throw new AppError("PUBMED_API_ERROR", error instanceof Error ? error.message : `PubMed ${endpoint} failed`);
    }

    if (!response.ok) {
      throw new AppError("PUBMED_API_ERROR", `PubMed ${endpoint} failed with status ${response.status}`);
    }

    return (await response.json()) as T;
  }

  private async requestText(url: string, endpoint: "efetch"): Promise<string> {
    let response: Response;

    try {
      response = await fetchWithRetry(
        url,
        {
          headers: {
            Accept: "application/xml,text/xml"
          }
        },
        {
          timeoutMs: REQUEST_TIMEOUT_MS
        }
      );
    } catch (error) {
      throw new AppError("PUBMED_API_ERROR", error instanceof Error ? error.message : `PubMed ${endpoint} failed`);
    }

    if (!response.ok) {
      throw new AppError("PUBMED_API_ERROR", `PubMed ${endpoint} failed with status ${response.status}`);
    }

    return response.text();
  }
}

function mapPubmedRecord(record: PubmedSummaryRecord, abstractText?: string): DailySourceAdapterCandidate {
  const pmid = sanitize(record.uid) ?? "unknown";
  const doi = Array.isArray(record.articleids)
    ? sanitize(record.articleids.find((id) => id.idtype === "doi")?.value)
    : undefined;
  const historyDates = extractHistoryDates(record.history);

  return {
    externalId: pmid,
    title: sanitize(record.title),
    abstractNote: abstractText,
    publishedAt: parsePubmedDateValue(record.sortpubdate) ?? parsePubmedDateValue(record.pubdate),
    indexedAt:
      parsePubmedHistoryDate(historyDates.entrez) ??
      parsePubmedHistoryDate(historyDates.pubmed) ??
      parsePubmedHistoryDate(historyDates.medline),
    url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    doi,
    pmid,
    journalName: undefined,
    authors: Array.isArray(record.authors)
      ? record.authors.map((author) => sanitize(author.name) ?? "").filter(Boolean)
      : [],
    sourcePayload: {
      summary: record,
      abstractText: abstractText ?? null,
      historyDates
    }
  };
}

function extractHistoryDates(history: PubmedSummaryRecord["history"]) {
  const dates: {
    entrez?: string;
    pubmed?: string;
    medline?: string;
  } = {};

  for (const entry of history ?? []) {
    const status = sanitize(entry.pubstatus)?.toLowerCase();
    const date = sanitize(entry.date);

    if (!status || !date) {
      continue;
    }

    if (status === "entrez" || status === "pubmed" || status === "medline") {
      dates[status] = date;
    }
  }

  return dates;
}

function parsePubmedAbstracts(xml: string): Map<string, string> {
  const parsed = new Map<string, string>();
  const articles = xml.match(/<PubmedArticle[\s\S]*?<\/PubmedArticle>/gi) ?? [];

  for (const article of articles) {
    const pmid = sanitize(stripXml(extractTag(article, "PMID")));
    if (!pmid) {
      continue;
    }

    const abstractParts = Array.from(article.matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/gi))
      .map((match) => sanitize(stripXml(match[1])))
      .filter((value): value is string => Boolean(value));

    if (abstractParts.length > 0) {
      parsed.set(pmid, abstractParts.join(" "));
    }
  }

  return parsed;
}

function extractTag(xml: string, tag: string): string | undefined {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = xml.match(regex);
  return match?.[1];
}

function stripXml(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
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

function parsePubmedDateValue(value: unknown): Date | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }

  const normalized = value.trim();
  const slashMatch = normalized.match(/^(\d{4})\/(\d{2})\/(\d{2})(?:\s+(\d{2}):(\d{2}))?$/);
  if (slashMatch) {
    const [, year, month, day, hours = "00", minutes = "00"] = slashMatch;
    return new Date(
      Date.UTC(
        Number.parseInt(year, 10),
        Number.parseInt(month, 10) - 1,
        Number.parseInt(day, 10),
        Number.parseInt(hours, 10),
        Number.parseInt(minutes, 10)
      )
    );
  }

  const textualMatch = normalized.match(/^(\d{4})\s+([A-Za-z]{3})\s+(\d{1,2})$/);
  if (textualMatch) {
    const [, year, monthToken, day] = textualMatch;
    const month = monthFromToken(monthToken);
    if (month !== undefined) {
      return new Date(Date.UTC(Number.parseInt(year, 10), month, Number.parseInt(day, 10)));
    }
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function parsePubmedHistoryDate(value?: string): Date | undefined {
  return parsePubmedDateValue(value);
}

function monthFromToken(value: string): number | undefined {
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const index = months.indexOf(value.toLowerCase());
  return index >= 0 ? index : undefined;
}

function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) {
    return [items];
  }

  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }

  return output;
}

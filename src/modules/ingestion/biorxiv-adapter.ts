import { AppError } from "../../lib/errors";
import type { DailySourceAdapter, DailySourceAdapterCandidate, UtcDayWindow } from "./types";

const DEFAULT_BIORXIV_API_BASE = "https://api.biorxiv.org";
const PAGE_SIZE = 100;
const MAX_PAGES = 50;

type BioRxivApiResponse = {
  collection?: BioRxivApiRecord[];
};

type BioRxivApiRecord = {
  doi?: string;
  title?: string;
  abstract?: string;
  date?: string;
  category?: string;
  authors?: string;
  version?: string;
  jatsxml?: string;
  [key: string]: unknown;
};

export class BioRxivSourceAdapter implements DailySourceAdapter {
  readonly source = "biorxiv" as const;

  private readonly baseUrl: string;
  private readonly subjectScopes: string[];

  constructor(input?: { baseUrl?: string; subjectScopes?: string[] }) {
    this.baseUrl = input?.baseUrl ?? DEFAULT_BIORXIV_API_BASE;
    this.subjectScopes = (input?.subjectScopes ?? []).map((scope) => scope.toLowerCase());
  }

  async fetchCandidatesForDay(window: UtcDayWindow): Promise<DailySourceAdapterCandidate[]> {
    const fromDate = toDateOnly(window.dayStart);
    const toDate = toDateOnly(window.dayEnd);

    const records = await this.fetchPaginatedRecords(fromDate, toDate);
    const filteredByScope = this.filterByScope(records);

    return filteredByScope.map((record) => mapBioRxivRecord(record));
  }

  private async fetchPaginatedRecords(fromDate: string, toDate: string) {
    const all: BioRxivApiRecord[] = [];

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const cursor = page * PAGE_SIZE;
      const url = `${this.baseUrl}/details/biorxiv/${fromDate}/${toDate}/${cursor}`;

      const response = await fetch(url, {
        headers: {
          Accept: "application/json"
        }
      });

      if (!response.ok) {
        throw new AppError(
          "BIORXIV_API_ERROR",
          `bioRxiv API request failed with status ${response.status}`
        );
      }

      const payload = (await response.json()) as BioRxivApiResponse;
      const pageRecords = Array.isArray(payload.collection) ? payload.collection : [];

      all.push(...pageRecords);

      if (pageRecords.length < PAGE_SIZE) {
        break;
      }
    }

    return all;
  }

  private filterByScope(records: BioRxivApiRecord[]) {
    if (this.subjectScopes.length === 0) {
      return records;
    }

    return records.filter((record) => {
      const category = typeof record.category === "string" ? record.category.toLowerCase() : "";
      return this.subjectScopes.some((scope) => category.includes(scope));
    });
  }
}

function mapBioRxivRecord(record: BioRxivApiRecord): DailySourceAdapterCandidate {
  const doi = sanitizeString(record.doi);
  const version = sanitizeString(record.version);
  const publishedAt = toDate(record.date);

  return {
    externalId: doi ?? sanitizeString(record.jatsxml) ?? JSON.stringify(record),
    title: sanitizeString(record.title),
    abstractNote: sanitizeString(record.abstract),
    publishedAt,
    indexedAt: publishedAt,
    url: buildBioRxivUrl(doi, version),
    doi,
    bioRxivId: doi,
    journalName: "bioRxiv",
    authors: parseAuthors(record.authors),
    sourcePayload: record as unknown as Record<string, unknown>
  };
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function sanitizeString(value: unknown): string | undefined {
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

function parseAuthors(value: unknown): string[] {
  if (typeof value !== "string" || value.trim() === "") {
    return [];
  }

  const delimiter = value.includes(";") ? ";" : ",";
  return value
    .split(delimiter)
    .map((author) => author.trim())
    .filter(Boolean);
}

function buildBioRxivUrl(doi?: string, version?: string): string | undefined {
  if (!doi) {
    return undefined;
  }

  const suffix = version ? `v${version}` : "";
  return `https://www.biorxiv.org/content/${doi}${suffix}`;
}

import { AppError } from "../../lib/errors";
import { logger } from "../../lib/logging";
import type {
  ZoteroApiCollection,
  ZoteroApiItem,
  ZoteroClient,
  ZoteroFetchOptions,
  ZoteroFetchResult
} from "./types";

type ZoteroHttpClientOptions = {
  userId: string;
  apiKey: string;
  baseUrl?: string;
  pageSize?: number;
  maxRetries?: number;
};

export class HttpZoteroClient implements ZoteroClient {
  private readonly baseUrl: string;
  private readonly pageSize: number;
  private readonly maxRetries: number;

  constructor(private readonly options: ZoteroHttpClientOptions) {
    this.baseUrl = options.baseUrl ?? "https://api.zotero.org";
    this.pageSize = options.pageSize ?? 100;
    this.maxRetries = options.maxRetries ?? 2;
  }

  fetchItems(options?: ZoteroFetchOptions): Promise<ZoteroFetchResult<ZoteroApiItem>> {
    return this.fetchPaginated<ZoteroApiItem>("items", options);
  }

  fetchCollections(
    options?: ZoteroFetchOptions
  ): Promise<ZoteroFetchResult<ZoteroApiCollection>> {
    return this.fetchPaginated<ZoteroApiCollection>("collections", options);
  }

  private async fetchPaginated<T>(
    resource: "items" | "collections",
    options?: ZoteroFetchOptions
  ): Promise<ZoteroFetchResult<T>> {
    const records: T[] = [];
    let start = 0;
    let libraryVersion: number | null = null;

    while (true) {
      const url = new URL(
        `/users/${this.options.userId}/${resource}`,
        this.baseUrl.endsWith("/") ? this.baseUrl : `${this.baseUrl}/`
      );
      url.searchParams.set("format", "json");
      url.searchParams.set("limit", String(this.pageSize));
      url.searchParams.set("start", String(start));
      if (options?.sinceVersion) {
        url.searchParams.set("since", String(options.sinceVersion));
      }

      const response = await this.fetchWithRetry(url.toString());
      const page = (await response.json()) as T[];
      const pageLibraryVersion = Number(response.headers.get("Last-Modified-Version"));
      if (Number.isFinite(pageLibraryVersion)) {
        libraryVersion = Math.max(libraryVersion ?? 0, pageLibraryVersion);
      }

      records.push(...page);

      if (page.length < this.pageSize) {
        break;
      }

      start += this.pageSize;
    }

    return { records, libraryVersion };
  }

  private async fetchWithRetry(url: string): Promise<Response> {
    let attempt = 0;

    while (true) {
      try {
        const response = await fetch(url, {
          headers: {
            "Zotero-API-Key": this.options.apiKey,
            "Zotero-API-Version": "3",
            Accept: "application/json"
          }
        });

        if (response.ok) {
          return response;
        }

        if (response.status >= 500 && attempt < this.maxRetries) {
          attempt += 1;
          await sleep(backoffMs(attempt));
          continue;
        }

        const body = await response.text();
        throw new AppError("ZOTERO_API_ERROR", `Zotero request failed: ${response.status} ${body}`);
      } catch (error) {
        if (attempt < this.maxRetries) {
          attempt += 1;
          logger.warn("Retrying Zotero request after error", {
            url,
            attempt,
            message: error instanceof Error ? error.message : String(error)
          });
          await sleep(backoffMs(attempt));
          continue;
        }

        if (error instanceof AppError) {
          throw error;
        }

        throw new AppError(
          "ZOTERO_API_NETWORK_ERROR",
          error instanceof Error ? error.message : "Unknown Zotero request error"
        );
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
  return 250 * 2 ** (attempt - 1);
}

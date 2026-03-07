import { AppError } from "../../lib/errors";
import type { JournalEnrichmentProvider, JournalMetricRecord } from "./types";

type EasyScholarProviderOptions = {
  apiUrl: string;
  apiKey: string;
  timeoutMs?: number;
};

export class UnavailableJournalEnrichmentProvider implements JournalEnrichmentProvider {
  readonly name = "unavailable";

  constructor(private readonly reason = "Journal enrichment provider is not configured") {}

  async fetchJournalMetric(_journalName: string): Promise<JournalMetricRecord | null> {
    throw new AppError("JOURNAL_ENRICHMENT_UNAVAILABLE", this.reason, 503);
  }
}

export class EasyScholarJournalEnrichmentProvider implements JournalEnrichmentProvider {
  readonly name = "easyscholar";
  private readonly endpoint: string;
  private readonly timeoutMs: number;

  constructor(private readonly options: EasyScholarProviderOptions) {
    this.endpoint = options.apiUrl.replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  async fetchJournalMetric(journalName: string): Promise<JournalMetricRecord | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      const url = `${this.endpoint}/journal/metrics?name=${encodeURIComponent(journalName)}`;
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.options.apiKey}`
        },
        signal: controller.signal
      });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new AppError(
          "JOURNAL_ENRICHMENT_PROVIDER_ERROR",
          `Journal enrichment request failed with status ${response.status}`,
          502,
          {
            provider: this.name,
            status: response.status
          }
        );
      }

      const payload = (await response.json()) as unknown;
      const metric = parseEasyScholarMetric(payload, journalName);
      if (!metric) {
        return null;
      }

      return {
        quartile: metric.quartile,
        impactScore: metric.impactScore,
        rawPayload: toObject(payload) ?? {
          value: payload
        },
        normalized: metric.normalized
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new AppError(
          "JOURNAL_ENRICHMENT_PROVIDER_TIMEOUT",
          "Journal enrichment request timed out",
          504,
          {
            provider: this.name
          }
        );
      }

      throw new AppError(
        "JOURNAL_ENRICHMENT_PROVIDER_ERROR",
        error instanceof Error ? error.message : "Unknown journal enrichment provider error",
        502,
        {
          provider: this.name
        }
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createJournalEnrichmentProvider(input: {
  apiKey?: string;
  apiUrl?: string;
}): JournalEnrichmentProvider {
  const apiKey = input.apiKey?.trim();
  const apiUrl = input.apiUrl?.trim();

  if (!apiKey || !apiUrl) {
    return new UnavailableJournalEnrichmentProvider(
      "EasyScholar configuration is missing. Set EASYSCHOLAR_API_KEY and EASYSCHOLAR_API_URL."
    );
  }

  return new EasyScholarJournalEnrichmentProvider({
    apiKey,
    apiUrl
  });
}

function parseEasyScholarMetric(
  payload: unknown,
  journalName: string
): {
  quartile?: string;
  impactScore?: number;
  normalized: Record<string, unknown>;
} | null {
  const root = toObject(payload);
  const candidates: Array<Record<string, unknown>> = [];

  if (root) {
    candidates.push(root);

    const dataObject = toObject(root.data);
    if (dataObject) {
      candidates.push(dataObject);
    }

    const resultObject = toObject(root.result);
    if (resultObject) {
      candidates.push(resultObject);
    }

    const journalObject = toObject(dataObject?.journal);
    if (journalObject) {
      candidates.push(journalObject);
    }

    if (Array.isArray(root.data) && root.data.length > 0) {
      const first = toObject(root.data[0]);
      if (first) {
        candidates.push(first);
      }
    }
  }

  for (const candidate of candidates) {
    const quartile = normalizeQuartile(
      candidate.quartile ??
        candidate.jcrQuartile ??
        candidate.q ??
        candidate.zone ??
        candidate.partition
    );
    const impactScore = toNumber(
      candidate.impactScore ??
        candidate.impact_factor ??
        candidate.impactFactor ??
        candidate.jif ??
        candidate.if
    );

    if (!quartile && impactScore === undefined) {
      continue;
    }

    return {
      quartile,
      impactScore,
      normalized: {
        journalName,
        matchedName: toStringValue(candidate.journalName ?? candidate.name),
        quartile,
        impactScore
      }
    };
  }

  return null;
}

function normalizeQuartile(value: unknown): string | undefined {
  const raw = toStringValue(value)?.toUpperCase().replace(/\s+/g, "");
  if (!raw) {
    return undefined;
  }

  const match = raw.match(/Q[1-4]/);
  if (!match) {
    return raw;
  }

  return match[0];
}

function toObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function toStringValue(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

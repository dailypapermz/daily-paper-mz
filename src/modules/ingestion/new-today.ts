import { endOfUtcDay, startOfUtcDay } from "../../lib/utils";
import type { DailySourceAdapterCandidate, UtcDayWindow } from "./types";

export function resolveUtcDayWindow(runDate?: string): UtcDayWindow {
  const parsed = runDate ? new Date(runDate) : new Date();
  const effectiveDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed;

  return {
    runDate: effectiveDate,
    dayStart: startOfUtcDay(effectiveDate),
    dayEnd: endOfUtcDay(effectiveDate)
  };
}

export function isCandidateInUtcDay(
  candidate: Pick<DailySourceAdapterCandidate, "publishedAt" | "indexedAt">,
  window: UtcDayWindow
): boolean {
  const reference = candidate.publishedAt ?? candidate.indexedAt;

  if (!reference) {
    return false;
  }

  return reference >= window.dayStart && reference <= window.dayEnd;
}

export function normalizeAdapterCandidate(candidate: DailySourceAdapterCandidate) {
  return {
    ...candidate,
    externalId: candidate.externalId.trim(),
    title: candidate.title?.trim() || undefined,
    abstractNote: candidate.abstractNote?.trim() || undefined,
    url: candidate.url?.trim() || undefined,
    doi: candidate.doi?.trim() || undefined,
    pmid: candidate.pmid?.trim() || undefined,
    arxivId: candidate.arxivId?.trim() || undefined,
    bioRxivId: candidate.bioRxivId?.trim() || undefined,
    journalName: candidate.journalName?.trim() || undefined,
    authors: Array.from(
      new Set(candidate.authors.map((author) => author.trim()).filter(Boolean))
    )
  };
}

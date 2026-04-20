import { describe, expect, it } from "vitest";

import {
  isCandidateInUtcDay,
  normalizeAdapterCandidate,
  resolveUtcDayWindow
} from "./new-today";

describe("ingestion new-today helpers", () => {
  it("builds UTC day window from runDate", () => {
    const window = resolveUtcDayWindow("2026-03-07T12:00:00.000Z");

    expect(window.dayStart.toISOString()).toBe("2026-03-07T00:00:00.000Z");
    expect(window.dayEnd.toISOString()).toBe("2026-03-07T23:59:59.999Z");
  });

  it("filters candidates within the run day", () => {
    const window = resolveUtcDayWindow("2026-03-07T10:00:00.000Z");

    expect(
      isCandidateInUtcDay(
        {
          publishedAt: new Date("2026-03-07T09:00:00.000Z")
        },
        window
      )
    ).toBe(true);

    expect(
      isCandidateInUtcDay(
        {
          publishedAt: new Date("2026-03-06T23:00:00.000Z")
        },
        window
      )
    ).toBe(false);
  });

  it("uses indexedAt for PubMed edat-driven candidates", () => {
    const window = resolveUtcDayWindow("2026-03-12T10:00:00.000Z");

    expect(
      isCandidateInUtcDay(
        {
          publishedAt: new Date("2026-03-13T00:00:00.000Z"),
          indexedAt: new Date("2026-03-12T17:03:00.000Z")
        },
        window,
        "pubmed"
      )
    ).toBe(true);

    expect(
      isCandidateInUtcDay(
        {
          publishedAt: new Date("2026-03-12T09:00:00.000Z"),
          indexedAt: new Date("2026-03-11T23:00:00.000Z")
        },
        window,
        "pubmed"
      )
    ).toBe(false);
  });

  it("normalizes adapter candidate fields", () => {
    const normalized = normalizeAdapterCandidate({
      externalId: "  A-1  ",
      title: "  Paper ",
      abstractNote: "  Abstract ",
      authors: ["Alice", " Alice ", "Bob"],
      sourcePayload: { ok: true }
    });

    expect(normalized.externalId).toBe("A-1");
    expect(normalized.title).toBe("Paper");
    expect(normalized.authors).toEqual(["Alice", "Bob"]);
  });
});

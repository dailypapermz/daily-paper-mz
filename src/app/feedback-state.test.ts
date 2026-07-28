import { describe, expect, it } from "vitest";

import { excludeDismissedRecommendations, latestTriageActions } from "./feedback-state";

describe("excludeDismissedRecommendations", () => {
  it("removes dismissed candidates while preserving saved, promoted, and untouched candidates", () => {
    const recommendations = [
      { candidateId: "candidate-1", rank: 1 },
      { candidateId: "candidate-2", rank: 2 },
      { candidateId: "candidate-3", rank: 3 },
      { candidateId: "candidate-4", rank: 4 }
    ];

    expect(
      excludeDismissedRecommendations(recommendations, {
        "candidate-1": "dismiss",
        "candidate-2": "save",
        "candidate-3": "promote"
      })
    ).toEqual([
      { candidateId: "candidate-2", rank: 2 },
      { candidateId: "candidate-3", rank: 3 },
      { candidateId: "candidate-4", rank: 4 }
    ]);
  });
});

describe("latestTriageActions", () => {
  it("keeps the newest triage action for each candidate from descending logs", () => {
    expect(
      latestTriageActions([
        { candidateId: "candidate-1", actionType: "dismiss" },
        { candidateId: "candidate-1", actionType: "save" },
        { candidateId: "candidate-2", actionType: "promote" }
      ])
    ).toEqual({
      "candidate-1": "dismiss",
      "candidate-2": "promote"
    });
  });

  it("ignores edits, malformed entries, and non-array payloads", () => {
    expect(
      latestTriageActions([
        { candidateId: "candidate-1", actionType: "label_edit" },
        { candidateId: "", actionType: "dismiss" },
        null,
        "invalid"
      ])
    ).toEqual({});
    expect(latestTriageActions(undefined)).toEqual({});
  });
});

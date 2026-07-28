import { describe, expect, it } from "vitest";

import { latestTriageActions } from "./feedback-state";

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

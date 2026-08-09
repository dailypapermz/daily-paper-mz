import { describe, expect, it } from "vitest";

import {
  computeNegativeFeedbackPenalty,
  MAX_NEGATIVE_FEEDBACK_PENALTY,
  parseNegativeFeedbackSignals
} from "./negative-feedback";
import type { NegativeFeedbackSignal } from "./types";

describe("computeNegativeFeedbackPenalty", () => {
  it("lightly penalizes one similar dismissed paper without excluding it", () => {
    const result = computeNegativeFeedbackPenalty({
      candidateText: "oncology single-cell tumor atlas",
      contentRecallLabel: "single-cell tumor atlas",
      signals: [signal("dismiss-1", "oncology single-cell tumor atlas", "single-cell tumor atlas")]
    });

    expect(result.penalty).toBe(0.08);
    expect(result.penalty).toBeLessThan(1);
    expect(result.contributingSignals).toBe(1);
  });

  it("strengthens repeated similar dismissals but respects the global cap", () => {
    const signals = Array.from({ length: 10 }, (_, index) =>
      signal(`dismiss-${index}`, "oncology single-cell tumor atlas", "single-cell tumor atlas")
    );

    const result = computeNegativeFeedbackPenalty({
      candidateText: "oncology single-cell tumor atlas",
      contentRecallLabel: "single-cell tumor atlas",
      signals
    });

    expect(result.contributingSignals).toBe(3);
    expect(result.penalty).toBe(MAX_NEGATIVE_FEEDBACK_PENALTY);
  });

  it("does not penalize an unrelated comparative genomics candidate", () => {
    const result = computeNegativeFeedbackPenalty({
      candidateText: "comparative genomics reveals cross-species enhancer conservation",
      contentRecallLabel: "cross-species regulatory conservation",
      signals: [signal("dismiss-1", "oncology single-cell tumor atlas", "single-cell tumor atlas")]
    });

    expect(result).toEqual({
      penalty: 0,
      maxSimilarity: 0,
      contributingSignals: 0
    });
  });
});

describe("parseNegativeFeedbackSignals", () => {
  it("reads valid signals from snapshot summary and ignores malformed entries", () => {
    const valid = signal("dismiss-1", "oncology single-cell tumor atlas", "single-cell tumor atlas");
    const parsed = parseNegativeFeedbackSignals({
      feedbackIntegration: {
        negativeFeedback: {
          signals: [valid, { paperIdentityKey: "missing-fields" }]
        }
      }
    });

    expect(parsed).toEqual([valid]);
  });
});

function signal(
  id: string,
  representationText: string,
  contentRecallLabel?: string
): NegativeFeedbackSignal {
  return {
    paperIdentityKey: `doi:10.1000/${id}`,
    sourceCandidateId: `candidate-${id}`,
    sourceFeedbackLogId: id,
    representationText,
    contentRecallLabel,
    effectiveAt: "2026-08-01T00:00:00.000Z"
  };
}

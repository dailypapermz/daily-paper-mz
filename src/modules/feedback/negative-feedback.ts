import { tokenOverlapScore } from "../ranking/text-scoring";
import type { NegativeFeedbackSignal } from "./types";

export const NEGATIVE_FEEDBACK_MODEL_VERSION = "bounded-token-overlap-v1";
export const MAX_NEGATIVE_FEEDBACK_SIGNALS = 50;
export const MAX_CONTRIBUTING_NEGATIVE_SIGNALS = 3;
export const NEGATIVE_FEEDBACK_WEIGHT_PER_SIGNAL = 0.08;
export const MAX_NEGATIVE_FEEDBACK_PENALTY = 0.18;
export const MIN_NEGATIVE_FEEDBACK_SIMILARITY = 0.08;

export type NegativeFeedbackPenalty = {
  penalty: number;
  maxSimilarity: number;
  contributingSignals: number;
};

export function computeNegativeFeedbackPenalty(input: {
  candidateText: string;
  contentRecallLabel?: string;
  signals?: NegativeFeedbackSignal[];
}): NegativeFeedbackPenalty {
  const similarities = (input.signals ?? [])
    .map((signal) => {
      const representationSimilarity = tokenOverlapScore(
        input.candidateText,
        signal.representationText
      );
      const labelSimilarity = tokenOverlapScore(
        input.contentRecallLabel ?? "",
        signal.contentRecallLabel ?? ""
      );
      return Math.max(representationSimilarity, labelSimilarity);
    })
    .filter((similarity) => similarity >= MIN_NEGATIVE_FEEDBACK_SIMILARITY)
    .sort((left, right) => right - left)
    .slice(0, MAX_CONTRIBUTING_NEGATIVE_SIGNALS);

  const rawPenalty = similarities.reduce(
    (sum, similarity) => sum + similarity * NEGATIVE_FEEDBACK_WEIGHT_PER_SIGNAL,
    0
  );

  return {
    penalty: roundScore(Math.min(MAX_NEGATIVE_FEEDBACK_PENALTY, rawPenalty)),
    maxSimilarity: roundScore(similarities[0] ?? 0),
    contributingSignals: similarities.length
  };
}

export function parseNegativeFeedbackSignals(summaryJson: unknown): NegativeFeedbackSignal[] {
  const summary = toObject(summaryJson);
  const feedbackIntegration = toObject(summary.feedbackIntegration);
  const negativeFeedback = toObject(feedbackIntegration.negativeFeedback);
  const signals = Array.isArray(negativeFeedback.signals) ? negativeFeedback.signals : [];

  return signals
    .map((entry) => parseSignal(entry))
    .filter((entry): entry is NegativeFeedbackSignal => Boolean(entry))
    .slice(0, MAX_NEGATIVE_FEEDBACK_SIGNALS);
}

function parseSignal(value: unknown): NegativeFeedbackSignal | undefined {
  const input = toObject(value);
  const paperIdentityKey = toString(input.paperIdentityKey);
  const sourceCandidateId = toString(input.sourceCandidateId);
  const sourceFeedbackLogId = toString(input.sourceFeedbackLogId);
  const representationText = toString(input.representationText);
  const effectiveAt = toString(input.effectiveAt);

  if (
    !paperIdentityKey ||
    !sourceCandidateId ||
    !sourceFeedbackLogId ||
    !representationText ||
    !effectiveAt
  ) {
    return undefined;
  }

  const researchCategory = toResearchCategory(input.researchCategory);

  return {
    paperIdentityKey,
    sourceCandidateId,
    sourceFeedbackLogId,
    representationText,
    contentRecallLabel: toString(input.contentRecallLabel),
    researchCategory,
    effectiveAt
  };
}

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function toString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function toResearchCategory(
  value: unknown
): "method" | "biology" | "resource" | "benchmark" | undefined {
  if (value === "method" || value === "biology" || value === "resource" || value === "benchmark") {
    return value;
  }
  return undefined;
}

function roundScore(value: number): number {
  return Number(value.toFixed(6));
}

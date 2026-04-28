import { tokenOverlapScore } from "./text-scoring";

const DOMAIN_TOPIC_TERMS = [
  "genomics",
  "genomic",
  "epigenomics",
  "epigenomic",
  "transcriptomics",
  "transcriptomic",
  "single-cell",
  "single cell",
  "multi-omics",
  "multiomics",
  "bioinformatics",
  "computational biology",
  "regulatory genomics",
  "gene regulation",
  "chromatin",
  "rna-seq",
  "scrna-seq",
  "atac-seq",
  "spatial transcriptomics",
  "eqtl",
  "gwas",
  "cross-species",
  "cross species",
  "comparative genomics",
  "variant pathogenicity",
  "gene expression",
  "cell atlas",
  "single-cell profiling",
  "genomic prediction"
] as const;

const GENERIC_NOISE_TERMS = [
  "literature review",
  "scoping review",
  "mri",
  "eeg",
  "imaging",
  "radiology",
  "surgical",
  "pelvimetry",
  "gait",
  "dental",
  "orthopedic",
  "diagnostic framework",
  "differential diagnosis"
] as const;

export type TopicHeuristicScore = {
  score: number;
  penalty: number;
  positiveMatches: string[];
  negativeMatches: string[];
};

export function buildPreferredTopicReference(profileTexts: string[], labels: string[]): string {
  return [...DOMAIN_TOPIC_TERMS, ...profileTexts, ...labels].join(" ");
}

export function computeTopicHeuristicScore(
  candidateText: string,
  preferredTopicReference: string
): TopicHeuristicScore {
  const normalized = normalizeForPhraseMatch(candidateText);
  const positiveMatches = DOMAIN_TOPIC_TERMS.filter((term) =>
    normalized.includes(normalizeForPhraseMatch(term))
  );
  const negativeMatches = GENERIC_NOISE_TERMS.filter((term) =>
    normalized.includes(normalizeForPhraseMatch(term))
  );

  const phraseScore = clampScore(Math.min(positiveMatches.length, 6) / 6);
  const profileOverlap = tokenOverlapScore(candidateText, preferredTopicReference);
  const score = clampScore(phraseScore * 0.6 + profileOverlap * 0.4);

  const penaltyBase =
    positiveMatches.length === 0
      ? Math.min(negativeMatches.length * 0.07, 0.2)
      : Math.min(Math.max(0, negativeMatches.length - 1) * 0.03, 0.09);

  return {
    score,
    penalty: clampScore(penaltyBase),
    positiveMatches,
    negativeMatches
  };
}

function normalizeForPhraseMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clampScore(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return Number(value.toFixed(6));
}

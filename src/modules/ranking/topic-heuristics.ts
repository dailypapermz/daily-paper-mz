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

const STRONG_DOMAIN_TOPIC_TERMS = [
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
  "cell atlas",
  "single-cell profiling",
  "genomic prediction"
] as const;

const TOPIC_FAMILIES = {
  genomics: ["genomics", "genomic"],
  epigenomics: ["epigenomics", "epigenomic"],
  transcriptomics: ["transcriptomics", "transcriptomic", "rna-seq"],
  singleCell: ["single-cell", "single cell", "scrna-seq", "cell atlas", "single-cell profiling"],
  multiOmics: ["multi-omics", "multiomics"],
  computationalBiology: ["bioinformatics", "computational biology"],
  regulatoryGenomics: ["regulatory genomics", "gene regulation", "chromatin", "atac-seq"],
  populationGenomics: ["eqtl", "gwas", "variant pathogenicity"],
  spatialTranscriptomics: ["spatial transcriptomics"],
  comparativeGenomics: ["cross-species", "cross species", "comparative genomics"],
  genomicPrediction: ["genomic prediction"]
} as const;

const ONCOLOGY_CONTEXT_TERMS = [
  "cancer",
  "cancers",
  "tumor",
  "tumors",
  "tumour",
  "tumours",
  "oncology",
  "oncological",
  "carcinoma",
  "carcinomas",
  "neoplasm",
  "neoplasms",
  "malignant",
  "malignancy"
] as const;

const GENERIC_NOISE_TERMS = [
  "literature review",
  "scoping review",
  "systematic review",
  "meta-analysis",
  "mri",
  "eeg",
  "imaging",
  "radiology",
  "surgical",
  "clinical management",
  "patient management",
  "diagnostic workflow",
  "pelvimetry",
  "gait",
  "dental",
  "orthopedic",
  "diagnostic framework",
  "differential diagnosis"
] as const;

const CLINICAL_CONTEXT_TERMS = [
  "clinical",
  "patient",
  "patients",
  "diagnosis",
  "diagnostic",
  "management",
  "workflow",
  "screening",
  "triage",
  "guideline",
  "review"
] as const;

const REVIEW_STYLE_TERMS = [
  "literature review",
  "systematic review",
  "scoping review",
  "meta-analysis",
  "meta analysis",
  "review"
] as const;

export type TopicHeuristicScore = {
  score: number;
  penalty: number;
  positiveMatches: string[];
  strongPositiveMatches: string[];
  profileSupportedMatches: string[];
  oncologyContextMatches: string[];
  negativeMatches: string[];
};

export function buildPreferredTopicReference(profileTexts: string[], labels: string[]): string {
  return [...profileTexts, ...labels].join(" ");
}

export function computeTopicHeuristicScore(
  candidateText: string,
  preferredTopicReference: string
): TopicHeuristicScore {
  const normalized = normalizeForPhraseMatch(candidateText);
  const normalizedProfile = normalizeForPhraseMatch(preferredTopicReference);
  const positiveMatches = DOMAIN_TOPIC_TERMS.filter((term) =>
    normalized.includes(normalizeForPhraseMatch(term))
  );
  const candidateStrongPositiveMatches = STRONG_DOMAIN_TOPIC_TERMS.filter((term) =>
    normalized.includes(normalizeForPhraseMatch(term))
  );
  const profileSupportedMatches = positiveMatches.filter((term) =>
    isTopicSupportedByProfile(term, normalizedProfile)
  );
  const strongPositiveMatches = candidateStrongPositiveMatches.filter((term) =>
    isTopicSupportedByProfile(term, normalizedProfile)
  );
  const negativeMatches = GENERIC_NOISE_TERMS.filter((term) =>
    normalized.includes(normalizeForPhraseMatch(term))
  );
  const clinicalContextMatches = CLINICAL_CONTEXT_TERMS.filter((term) =>
    normalized.includes(normalizeForPhraseMatch(term))
  );
  const reviewStyleMatches = REVIEW_STYLE_TERMS.filter((term) =>
    normalized.includes(normalizeForPhraseMatch(term))
  );
  const oncologyContextMatches = ONCOLOGY_CONTEXT_TERMS.filter((term) =>
    normalized.includes(normalizeForPhraseMatch(term))
  );
  const profileSupportsOncology = ONCOLOGY_CONTEXT_TERMS.some((term) =>
    normalizedProfile.includes(normalizeForPhraseMatch(term))
  );

  const phraseScore = clampScore(Math.min(positiveMatches.length, 6) / 6);
  const strongAnchorScore = clampScore(Math.min(strongPositiveMatches.length, 4) / 4);
  const profileOverlap = tokenOverlapScore(candidateText, preferredTopicReference);
  const gatedProfileOverlap =
    strongPositiveMatches.length > 0 ? profileOverlap : Math.min(profileOverlap, 0.12);
  const score = clampScore(
    strongAnchorScore * 0.55 + phraseScore * 0.2 + gatedProfileOverlap * 0.25
  );

  const hasProfileSupportedTopic = profileSupportedMatches.length > 0;
  const penaltyBase =
    !hasProfileSupportedTopic
      ? Math.min(negativeMatches.length * 0.07, 0.2)
      : Math.min(Math.max(0, negativeMatches.length - 1) * 0.03, 0.09);

  const clinicalPenalty =
    !hasProfileSupportedTopic && clinicalContextMatches.length >= 2
      ? Math.min(0.12 + (clinicalContextMatches.length - 2) * 0.02, 0.2)
      : 0;
  const reviewPenalty =
    !hasProfileSupportedTopic && reviewStyleMatches.length > 0
      ? Math.min(0.08 + Math.max(0, reviewStyleMatches.length - 1) * 0.02, 0.12)
      : 0;
  const oncologyPenalty = computeOncologyPenalty({
    oncologyContextMatches,
    profileSupportsOncology,
    hasProfileSupportedTopic
  });

  return {
    score,
    penalty: clampScore(penaltyBase + clinicalPenalty + reviewPenalty + oncologyPenalty),
    positiveMatches,
    strongPositiveMatches,
    profileSupportedMatches,
    oncologyContextMatches,
    negativeMatches: [
      ...new Set([
        ...negativeMatches,
        ...clinicalContextMatches,
        ...reviewStyleMatches,
        ...oncologyContextMatches
      ])
    ]
  };
}

function isTopicSupportedByProfile(term: string, normalizedProfile: string): boolean {
  if (!normalizedProfile) {
    return false;
  }

  const family = Object.values(TOPIC_FAMILIES).find((terms) =>
    terms.some((familyTerm) => normalizeForPhraseMatch(familyTerm) === normalizeForPhraseMatch(term))
  );
  const supportTerms = family ?? [term];
  return supportTerms.some((supportTerm) =>
    normalizedProfile.includes(normalizeForPhraseMatch(supportTerm))
  );
}

function computeOncologyPenalty(input: {
  oncologyContextMatches: readonly string[];
  profileSupportsOncology: boolean;
  hasProfileSupportedTopic: boolean;
}) {
  if (input.oncologyContextMatches.length === 0 || input.profileSupportsOncology) {
    return 0;
  }

  if (input.hasProfileSupportedTopic) {
    return Math.min(0.04 + Math.max(0, input.oncologyContextMatches.length - 1) * 0.01, 0.07);
  }

  return Math.min(0.1 + Math.max(0, input.oncologyContextMatches.length - 1) * 0.02, 0.16);
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

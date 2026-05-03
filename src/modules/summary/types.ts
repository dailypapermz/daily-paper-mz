import type { ResearchTypeCategoryValue } from "../tagging/types";

export type CandidateContentProvenanceValue = "generated" | "user_corrected";

export type CandidateSummaryFields = {
  researchQuestion: string;
  method: string;
  mainFinding: string;
  relevanceToUser: string;
};

export type CandidateStructuredLabels = {
  contentRecallLabel?: string;
  researchType?: {
    category?: ResearchTypeCategoryValue;
    primaryKeyword?: string;
    secondaryKeyword?: string;
    rawText?: string;
  };
};

export type CandidateOutputRecord = {
  candidateId: string;
  runId: string;
  canonicalKey: string;
  title?: string;
  summary?: CandidateSummaryFields & {
    provenance: CandidateContentProvenanceValue;
    provider: string;
  };
  labels: {
    contentRecall?: {
      label: string;
      provenance: CandidateContentProvenanceValue;
      provider: string;
    };
    researchType?: {
      category?: ResearchTypeCategoryValue;
      primaryKeyword?: string;
      secondaryKeyword?: string;
      rawText?: string;
      provenance: CandidateContentProvenanceValue;
      provider: string;
    };
  };
};

export type CandidateGenerationInputRecord = {
  candidateId: string;
  runId: string;
  canonicalKey: string;
  title?: string;
  abstractNote?: string;
  journalName?: string;
  doi?: string;
  sourceProvenance: Array<{
    source: "biorxiv" | "arxiv" | "pubmed" | "journal";
    externalId: string;
  }>;
};

export type CandidateGeneratedOutput = {
  summary: CandidateSummaryFields;
  labels: CandidateStructuredLabels;
};

export type CandidateOutputGenerationResult = {
  runId: string;
  provider: string;
  requested: number;
  generated: number;
  failed: number;
  outputs: CandidateOutputRecord[];
};

export interface CandidateOutputProvider {
  name: string;
  generateOutput(input: CandidateGenerationInputRecord): Promise<CandidateGeneratedOutput>;
}

export interface CandidateOutputRepository {
  listCandidatesForGeneration(input: {
    runId: string;
    limit: number;
    selectedOnly?: boolean;
  }): Promise<CandidateGenerationInputRecord[]>;
  saveGeneratedOutput(input: {
    candidateId: string;
    provider: string;
    output: CandidateGeneratedOutput;
  }): Promise<void>;
  saveUserCorrectedOutput(input: {
    candidateId: string;
    provider: string;
    summary?: CandidateSummaryFields;
    labels?: CandidateStructuredLabels;
  }): Promise<void>;
  listRunOutputs(runId: string): Promise<CandidateOutputRecord[]>;
  listRunOutputsByCandidateId(candidateId: string): Promise<CandidateOutputRecord[]>;
}

export interface CandidateOutputService {
  generateForRun(input: {
    runId: string;
    limit?: number;
    selectedOnly?: boolean;
  }): Promise<CandidateOutputGenerationResult>;
  listRunOutputs(runId: string): Promise<CandidateOutputRecord[]>;
  getCandidateOutput(candidateId: string): Promise<CandidateOutputRecord | null>;
  updateCandidateOutput(input: {
    candidateId: string;
    summary?: CandidateSummaryFields;
    labels?: CandidateStructuredLabels;
  }): Promise<CandidateOutputRecord | null>;
}

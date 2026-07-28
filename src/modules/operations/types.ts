export const OPERATIONS_STAGE_ORDER = [
  "ingestion",
  "enrichment",
  "normalization",
  "representation",
  "recall",
  "rerank",
  "summary"
] as const;

export type OperationsStageName = (typeof OPERATIONS_STAGE_ORDER)[number];
export type OperationsRunStatus =
  | "running"
  | "complete"
  | "complete_with_warnings"
  | "partial"
  | "failed"
  | "unknown";

export type OperationsStageStatus =
  | "pending"
  | "running"
  | "success"
  | "partial"
  | "failed"
  | "skipped"
  | "unknown";

export type OperationsStage = {
  stage: OperationsStageName;
  status: OperationsStageStatus;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  details?: Record<string, unknown>;
};

export type OperationsSourceDegradation = {
  degraded: boolean;
  sources: Array<{
    source: "biorxiv" | "arxiv" | "pubmed" | "journal";
    status: "success" | "failed" | "unknown";
    error?: string;
  }>;
};

/** Public, frozen Operations projection. Request keys never leave the service. */
export type OperationsRun = {
  runDate: string;
  runId: string;
  attempt: number;
  status: OperationsRunStatus;
  stages: OperationsStage[];
  sourceDegradation: OperationsSourceDegradation;
  startedAt: string;
  finishedAt?: string;
  errorSummary?: string;
  retryable: boolean;
};

export type OperationsRunRecord = {
  runDate: Date;
  runId: string;
  requestKey?: string;
  attempt: number;
  ingestionStatus: "running" | "success" | "failed" | "unknown";
  pipelineStatus: OperationsRunStatus;
  startedAt: Date;
  updatedAt: Date;
  pipelineStartedAt?: Date;
  finishedAt?: Date;
  pipelineFinishedAt?: Date;
  errorMessage?: string;
  stages: Array<{
    stage: OperationsStageName;
    status: OperationsStageStatus;
    startedAt?: Date;
    finishedAt?: Date;
    errorMessage?: string;
    details?: Record<string, unknown>;
  }>;
};

export interface OperationsRepository {
  listRecentAggregatedRuns(limit: number): Promise<OperationsRunRecord[]>;
  getAggregatedRun(runId: string): Promise<OperationsRunRecord | null>;
}

export interface OperationsDispatcher {
  dispatchDaily(input: { runDate: string }): Promise<void>;
}

export type OperationsAccessVerifier = (
  request: Request
) => Promise<{ ok: true } | { ok: false; code: string }>;

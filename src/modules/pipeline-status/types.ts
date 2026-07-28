export type DailyPipelineStageValue =
  | "ingestion"
  | "enrichment"
  | "normalization"
  | "representation"
  | "recall"
  | "rerank"
  | "summary";

export type DailyPipelineStageStatusValue =
  | "pending"
  | "running"
  | "success"
  | "partial"
  | "failed"
  | "skipped";

export type DailyPipelineStageRecord = {
  stage: DailyPipelineStageValue;
  status: DailyPipelineStageStatusValue;
  startedAt?: string;
  finishedAt?: string;
  errorMessage?: string;
  details?: Record<string, unknown>;
};

export interface PipelineStageRepository {
  initialize(input: {
    runId: string;
    attempt: number;
    ingestionStatus: "success" | "partial";
    ingestionDetails: Record<string, unknown>;
  }): Promise<void>;
  start(input: { runId: string; attempt: number; stage: DailyPipelineStageValue }): Promise<void>;
  complete(input: {
    runId: string;
    attempt: number;
    stage: DailyPipelineStageValue;
    status?: "success" | "partial";
    details?: Record<string, unknown>;
  }): Promise<void>;
  fail(input: { runId: string; attempt: number; stage: DailyPipelineStageValue; errorMessage: string }): Promise<void>;
  list(runId: string): Promise<DailyPipelineStageRecord[]>;
  listRecentIngestionDetails(limit: number): Promise<Record<string, unknown>[]>;
}

export interface PipelineStageService extends PipelineStageRepository {}

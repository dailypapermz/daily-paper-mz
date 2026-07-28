import {
  OPERATIONS_STAGE_ORDER,
  type OperationsRepository,
  type OperationsRun,
  type OperationsRunRecord,
  type OperationsSourceDegradation
} from "./types";
import { sanitizeOperationsDetails, sanitizeOperationsError } from "./sanitize";

export const OPERATIONS_DEFAULT_LIMIT = 10;
export const OPERATIONS_MAX_LIMIT = 30;
export const OPERATIONS_PIPELINE_STALE_AFTER_MS = 180 * 60 * 1000;
const EXPECTED_SOURCES = "arxiv+biorxiv+journal+pubmed";

export class OperationsError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = "OperationsError";
  }
}

export class OperationsService {
  private readonly now: () => Date;
  private readonly pipelineStaleAfterMs: number;

  constructor(
    private readonly repository: OperationsRepository,
    options?: { now?: () => Date; pipelineStaleAfterMs?: number }
  ) {
    this.now = options?.now ?? (() => new Date());
    this.pipelineStaleAfterMs = options?.pipelineStaleAfterMs ?? OPERATIONS_PIPELINE_STALE_AFTER_MS;
  }

  async listRecentRuns(limit = OPERATIONS_DEFAULT_LIMIT): Promise<OperationsRun[]> {
    const boundedLimit = Math.max(1, Math.min(Math.trunc(limit), OPERATIONS_MAX_LIMIT));
    const rows = await this.repository.listRecentAggregatedRuns(boundedLimit);
    return rows.map((row) => projectRun(row, this.now(), this.pipelineStaleAfterMs));
  }

  async getRun(runId: string): Promise<OperationsRun | null> {
    const row = await this.repository.getAggregatedRun(runId);
    return row ? projectRun(row, this.now(), this.pipelineStaleAfterMs) : null;
  }

  async getRetryDispatch(runId: string): Promise<{ runDate: string }> {
    const row = await this.repository.getAggregatedRun(runId);
    if (!row) throw new OperationsError("RUN_NOT_FOUND", "The requested run was not found.", 404);
    const run = projectRun(row, this.now(), this.pipelineStaleAfterMs);
    if (run.status === "running" && !run.retryable) {
      throw new OperationsError("RUN_ALREADY_RUNNING", "A running operation cannot be retried.", 409);
    }
    if (run.status === "complete" || run.status === "complete_with_warnings") {
      throw new OperationsError("RUN_ALREADY_COMPLETE", "A completed operation cannot be retried.", 409);
    }
    if (!run.retryable) {
      throw new OperationsError("RUN_NOT_RETRYABLE", "This operation is not eligible for retry.", 409);
    }

    const expectedRequestKey = `daily:v1:aggregated:${EXPECTED_SOURCES}:${run.runDate}`;
    if (row.requestKey !== expectedRequestKey) {
      throw new OperationsError(
        "RUN_IDEMPOTENCY_MISMATCH",
        "The stored run cannot be safely matched to the fixed daily workflow.",
        409
      );
    }
    return { runDate: run.runDate };
  }
}

function projectRun(
  row: OperationsRunRecord,
  now: Date,
  pipelineStaleAfterMs: number
): OperationsRun {
  const stages = OPERATIONS_STAGE_ORDER.flatMap((stage) => {
    const stored = row.stages.find((entry) => entry.stage === stage);
    if (!stored) return [];
    const error = sanitizeOperationsError(stored.errorMessage);
    const details = sanitizeOperationsDetails(stored.details);
    return [{
      stage,
      status: stored.status,
      ...(stored.startedAt ? { startedAt: stored.startedAt.toISOString() } : {}),
      ...(stored.finishedAt ? { finishedAt: stored.finishedAt.toISOString() } : {}),
      ...(error ? { error } : {}),
      ...(details ? { details } : {})
    }];
  });
  const status = deriveStatus(row);
  const finishedAt = row.pipelineFinishedAt ?? row.finishedAt;
  const stageError = stages.find((stage) => stage.error)?.error;
  const errorSummary = sanitizeOperationsError(row.errorMessage) ?? stageError;
  return {
    runDate: row.runDate.toISOString().slice(0, 10),
    runId: row.runId,
    attempt: Math.max(1, row.attempt),
    status,
    stages,
    sourceDegradation: deriveSourceDegradation(row),
    startedAt: row.startedAt.toISOString(),
    ...(finishedAt ? { finishedAt: finishedAt.toISOString() } : {}),
    ...(errorSummary ? { errorSummary } : {}),
    retryable: isRetryable(status, stages, row, now, pipelineStaleAfterMs)
  };
}

function deriveStatus(row: OperationsRunRecord): OperationsRun["status"] {
  if (row.pipelineStatus !== "unknown") return row.pipelineStatus;
  if (row.ingestionStatus === "running") return "running";
  if (row.ingestionStatus === "failed") return "failed";
  return "unknown";
}

function isRetryable(
  status: OperationsRun["status"],
  stages: OperationsRun["stages"],
  row: OperationsRunRecord,
  now: Date,
  pipelineStaleAfterMs: number
): boolean {
  if (status === "running") {
    const lastHeartbeat = row.pipelineStartedAt ?? row.startedAt;
    return lastHeartbeat.getTime() <= now.getTime() - pipelineStaleAfterMs;
  }
  if (status !== "failed" && status !== "partial") return false;
  return stages.length === 0 || stages.some((stage) =>
    stage.status === "failed" ||
    (stage.status === "partial" && stage.stage !== "ingestion" && stage.stage !== "enrichment")
  );
}

function deriveSourceDegradation(row: OperationsRunRecord): OperationsSourceDegradation {
  const rawSources = row.stages.find((stage) => stage.stage === "ingestion")?.details?.sources;
  if (!Array.isArray(rawSources)) return { degraded: row.ingestionStatus === "failed", sources: [] };
  const allowed = new Set(["biorxiv", "arxiv", "pubmed", "journal"]);
  const sources = rawSources.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const source = (entry as Record<string, unknown>).source;
    if (typeof source !== "string" || !allowed.has(source)) return [];
    const rawStatus = (entry as Record<string, unknown>).status;
    const status: "success" | "failed" | "unknown" =
      rawStatus === "success" || rawStatus === "failed" ? rawStatus : "unknown";
    const error = sanitizeOperationsError((entry as Record<string, unknown>).errorMessage);
    return [{
      source: source as "biorxiv" | "arxiv" | "pubmed" | "journal",
      status,
      ...(error ? { error } : {})
    }];
  });
  return { degraded: sources.some((source) => source.status === "failed"), sources };
}

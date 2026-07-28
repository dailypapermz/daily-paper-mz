import type { Prisma, PrismaClient } from "../../generated/prisma";
import type {
  OperationsRepository,
  OperationsRunRecord,
  OperationsRunStatus,
  OperationsStageName,
  OperationsStageStatus
} from "../../modules/operations/types";

const HARD_MAX_RECENT_RUNS = 30;

export class PrismaOperationsRepository implements OperationsRepository {
  constructor(private readonly db: PrismaClient) {}

  async listRecentAggregatedRuns(limit: number): Promise<OperationsRunRecord[]> {
    const rows = await this.db.dailyIngestionRun.findMany({
      where: { source: "AGGREGATED" },
      orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
      take: Math.max(1, Math.min(Math.trunc(limit), HARD_MAX_RECENT_RUNS)),
      include: { pipelineStages: true }
    });
    return rows.map(mapRun);
  }

  async getAggregatedRun(runId: string): Promise<OperationsRunRecord | null> {
    const row = await this.db.dailyIngestionRun.findFirst({
      where: { id: runId, source: "AGGREGATED" },
      include: { pipelineStages: true }
    });
    return row ? mapRun(row) : null;
  }
}

function mapRun(row: {
  id: string;
  requestKey: string | null;
  attempt: number;
  status: "RUNNING" | "SUCCESS" | "FAILED";
  pipelineStatus: "RUNNING" | "COMPLETE" | "COMPLETE_WITH_WARNINGS" | "PARTIAL" | "FAILED" | null;
  runDate: Date;
  startedAt: Date;
  updatedAt: Date;
  pipelineStartedAt: Date | null;
  finishedAt: Date | null;
  pipelineFinishedAt: Date | null;
  errorMessage: string | null;
  pipelineStages: Array<{
    stage: string;
    status: string;
    startedAt: Date | null;
    finishedAt: Date | null;
    errorMessage: string | null;
    detailsJson: Prisma.JsonValue | null;
  }>;
}): OperationsRunRecord {
  return {
    runId: row.id,
    requestKey: row.requestKey ?? undefined,
    attempt: row.attempt,
    ingestionStatus: mapIngestionStatus(row.status),
    pipelineStatus: mapPipelineStatus(row.pipelineStatus),
    runDate: row.runDate,
    startedAt: row.startedAt,
    updatedAt: row.updatedAt,
    pipelineStartedAt: row.pipelineStartedAt ?? undefined,
    finishedAt: row.finishedAt ?? undefined,
    pipelineFinishedAt: row.pipelineFinishedAt ?? undefined,
    errorMessage: row.errorMessage ?? undefined,
    stages: row.pipelineStages.map((stage) => ({
      stage: stage.stage.toLowerCase() as OperationsStageName,
      status: mapStageStatus(stage.status),
      startedAt: stage.startedAt ?? undefined,
      finishedAt: stage.finishedAt ?? undefined,
      errorMessage: stage.errorMessage ?? undefined,
      details: toObject(stage.detailsJson)
    }))
  };
}

function mapIngestionStatus(status: string): OperationsRunRecord["ingestionStatus"] {
  if (status === "RUNNING") return "running";
  if (status === "SUCCESS") return "success";
  if (status === "FAILED") return "failed";
  return "unknown";
}

function mapPipelineStatus(status: string | null): OperationsRunStatus {
  const normalized = status?.toLowerCase();
  return normalized === "running" || normalized === "complete" ||
    normalized === "complete_with_warnings" || normalized === "partial" || normalized === "failed"
    ? normalized
    : "unknown";
}

function mapStageStatus(status: string): OperationsStageStatus {
  const normalized = status.toLowerCase();
  return normalized === "pending" || normalized === "running" || normalized === "success" ||
    normalized === "partial" || normalized === "failed" || normalized === "skipped"
    ? normalized
    : "unknown";
}

function toObject(value: Prisma.JsonValue | null): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

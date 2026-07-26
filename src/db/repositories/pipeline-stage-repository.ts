import { Prisma, type PrismaClient } from "../../generated/prisma";
import { STAGE_ORDER } from "../../modules/pipeline-status/pipeline-stage.service";
import type {
  DailyPipelineStageValue,
  PipelineStageRepository
} from "../../modules/pipeline-status/types";

export class PrismaPipelineStageRepository implements PipelineStageRepository {
  constructor(private readonly db: PrismaClient) {}

  async initialize(input: {
    runId: string;
    ingestionStatus: "success" | "partial";
    ingestionDetails: Record<string, unknown>;
  }) {
    await this.db.$transaction(async (tx) => {
      await tx.dailyPipelineStageRun.deleteMany({ where: { runId: input.runId } });
      await tx.dailyPipelineStageRun.createMany({
        data: STAGE_ORDER.map((stage) => ({
          runId: input.runId,
          stage: toDbStage(stage),
          status: stage === "ingestion" ? toDbStatus(input.ingestionStatus) : "PENDING",
          startedAt: stage === "ingestion" ? new Date() : null,
          finishedAt: stage === "ingestion" ? new Date() : null,
          detailsJson:
            stage === "ingestion"
              ? (input.ingestionDetails as Prisma.InputJsonValue)
              : Prisma.JsonNull
        }))
      });
    });
  }

  async start(runId: string, stage: DailyPipelineStageValue) {
    await this.db.dailyPipelineStageRun.update({
      where: { runId_stage: { runId, stage: toDbStage(stage) } },
      data: { status: "RUNNING", startedAt: new Date(), finishedAt: null, errorMessage: null }
    });
  }

  async complete(input: {
    runId: string;
    stage: DailyPipelineStageValue;
    status?: "success" | "partial";
    details?: Record<string, unknown>;
  }) {
    await this.db.dailyPipelineStageRun.update({
      where: { runId_stage: { runId: input.runId, stage: toDbStage(input.stage) } },
      data: {
        status: toDbStatus(input.status ?? "success"),
        finishedAt: new Date(),
        detailsJson: input.details
          ? (input.details as Prisma.InputJsonValue)
          : Prisma.JsonNull
      }
    });
  }

  async fail(input: { runId: string; stage: DailyPipelineStageValue; errorMessage: string }) {
    const failedIndex = STAGE_ORDER.indexOf(input.stage);
    await this.db.$transaction([
      this.db.dailyPipelineStageRun.update({
        where: { runId_stage: { runId: input.runId, stage: toDbStage(input.stage) } },
        data: { status: "FAILED", finishedAt: new Date(), errorMessage: input.errorMessage }
      }),
      this.db.dailyPipelineStageRun.updateMany({
        where: {
          runId: input.runId,
          stage: { in: STAGE_ORDER.slice(failedIndex + 1).map(toDbStage) },
          status: "PENDING"
        },
        data: { status: "SKIPPED", finishedAt: new Date() }
      })
    ]);
  }

  async list(runId: string) {
    const rows = await this.db.dailyPipelineStageRun.findMany({
      where: { runId },
      orderBy: { createdAt: "asc" }
    });
    const byStage = new Map(rows.map((row) => [fromDbStage(row.stage), row]));
    return STAGE_ORDER.flatMap((stage) => {
      const row = byStage.get(stage);
      return row
        ? [{
            stage,
            status: row.status.toLowerCase() as "pending" | "running" | "success" | "partial" | "failed" | "skipped",
            startedAt: row.startedAt?.toISOString(),
            finishedAt: row.finishedAt?.toISOString(),
            errorMessage: row.errorMessage ?? undefined,
            details: toObject(row.detailsJson)
          }]
        : [];
    });
  }

  async listRecentIngestionDetails(limit: number) {
    const rows = await this.db.dailyPipelineStageRun.findMany({
      where: { stage: "INGESTION" },
      orderBy: [{ createdAt: "desc" }],
      take: Math.max(1, Math.min(limit, 30)),
      select: { detailsJson: true }
    });
    return rows.flatMap((row) => {
      const details = toObject(row.detailsJson);
      return details ? [details] : [];
    });
  }
}

function toDbStage(stage: DailyPipelineStageValue) {
  return stage.toUpperCase() as "INGESTION" | "ENRICHMENT" | "NORMALIZATION" | "REPRESENTATION" | "RECALL" | "RERANK" | "SUMMARY";
}

function fromDbStage(stage: ReturnType<typeof toDbStage>) {
  return stage.toLowerCase() as DailyPipelineStageValue;
}

function toDbStatus(status: "success" | "partial") {
  return status === "partial" ? "PARTIAL" as const : "SUCCESS" as const;
}

function toObject(value: Prisma.JsonValue | null): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

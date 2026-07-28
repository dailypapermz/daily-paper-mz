import type { Prisma, PrismaClient } from "../../generated/prisma";
import { prismaJsonNull } from "../prisma/application-json";
import { STAGE_ORDER } from "../../modules/pipeline-status/pipeline-stage.service";
import type {
  DailyPipelineStageValue,
  PipelineStageRepository
} from "../../modules/pipeline-status/types";

export class PrismaPipelineStageRepository implements PipelineStageRepository {
  constructor(private readonly db: PrismaClient) {}

  async initialize(input: {
    runId: string;
    attempt: number;
    ingestionStatus: "success" | "partial";
    ingestionDetails: Record<string, unknown>;
  }) {
    await this.db.$transaction(async (tx) => {
      const now = new Date();
      await assertPipelineOwner(tx, input.runId, input.attempt, now);
      for (const stage of STAGE_ORDER) {
        const isIngestion = stage === "ingestion";
        await tx.dailyPipelineStageRun.upsert({
          where: { runId_stage: { runId: input.runId, stage: toDbStage(stage) } },
          create: {
            runId: input.runId,
            stage: toDbStage(stage),
            status: isIngestion ? toDbStatus(input.ingestionStatus) : "PENDING",
            startedAt: isIngestion ? now : null,
            finishedAt: isIngestion ? now : null,
            detailsJson: isIngestion
              ? (input.ingestionDetails as Prisma.InputJsonValue)
              : prismaJsonNull
          },
          update: isIngestion
            ? {
                status: toDbStatus(input.ingestionStatus),
                startedAt: now,
                finishedAt: now,
                errorMessage: null,
                detailsJson: input.ingestionDetails as Prisma.InputJsonValue
              }
            : {}
        });
      }
    });
  }

  async start(input: { runId: string; attempt: number; stage: DailyPipelineStageValue }) {
    const now = new Date();
    await this.db.$transaction(async (tx) => {
      await assertPipelineOwner(tx, input.runId, input.attempt, now);
      const stage = await tx.dailyPipelineStageRun.updateMany({
        where: { runId: input.runId, stage: toDbStage(input.stage) },
        data: { status: "RUNNING", startedAt: now, finishedAt: null, errorMessage: null }
      });
      if (stage.count !== 1) throw pipelineLeaseLost();
    });
  }

  async complete(input: {
    runId: string;
    attempt: number;
    stage: DailyPipelineStageValue;
    status?: "success" | "partial";
    details?: Record<string, unknown>;
  }) {
    const now = new Date();
    await this.db.$transaction(async (tx) => {
      await assertPipelineOwner(tx, input.runId, input.attempt, now);
      const stage = await tx.dailyPipelineStageRun.updateMany({
        where: { runId: input.runId, stage: toDbStage(input.stage), status: "RUNNING" },
        data: {
          status: toDbStatus(input.status ?? "success"),
          finishedAt: now,
          detailsJson: input.details
            ? (input.details as Prisma.InputJsonValue)
            : prismaJsonNull
        }
      });
      if (stage.count !== 1) throw pipelineLeaseLost();
    });
  }

  async fail(input: { runId: string; attempt: number; stage: DailyPipelineStageValue; errorMessage: string }) {
    const failedIndex = STAGE_ORDER.indexOf(input.stage);
    const now = new Date();
    await this.db.$transaction(async (tx) => {
      await assertPipelineOwner(tx, input.runId, input.attempt, now);
      const stage = await tx.dailyPipelineStageRun.updateMany({
        where: { runId: input.runId, stage: toDbStage(input.stage) },
        data: { status: "FAILED", finishedAt: new Date(), errorMessage: input.errorMessage }
      });
      if (stage.count !== 1) throw pipelineLeaseLost();
      await tx.dailyPipelineStageRun.updateMany({
        where: {
          runId: input.runId,
          stage: { in: STAGE_ORDER.slice(failedIndex + 1).map(toDbStage) }
        },
        data: { status: "SKIPPED", finishedAt: now }
      });
    });
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

async function assertPipelineOwner(
  tx: Pick<PrismaClient, "dailyIngestionRun">,
  runId: string,
  attempt: number,
  heartbeatAt: Date
) {
  const owner = await tx.dailyIngestionRun.updateMany({
    where: { id: runId, status: "SUCCESS", pipelineStatus: "RUNNING", attempt },
    data: { pipelineStartedAt: heartbeatAt }
  });
  if (owner.count !== 1) throw pipelineLeaseLost();
}

function pipelineLeaseLost() {
  return new Error("Daily pipeline lease was lost before the stage update.");
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

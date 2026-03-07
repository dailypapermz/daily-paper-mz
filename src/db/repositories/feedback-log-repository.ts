import { Prisma, type PrismaClient } from "../../generated/prisma";
import type { FeedbackLogRecord, FeedbackLogRepository, FeedbackActionValue } from "../../modules/feedback/types";

export class PrismaFeedbackLogRepository implements FeedbackLogRepository {
  constructor(private readonly db: PrismaClient) {}

  async appendLog(input: {
    runId: string;
    candidateId: string;
    actionType: FeedbackActionValue;
    oldValue?: Record<string, unknown>;
    newValue?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Promise<FeedbackLogRecord> {
    const row = await this.db.candidateFeedbackLog.create({
      data: {
        runId: input.runId,
        candidateId: input.candidateId,
        actionType: toDbAction(input.actionType),
        oldValueJson: toJson(input.oldValue),
        newValueJson: toJson(input.newValue),
        metadataJson: toJson(input.metadata)
      }
    });

    return mapFeedbackLog(row);
  }

  async listLogs(input?: {
    runId?: string;
    candidateId?: string;
    limit?: number;
  }): Promise<FeedbackLogRecord[]> {
    const rows = await this.db.candidateFeedbackLog.findMany({
      where: {
        ...(input?.runId ? { runId: input.runId } : {}),
        ...(input?.candidateId ? { candidateId: input.candidateId } : {})
      },
      orderBy: [{ createdAt: "desc" }],
      take: input?.limit ?? 100
    });

    return rows.map((row) => mapFeedbackLog(row));
  }
}

function mapFeedbackLog(row: {
  id: string;
  runId: string;
  candidateId: string;
  actionType: "SAVE" | "DISMISS" | "PROMOTE" | "LABEL_EDIT" | "SUMMARY_EDIT";
  oldValueJson: Prisma.JsonValue | null;
  newValueJson: Prisma.JsonValue | null;
  metadataJson: Prisma.JsonValue | null;
  createdAt: Date;
}): FeedbackLogRecord {
  return {
    id: row.id,
    runId: row.runId,
    candidateId: row.candidateId,
    actionType: fromDbAction(row.actionType),
    oldValue: toObject(row.oldValueJson),
    newValue: toObject(row.newValueJson),
    metadata: toObject(row.metadataJson),
    createdAt: row.createdAt.toISOString()
  };
}

function toDbAction(value: FeedbackActionValue) {
  if (value === "save") {
    return "SAVE";
  }
  if (value === "dismiss") {
    return "DISMISS";
  }
  if (value === "promote") {
    return "PROMOTE";
  }
  if (value === "label_edit") {
    return "LABEL_EDIT";
  }
  return "SUMMARY_EDIT";
}

function fromDbAction(value: "SAVE" | "DISMISS" | "PROMOTE" | "LABEL_EDIT" | "SUMMARY_EDIT") {
  if (value === "SAVE") {
    return "save";
  }
  if (value === "DISMISS") {
    return "dismiss";
  }
  if (value === "PROMOTE") {
    return "promote";
  }
  if (value === "LABEL_EDIT") {
    return "label_edit";
  }
  return "summary_edit";
}

function toJson(value?: Record<string, unknown>): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (!value) {
    return Prisma.JsonNull;
  }
  return value as Prisma.InputJsonValue;
}

function toObject(value: Prisma.JsonValue | null): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

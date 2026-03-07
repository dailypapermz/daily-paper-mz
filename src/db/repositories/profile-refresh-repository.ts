import type { PrismaClient } from "../../generated/prisma";
import { toIsoDate } from "../../lib/utils";
import type {
  ProfileRefreshJobSummary,
  ProfileRefreshRepository,
  ProfileReminderCheckSummary
} from "../../modules/profile-build/types";

export class PrismaProfileRefreshRepository implements ProfileRefreshRepository {
  constructor(private readonly db: PrismaClient) {}

  async createRefreshJob(input: { trigger: "initial" | "manual" | "scheduled" }) {
    const job = await this.db.profileRefreshJob.create({
      data: {
        trigger: toDbTrigger(input.trigger),
        status: "RUNNING"
      },
      select: {
        id: true
      }
    });

    return { id: job.id };
  }

  async markRefreshJobSucceeded(input: { jobId: string; snapshotId: string }) {
    const job = await this.db.profileRefreshJob.update({
      where: { id: input.jobId },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        snapshotId: input.snapshotId,
        errorMessage: null
      }
    });

    return mapRefreshJobSummary(job);
  }

  async markRefreshJobFailed(input: { jobId: string; errorMessage: string }) {
    const job = await this.db.profileRefreshJob.update({
      where: { id: input.jobId },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        errorMessage: input.errorMessage
      }
    });

    return mapRefreshJobSummary(job);
  }

  async getLatestRefreshJob(): Promise<ProfileRefreshJobSummary | null> {
    const job = await this.db.profileRefreshJob.findFirst({
      orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }]
    });

    if (!job) {
      return null;
    }

    return mapRefreshJobSummary(job);
  }

  async recordReminderCheck(input: { isDue: boolean; lastRefreshAt?: Date }) {
    const reminder = await this.db.profileReminderCheck.create({
      data: {
        isDue: input.isDue,
        lastRefreshAt: input.lastRefreshAt ?? null
      }
    });

    return mapReminderSummary(reminder);
  }

  async getLatestReminderCheck(): Promise<ProfileReminderCheckSummary | null> {
    const reminder = await this.db.profileReminderCheck.findFirst({
      orderBy: [{ checkedAt: "desc" }, { createdAt: "desc" }]
    });

    if (!reminder) {
      return null;
    }

    return mapReminderSummary(reminder);
  }
}

function toDbTrigger(value: "initial" | "manual" | "scheduled") {
  if (value === "initial") {
    return "INITIAL";
  }
  if (value === "scheduled") {
    return "SCHEDULED";
  }
  return "MANUAL";
}

function fromDbTrigger(value: "INITIAL" | "MANUAL" | "SCHEDULED") {
  if (value === "INITIAL") {
    return "initial";
  }
  if (value === "SCHEDULED") {
    return "scheduled";
  }
  return "manual";
}

function fromDbStatus(value: "RUNNING" | "SUCCESS" | "FAILED") {
  if (value === "RUNNING") {
    return "running";
  }
  if (value === "SUCCESS") {
    return "success";
  }
  return "failed";
}

function mapRefreshJobSummary(job: {
  id: string;
  trigger: "INITIAL" | "MANUAL" | "SCHEDULED";
  status: "RUNNING" | "SUCCESS" | "FAILED";
  startedAt: Date;
  finishedAt: Date | null;
  snapshotId: string | null;
  errorMessage: string | null;
}): ProfileRefreshJobSummary {
  return {
    id: job.id,
    trigger: fromDbTrigger(job.trigger),
    status: fromDbStatus(job.status),
    startedAt: toIsoDate(job.startedAt),
    finishedAt: job.finishedAt ? toIsoDate(job.finishedAt) : undefined,
    snapshotId: job.snapshotId ?? undefined,
    errorMessage: job.errorMessage ?? undefined
  };
}

function mapReminderSummary(reminder: {
  id: string;
  checkedAt: Date;
  lastRefreshAt: Date | null;
  isDue: boolean;
}): ProfileReminderCheckSummary {
  return {
    id: reminder.id,
    checkedAt: toIsoDate(reminder.checkedAt),
    lastRefreshAt: reminder.lastRefreshAt ? toIsoDate(reminder.lastRefreshAt) : undefined,
    isDue: reminder.isDue
  };
}

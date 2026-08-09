import { describe, expect, it } from "vitest";

import { AppError } from "../../lib/errors";
import { DefaultProfileRefreshService } from "./profile-refresh.service";
import type {
  ProfileBuildService,
  ProfileRefreshRepository,
  ProfileSnapshotSummary
} from "./types";

class FakeBuildService implements ProfileBuildService {
  constructor(
    private readonly snapshot: ProfileSnapshotSummary,
    private readonly shouldFail = false
  ) {}

  async buildSnapshot() {
    if (this.shouldFail) {
      throw new AppError("PROFILE_BUILD_FAILED", "mock profile build failure");
    }
    return this.snapshot;
  }

  async getActiveSnapshot() {
    return this.snapshot;
  }
}

class FakeRefreshRepository implements ProfileRefreshRepository {
  private jobStatus: "running" | "success" | "failed" = "running";
  trigger: "initial" | "manual" | "scheduled" = "manual";

  async createRefreshJob(input: { trigger: "initial" | "manual" | "scheduled" }) {
    this.trigger = input.trigger;
    return { id: "job-1" };
  }

  async markRefreshJobSucceeded() {
    this.jobStatus = "success";
    return {
      id: "job-1",
      trigger: this.trigger,
      status: "success" as const,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      snapshotId: "snapshot-1"
    };
  }

  async markRefreshJobFailed(input: { jobId: string; errorMessage: string }) {
    this.jobStatus = "failed";
    return {
      id: input.jobId,
      trigger: this.trigger,
      status: "failed" as const,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      errorMessage: input.errorMessage
    };
  }

  async getLatestRefreshJob() {
    return {
      id: "job-1",
      trigger: this.trigger,
      status: this.jobStatus,
      startedAt: new Date().toISOString()
    };
  }

  async recordReminderCheck(input: { isDue: boolean; lastRefreshAt?: Date }) {
    return {
      id: "reminder-1",
      checkedAt: new Date().toISOString(),
      isDue: input.isDue,
      lastRefreshAt: input.lastRefreshAt?.toISOString()
    };
  }

  async getLatestReminderCheck() {
    return null;
  }
}

describe("DefaultProfileRefreshService", () => {
  const snapshot: ProfileSnapshotSummary = {
    id: "snapshot-1",
    status: "active",
    builtAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(),
    sourceLibraryVersion: 100,
    itemsCount: 10,
    segments: {
      recentCore: 4,
      stableLongTerm: 4,
      background: 2
    },
    researchTypePreferences: []
  };

  it("runs manual refresh and persists success job status", async () => {
    const repository = new FakeRefreshRepository();
    const service = new DefaultProfileRefreshService(
      new FakeBuildService(snapshot),
      repository
    );

    const result = await service.runManualRefresh();

    expect(result.snapshot.id).toBe("snapshot-1");
    expect(result.job.status).toBe("success");
    expect(result.job.trigger).toBe("manual");
    expect(repository.trigger).toBe("manual");
  });

  it("runs scheduled refresh through the same builder with a scheduled job", async () => {
    const repository = new FakeRefreshRepository();
    const service = new DefaultProfileRefreshService(
      new FakeBuildService(snapshot),
      repository
    );

    const result = await service.runScheduledRefresh();

    expect(result.snapshot.id).toBe("snapshot-1");
    expect(result.job.status).toBe("success");
    expect(result.job.trigger).toBe("scheduled");
    expect(repository.trigger).toBe("scheduled");
  });

  it("records monthly reminder as due when refresh is older than 30 days", async () => {
    const service = new DefaultProfileRefreshService(
      new FakeBuildService(snapshot),
      new FakeRefreshRepository()
    );

    const reminder = await service.runMonthlyReminderCheck(new Date());

    expect(reminder.isDue).toBe(true);
  });

  it("marks job failed when manual refresh throws", async () => {
    const service = new DefaultProfileRefreshService(
      new FakeBuildService(snapshot, true),
      new FakeRefreshRepository()
    );

    await expect(service.runManualRefresh()).rejects.toBeInstanceOf(AppError);
  });
});

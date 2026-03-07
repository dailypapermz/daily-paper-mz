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

  async createRefreshJob() {
    return { id: "job-1" };
  }

  async markRefreshJobSucceeded() {
    this.jobStatus = "success";
    return {
      id: "job-1",
      trigger: "manual" as const,
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
      trigger: "manual" as const,
      status: "failed" as const,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      errorMessage: input.errorMessage
    };
  }

  async getLatestRefreshJob() {
    return {
      id: "job-1",
      trigger: "manual" as const,
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
    const service = new DefaultProfileRefreshService(
      new FakeBuildService(snapshot),
      new FakeRefreshRepository()
    );

    const result = await service.runManualRefresh();

    expect(result.snapshot.id).toBe("snapshot-1");
    expect(result.job.status).toBe("success");
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

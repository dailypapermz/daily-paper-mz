import { AppError } from "../../lib/errors";
import type {
  ProfileBuildService,
  ProfileRefreshRepository,
  ProfileRefreshService
} from "./types";

const MONTHLY_REFRESH_DAYS = 30;

export class DefaultProfileRefreshService implements ProfileRefreshService {
  constructor(
    private readonly buildService: ProfileBuildService,
    private readonly repository: ProfileRefreshRepository
  ) {}

  async runManualRefresh() {
    const job = await this.repository.createRefreshJob({ trigger: "manual" });

    try {
      const snapshot = await this.buildService.buildSnapshot();
      const updatedJob = await this.repository.markRefreshJobSucceeded({
        jobId: job.id,
        snapshotId: snapshot.id
      });

      return {
        job: updatedJob,
        snapshot
      };
    } catch (error) {
      const appError =
        error instanceof AppError
          ? error
          : new AppError(
              "PROFILE_REFRESH_FAILED",
              error instanceof Error ? error.message : "Unknown profile refresh error"
            );

      await this.repository.markRefreshJobFailed({
        jobId: job.id,
        errorMessage: appError.message
      });

      throw appError;
    }
  }

  async getRefreshStatus() {
    const [latestJob, activeSnapshot, latestReminder] = await Promise.all([
      this.repository.getLatestRefreshJob(),
      this.buildService.getActiveSnapshot(),
      this.repository.getLatestReminderCheck()
    ]);

    return {
      latestJob,
      activeSnapshot,
      latestReminder
    };
  }

  async runMonthlyReminderCheck(now = new Date()) {
    const activeSnapshot = await this.buildService.getActiveSnapshot();
    const lastRefreshAt = activeSnapshot ? new Date(activeSnapshot.builtAt) : undefined;

    const isDue = !lastRefreshAt || daysBetween(lastRefreshAt, now) >= MONTHLY_REFRESH_DAYS;

    return this.repository.recordReminderCheck({
      isDue,
      lastRefreshAt
    });
  }
}

function daysBetween(start: Date, end: Date): number {
  return Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

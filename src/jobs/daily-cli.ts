import type { DailyPipelineRunSummary } from "../modules/scheduler/daily-pipeline";

export type DailyJobCliResult = Pick<
  DailyPipelineRunSummary,
  "status" | "disposition" | "runId" | "failedStage" | "retryable"
>;

export type DailyNotificationDeliverySummary = {
  deliveryStatus: "sent" | "skipped" | "failed";
  channel: "wecom" | "email" | "none";
  businessDate?: string;
  recommendationCount?: number;
  warningSummary?: string;
  reason?: "configuration_incomplete" | "already_sent" | "legacy_suppressed" | "delivery_outcome_unknown";
  errorCategory?: "delivery_failed";
  deduplicated?: boolean;
};

export type DailyNotificationLogResult = Omit<
  DailyNotificationDeliverySummary,
  "reason" | "errorCategory"
> & {
  event: "daily_notification";
  runId?: string;
  runStatus: DailyPipelineRunSummary["status"];
  reason?: "configuration_incomplete" | "already_sent" | "legacy_suppressed" | "delivery_outcome_unknown" | "already_succeeded" | "already_running" | "missing_run_id";
  errorCategory?: "delivery_failed" | "notification_internal";
  deduplicated?: boolean;
};

export type DailyJobCliDependencies = {
  runPipeline(input?: { runDate?: string }): Promise<DailyPipelineRunSummary>;
  disconnect(): Promise<void>;
  writeResult(result: DailyJobCliResult): void;
  notify?(pipeline: DailyPipelineRunSummary): Promise<DailyNotificationDeliverySummary>;
  writeNotificationResult?(result: DailyNotificationLogResult): void;
  warn?(message: string): void;
};

export function parseDailyJobArgs(args: string[]): { runDate?: string } {
  if (args.length === 0) return {};
  if (args.length !== 2 || args[0] !== "--run-date") {
    throw new Error("Usage: daily job [--run-date YYYY-MM-DD]");
  }

  const runDate = args[1];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(runDate)) {
    throw new Error("--run-date must use the exact YYYY-MM-DD format");
  }
  const parsed = new Date(`${runDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== runDate) {
    throw new Error("--run-date must be a valid UTC calendar date");
  }
  return { runDate };
}

export function dailyJobExitCode(result: DailyJobCliResult): 0 | 1 {
  if (result.disposition === "already_running") return 0;
  if (result.status === "complete" || result.status === "complete_with_warnings") return 0;
  if (result.status === "partial" && !result.retryable) return 0;
  return 1;
}

export async function executeDailyJobCli(
  args: string[],
  dependencies: DailyJobCliDependencies
): Promise<0 | 1> {
  try {
    const input = parseDailyJobArgs(args);
    const pipeline = await dependencies.runPipeline(input);
    const result: DailyJobCliResult = {
      status: pipeline.status,
      disposition: pipeline.disposition,
      runId: pipeline.runId,
      failedStage: pipeline.failedStage,
      retryable: pipeline.retryable
    };
    dependencies.writeResult(result);
    if (dependencies.notify && !pipeline.runId) {
      dependencies.writeNotificationResult?.({
        event: "daily_notification",
        runStatus: pipeline.status,
        deliveryStatus: "skipped",
        channel: "none",
        reason: "missing_run_id"
      });
    } else if (
      dependencies.notify &&
      pipeline.disposition === "already_running"
    ) {
      dependencies.writeNotificationResult?.({
        event: "daily_notification",
        runId: pipeline.runId,
        runStatus: pipeline.status,
        deliveryStatus: "skipped",
        channel: "none",
        reason: pipeline.disposition
      });
    } else if (dependencies.notify) {
      try {
        const delivery = await dependencies.notify(pipeline);
        dependencies.writeNotificationResult?.({
          event: "daily_notification",
          runId: pipeline.runId,
          runStatus: pipeline.status,
          ...delivery
        });
        if (delivery.deliveryStatus === "failed") {
          dependencies.warn?.("Optional daily notification failed after persistence");
        }
      } catch {
        dependencies.writeNotificationResult?.({
          event: "daily_notification",
          runId: pipeline.runId,
          runStatus: pipeline.status,
          deliveryStatus: "failed",
          channel: "none",
          errorCategory: "notification_internal"
        });
        dependencies.warn?.("Optional daily notification failed after persistence");
      }
    }
    return dailyJobExitCode(result);
  } catch {
    dependencies.writeResult({ status: "failed", disposition: "executed", retryable: false });
    return 1;
  } finally {
    await dependencies.disconnect();
  }
}

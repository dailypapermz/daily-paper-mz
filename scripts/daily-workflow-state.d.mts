export type PersistedDailyWorkflowRun = {
  id: string;
  pipelineStatus: "RUNNING" | "COMPLETE" | "COMPLETE_WITH_WARNINGS" | "PARTIAL" | "FAILED" | null;
  hasNotificationDeliveryStatus: boolean;
  notificationDeliveryStatus: "SENDING" | "SENT" | "LEGACY_SUPPRESSED" | null;
};

export type PersistedDailyExecutionDecision = {
  runMigration: boolean;
  runDailyJob: boolean;
  reason:
    | "new_run"
    | "recoverable_run"
    | "legacy_requires_migration"
    | "already_sent"
    | "delivery_outcome_unknown"
    | "legacy_suppressed"
    | "notification_pending";
};

export function buildProductionDailyRequestKey(businessDate: string): string;
export function buildDailyConcurrencyGroup(input: {
  repository: string;
  businessDate: string;
}): string;
export function decidePersistedDailyExecution(
  run: PersistedDailyWorkflowRun | null
): PersistedDailyExecutionDecision;
export function buildSkippedDailyNotification(input: {
  run: PersistedDailyWorkflowRun;
  businessDate: string;
  reason: "already_sent" | "delivery_outcome_unknown" | "legacy_suppressed";
}): {
  event: "daily_notification";
  runId: string;
  runStatus: "complete" | "complete_with_warnings" | "partial" | "running" | "failed";
  deliveryStatus: "skipped";
  channel: "none";
  businessDate: string;
  reason: "already_sent" | "delivery_outcome_unknown" | "legacy_suppressed";
  deduplicated: true;
};

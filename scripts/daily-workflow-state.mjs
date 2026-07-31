const TERMINAL_PIPELINE_STATUSES = new Set(["COMPLETE", "COMPLETE_WITH_WARNINGS"]);
const DEFAULT_PRODUCTION_SOURCES = ["biorxiv", "arxiv", "pubmed", "journal"];

export function buildProductionDailyRequestKey(businessDate) {
  const sourceKey = [...DEFAULT_PRODUCTION_SOURCES].sort().join("+");
  return `daily:v1:aggregated:${sourceKey}:${businessDate}`;
}

export function buildDailyConcurrencyGroup({ repository, businessDate }) {
  if (!repository) throw new Error("repository is required for daily concurrency");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate ?? "")) {
    throw new Error("businessDate must use YYYY-MM-DD for daily concurrency");
  }
  return `daily-paper-cloud-${repository}-production-${businessDate}`;
}

export function decidePersistedDailyExecution(run) {
  if (!run) {
    return { runMigration: true, runDailyJob: true, reason: "new_run" };
  }
  if (!run.hasNotificationDeliveryStatus) {
    return { runMigration: true, runDailyJob: true, reason: "legacy_requires_migration" };
  }
  if (!TERMINAL_PIPELINE_STATUSES.has(run.pipelineStatus ?? "")) {
    return { runMigration: false, runDailyJob: true, reason: "recoverable_run" };
  }
  if (run.notificationDeliveryStatus === "SENT") {
    return { runMigration: false, runDailyJob: false, reason: "already_sent" };
  }
  if (run.notificationDeliveryStatus === "SENDING") {
    return { runMigration: false, runDailyJob: false, reason: "delivery_outcome_unknown" };
  }
  if (run.notificationDeliveryStatus === "LEGACY_SUPPRESSED") {
    return { runMigration: false, runDailyJob: false, reason: "legacy_suppressed" };
  }
  return { runMigration: false, runDailyJob: true, reason: "notification_pending" };
}

export function buildSkippedDailyNotification({ run, businessDate, reason }) {
  if (!["already_sent", "delivery_outcome_unknown", "legacy_suppressed"].includes(reason)) {
    throw new Error(`unsupported persisted daily skip reason: ${reason}`);
  }
  return {
    event: "daily_notification",
    runId: run.id,
    runStatus: toPublicPipelineStatus(run.pipelineStatus),
    deliveryStatus: "skipped",
    channel: "none",
    businessDate,
    reason,
    deduplicated: true
  };
}

function toPublicPipelineStatus(status) {
  if (status === "COMPLETE_WITH_WARNINGS") return "complete_with_warnings";
  if (status === "COMPLETE") return "complete";
  if (status === "PARTIAL") return "partial";
  if (status === "RUNNING") return "running";
  return "failed";
}

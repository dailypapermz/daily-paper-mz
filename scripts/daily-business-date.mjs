const UTC_DAY_MS = 24 * 60 * 60 * 1000;

export function parseUtcBusinessDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) {
    throw new Error("runDate must use the exact YYYY-MM-DD format");
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error("runDate must be a valid UTC calendar date");
  }
  return value;
}

export function resolveScheduledBusinessDate(scheduledTime) {
  const scheduledAt = scheduledTime instanceof Date
    ? scheduledTime
    : new Date(scheduledTime);
  if (Number.isNaN(scheduledAt.getTime())) {
    throw new Error("scheduledTime must be a valid timestamp");
  }

  const scheduledDayUtc = Date.UTC(
    scheduledAt.getUTCFullYear(),
    scheduledAt.getUTCMonth(),
    scheduledAt.getUTCDate()
  );
  return new Date(scheduledDayUtc - UTC_DAY_MS).toISOString().slice(0, 10);
}

export function resolveBusinessDate({ eventName, ref, manualRunDate, now = new Date() }) {
  if (ref !== "refs/heads/master") {
    throw new Error("production daily workflow is restricted to the master branch");
  }
  if (eventName === "workflow_dispatch") {
    return parseUtcBusinessDate(manualRunDate);
  }
  if (eventName !== "schedule") {
    throw new Error(`unsupported daily workflow event: ${eventName}`);
  }

  return resolveScheduledBusinessDate(now);
}

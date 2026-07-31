import {
  parseUtcBusinessDate,
  resolveScheduledBusinessDate
} from "../../scripts/daily-business-date.mjs";

export const DAILY_SCHEDULER_CRON = "15 0 * * *";
export const DAILY_SCHEDULER_SECRET = "DAILY_SCHEDULER_GITHUB_TOKEN";

const DAILY_WORKFLOW_DISPATCH_URL =
  "https://api.github.com/repos/linyuan701/daily-paper/actions/workflows/daily.yml/dispatches";
const GITHUB_API_VERSION = "2026-03-10";
const REQUEST_TIMEOUT_MS = 15_000;

export type DispatchStatus =
  | "success"
  | "auth_error"
  | "workflow_not_found"
  | "rate_limited"
  | "dispatch_failed";

export type HttpStatusCategory =
  | "2xx"
  | "3xx"
  | "4xx"
  | "5xx"
  | "network"
  | "not_attempted";

export interface SchedulerDispatchLog {
  scheduledTime: number;
  targetBusinessDate: string;
  dispatchStatus: DispatchStatus;
  httpStatusCategory: HttpStatusCategory;
  duration: number;
}

interface SchedulerDependencies {
  fetchImpl?: typeof fetch;
  clock?: () => number;
  logger?: Pick<Console, "log" | "error">;
}

function statusCategory(status: number): HttpStatusCategory {
  if (status >= 200 && status < 300) return "2xx";
  if (status >= 300 && status < 400) return "3xx";
  if (status >= 400 && status < 500) return "4xx";
  return "5xx";
}

function dispatchStatus(status: number): DispatchStatus {
  if (status >= 200 && status < 300) return "success";
  if (status === 401 || status === 403) return "auth_error";
  if (status === 404) return "workflow_not_found";
  if (status === 429) return "rate_limited";
  return "dispatch_failed";
}

function elapsed(startedAt: number, clock: () => number): number {
  return Math.max(0, Math.round(clock() - startedAt));
}

export function buildDailyWorkflowDispatchRequest(
  targetBusinessDate: string,
  token: string,
  signal: AbortSignal
): [string, RequestInit] {
  const runDate = parseUtcBusinessDate(targetBusinessDate);
  return [
    DAILY_WORKFLOW_DISPATCH_URL,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": GITHUB_API_VERSION
      },
      body: JSON.stringify({
        ref: "master",
        inputs: { runDate }
      }),
      signal
    }
  ];
}

export async function dispatchDailyWorkflow(
  scheduledTime: number,
  token: string | undefined,
  dependencies: SchedulerDependencies = {}
): Promise<SchedulerDispatchLog> {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const clock = dependencies.clock ?? Date.now;
  const startedAt = clock();
  const targetBusinessDate = resolveScheduledBusinessDate(scheduledTime);

  if (!token) {
    return {
      scheduledTime,
      targetBusinessDate,
      dispatchStatus: "dispatch_failed",
      httpStatusCategory: "not_attempted",
      duration: elapsed(startedAt, clock)
    };
  }

  try {
    const request = buildDailyWorkflowDispatchRequest(
      targetBusinessDate,
      token,
      AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    );
    const response = await fetchImpl(...request);
    return {
      scheduledTime,
      targetBusinessDate,
      dispatchStatus: dispatchStatus(response.status),
      httpStatusCategory: statusCategory(response.status),
      duration: elapsed(startedAt, clock)
    };
  } catch {
    return {
      scheduledTime,
      targetBusinessDate,
      dispatchStatus: "dispatch_failed",
      httpStatusCategory: "network",
      duration: elapsed(startedAt, clock)
    };
  }
}

export async function handleDailySchedule(
  controller: Pick<ScheduledController, "scheduledTime" | "noRetry">,
  env: Pick<CloudflareEnv, "DAILY_SCHEDULER_GITHUB_TOKEN">,
  dependencies: SchedulerDependencies = {}
): Promise<SchedulerDispatchLog> {
  controller.noRetry();
  const result = await dispatchDailyWorkflow(
    controller.scheduledTime,
    env.DAILY_SCHEDULER_GITHUB_TOKEN,
    dependencies
  );
  const logger = dependencies.logger ?? console;
  const serialized = JSON.stringify(result);
  if (result.dispatchStatus === "success") {
    logger.log(serialized);
  } else {
    logger.error(serialized);
  }
  return result;
}

import { appendFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const ACTIVE_STATUSES = ["queued", "in_progress", "requested", "waiting", "pending"];
const MANUAL_TITLE = /^Daily manual (\d{4}-\d{2}-\d{2})$/;

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

  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(todayUtc - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function businessDateForActiveRun(run) {
  if (run.head_branch !== "master") return null;
  if (run.event === "workflow_dispatch") {
    const match = MANUAL_TITLE.exec(run.display_title ?? "");
    if (!match) return null;
    try {
      return parseUtcBusinessDate(match[1]);
    } catch {
      return null;
    }
  }
  if (run.event !== "schedule") return null;

  const createdAt = new Date(run.created_at);
  if (Number.isNaN(createdAt.getTime())) return null;
  const createdDayUtc = Date.UTC(
    createdAt.getUTCFullYear(),
    createdAt.getUTCMonth(),
    createdAt.getUTCDate()
  );
  return new Date(createdDayUtc - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function findBlockingActiveRun({ workflowRuns, currentRunId, businessDate }) {
  return workflowRuns.find((run) =>
    String(run.id) !== String(currentRunId) &&
    ACTIVE_STATUSES.includes(run.status) &&
    businessDateForActiveRun(run) === businessDate
  );
}

export async function runDailyWorkflowGuard(env, fetchImpl = fetch) {
  const businessDate = resolveBusinessDate({
    eventName: env.GITHUB_EVENT_NAME,
    ref: env.GITHUB_REF,
    manualRunDate: env.MANUAL_RUN_DATE,
    now: env.GUARD_NOW ? new Date(env.GUARD_NOW) : new Date()
  });

  if (env.GITHUB_EVENT_NAME !== "workflow_dispatch") {
    return { businessDate, shouldRun: true };
  }
  if (!env.GITHUB_REPOSITORY || !env.GITHUB_RUN_ID || !env.GH_TOKEN) {
    throw new Error("GitHub Actions context is incomplete; refusing manual production execution");
  }

  const apiBase = env.GITHUB_API_URL || "https://api.github.com";
  const workflowRuns = [];
  for (const status of ACTIVE_STATUSES) {
    const url = new URL(
      `/repos/${env.GITHUB_REPOSITORY}/actions/workflows/daily.yml/runs`,
      apiBase
    );
    url.searchParams.set("branch", "master");
    url.searchParams.set("status", status);
    url.searchParams.set("per_page", "100");
    const response = await fetchImpl(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${env.GH_TOKEN}`,
        "X-GitHub-Api-Version": "2026-03-10"
      }
    });
    if (!response.ok) {
      throw new Error(`Actions active-run check failed with HTTP ${response.status}`);
    }
    const payload = await response.json();
    if (!Array.isArray(payload.workflow_runs)) {
      throw new Error("Actions active-run check returned an invalid response");
    }
    workflowRuns.push(...payload.workflow_runs);
  }

  const blockingRun = findBlockingActiveRun({
    workflowRuns,
    currentRunId: env.GITHUB_RUN_ID,
    businessDate
  });
  return {
    businessDate,
    shouldRun: !blockingRun,
    blockingRun: blockingRun
      ? { id: blockingRun.id, status: blockingRun.status, event: blockingRun.event }
      : undefined
  };
}

async function main() {
  try {
    const result = await runDailyWorkflowGuard(process.env);
    await appendFile(process.env.GITHUB_OUTPUT, [
      `run_date=${result.businessDate}`,
      `should_run=${String(result.shouldRun)}`,
      ""
    ].join("\n"));
    if (result.shouldRun) {
      console.log(JSON.stringify({ status: "accepted", businessDate: result.businessDate }));
      return;
    }

    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `Manual fallback exited safely: business date ${result.businessDate} already has an active run.\n`
    );
    console.log(JSON.stringify({
      status: "already_running",
      businessDate: result.businessDate,
      blockingRun: result.blockingRun
    }));
  } catch (error) {
    console.error(JSON.stringify({
      status: "rejected",
      reason: error instanceof Error ? error.message : "unknown guard failure"
    }));
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}

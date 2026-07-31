import { appendFile } from "node:fs/promises";

import { prisma } from "../src/db/prisma/client";
import { parseDailyJobArgs } from "../src/jobs/daily-cli";
import {
  findPersistedProductionDailyRun,
  type DailyWorkflowGuardDatabase
} from "../src/jobs/daily-workflow-persisted-guard";
import {
  buildSkippedDailyNotification,
  decidePersistedDailyExecution
} from "./daily-workflow-state.mjs";

async function main(): Promise<void> {
  try {
    const { runDate } = parseDailyJobArgs(process.argv.slice(2));
    if (!runDate) throw new Error("--run-date is required for the persisted daily workflow guard");

    const run = await findPersistedProductionDailyRun(
      prisma as unknown as DailyWorkflowGuardDatabase,
      runDate
    );
    const decision = decidePersistedDailyExecution(run);

    if (!process.env.GITHUB_OUTPUT) {
      throw new Error("GITHUB_OUTPUT is required for the persisted daily workflow guard");
    }
    await appendFile(process.env.GITHUB_OUTPUT, [
      `run_migration=${String(decision.runMigration)}`,
      `run_daily_job=${String(decision.runDailyJob)}`,
      `reason=${decision.reason}`,
      `run_id=${run?.id ?? ""}`,
      ""
    ].join("\n"));

    if (!decision.runDailyJob && run) {
      const notification = buildSkippedDailyNotification({
        run,
        businessDate: runDate,
        reason: decision.reason as "already_sent" | "delivery_outcome_unknown" | "legacy_suppressed"
      });
      console.log(JSON.stringify(notification));
      if (process.env.GITHUB_STEP_SUMMARY) {
        await appendFile(
          process.env.GITHUB_STEP_SUMMARY,
          `Daily execution exited before migration: ${runDate} ${decision.reason} (runId ${run.id}).\n`
        );
      }
      return;
    }

    console.log(JSON.stringify({
      status: "accepted",
      businessDate: runDate,
      runId: run?.id,
      reason: decision.reason,
      runMigration: decision.runMigration,
      runDailyJob: decision.runDailyJob
    }));
  } catch {
    console.error(JSON.stringify({
      status: "rejected",
      reason: "persisted_daily_guard_failed"
    }));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();

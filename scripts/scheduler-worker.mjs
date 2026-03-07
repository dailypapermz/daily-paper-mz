import dotenv from "dotenv";

dotenv.config();

const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
const mode = parseMode(process.argv.slice(2));
const dailyHourUtc = parseInteger(process.env.SCHEDULER_DAILY_UTC_HOUR, 6);
const monthlyDayUtc = parseInteger(process.env.SCHEDULER_MONTHLY_UTC_DAY, 1);
const monthlyHourUtc = parseInteger(process.env.SCHEDULER_MONTHLY_UTC_HOUR, 7);
const pollMs = parseInteger(process.env.SCHEDULER_POLL_MS, 60_000);

let lastDailyRunDate = "";
let lastMonthlyRunKey = "";

async function main() {
  log("info", "Scheduler worker started", {
    mode,
    baseUrl,
    dailyHourUtc,
    monthlyDayUtc,
    monthlyHourUtc,
    pollMs
  });

  if (mode === "daily") {
    await runDaily();
    return;
  }
  if (mode === "monthly") {
    await runMonthly();
    return;
  }

  while (true) {
    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);

    if (now.getUTCHours() === dailyHourUtc && lastDailyRunDate !== todayKey) {
      await runDaily();
      lastDailyRunDate = todayKey;
    }

    const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    if (
      now.getUTCDate() === monthlyDayUtc &&
      now.getUTCHours() === monthlyHourUtc &&
      lastMonthlyRunKey !== monthKey
    ) {
      await runMonthly();
      lastMonthlyRunKey = monthKey;
    }

    await sleep(pollMs);
  }
}

async function runDaily() {
  log("info", "Running scheduled daily pipeline", {});

  try {
    const payload = await postJson(`${baseUrl}/api/jobs/daily`, {});
    log("info", "Daily pipeline finished", payload);
  } catch (error) {
    log("error", "Daily pipeline failed", {
      error: error instanceof Error ? error.message : "Unknown scheduler daily failure"
    });
  }
}

async function runMonthly() {
  log("info", "Running scheduled monthly reminder", {});

  try {
    const payload = await postJson(`${baseUrl}/api/jobs/monthly-reminder`, {});
    log("info", "Monthly reminder finished", payload);
  } catch (error) {
    log("error", "Monthly reminder failed", {
      error: error instanceof Error ? error.message : "Unknown scheduler monthly failure"
    });
  }
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

function parseMode(args) {
  const modeArg = args.find((arg) => arg.startsWith("--mode="));
  const value = modeArg?.split("=")[1];
  if (value === "daily" || value === "monthly" || value === "loop") {
    return value;
  }
  return "daily";
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function log(level, message, context) {
  console.log(
    JSON.stringify({
      level,
      message,
      timestamp: new Date().toISOString(),
      context
    })
  );
}

main().catch((error) => {
  log("error", "Scheduler worker crashed", {
    error: error instanceof Error ? error.message : "Unknown scheduler crash"
  });
  process.exit(1);
});

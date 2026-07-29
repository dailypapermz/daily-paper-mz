import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(new URL("../.github/workflows/daily.yml", import.meta.url), "utf8");
const notificationTestWorkflow = readFileSync(
  new URL("../.github/workflows/notification-test.yml", import.meta.url),
  "utf8"
);

test("cloud daily workflow exposes the approved schedule and manual runDate", () => {
  assert.match(workflow, /schedule:\s*\n\s*- cron: ["']15 8 \* \* \*["']\s*\n\s*timezone: ["']Asia\/Shanghai["']/);
  assert.match(workflow, /workflow_dispatch:\s*\n\s*inputs:\s*\n\s*runDate:/);
  assert.match(workflow, /runDate:[\s\S]*?required: false[\s\S]*?type: string/);
});

test("cloud daily workflow uses least privilege and bounded non-cancelling concurrency", () => {
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.match(workflow, /concurrency:[\s\S]*?group: daily-paper-cloud-\$\{\{ github\.repository \}\}-production/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /runs-on: ubuntu-latest/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /timeout-minutes: 120/);
  assert.match(workflow, /node-version: 22/);
});

test("cloud daily workflow fixes cloud capabilities and references secrets symbolically", () => {
  assert.match(workflow, /DEPLOYMENT_MODE: cloud/);
  assert.match(workflow, /ZOTERO_TRANSPORT: web/);
  assert.match(workflow, /OBSIDIAN_ENABLED: ["']false["']/);
  assert.match(workflow, /SCHEDULER_DESKTOP_NOTIFICATION_ENABLED: ["']false["']/);

  for (const name of ["DATABASE_URL", "ZOTERO_ID", "ZOTERO_KEY", "LLM_API_KEY"]) {
    assert.match(workflow, new RegExp(`\\$\\{\\{ secrets\\.${name} \\}\\}`));
  }
  for (const name of ["LLM_MODEL", "LLM_API_BASE_URL", "NOTIFICATION_DASHBOARD_URL"]) {
    assert.match(workflow, new RegExp(`\\$\\{\\{ vars\\.${name} \\}\\}`));
  }
  for (const name of [
    "WECOM_BOT_WEBHOOK_URL",
    "NOTIFICATION_SMTP_HOST",
    "NOTIFICATION_SMTP_PORT",
    "NOTIFICATION_SMTP_SECURE",
    "NOTIFICATION_SMTP_USER",
    "NOTIFICATION_SMTP_PASS",
    "NOTIFICATION_SMTP_FROM",
    "NOTIFICATION_SMTP_TO"
  ]) {
    assert.match(workflow, new RegExp(`\\$\\{\\{ secrets\\.${name} \\}\\}`));
  }
});

test("cloud daily workflow migrates before invoking the existing CLI", () => {
  const commands = [
    "npm ci",
    "npm run check:env",
    "npm run prisma:cloud:validate",
    "npm run prisma:cloud:generate",
    "npm run prisma:cloud:migrate:deploy",
    "npm run job:daily:cloud"
  ];
  let previous = -1;
  for (const command of commands) {
    const current = workflow.indexOf(command);
    assert.ok(current > previous, `${command} must appear in workflow order`);
    previous = current;
  }
  assert.match(workflow, /npm run job:daily:cloud -- --run-date ["']\$RUN_DATE["']/);
});

test("cloud daily workflow contains no plaintext credentials or Worker trigger", () => {
  assert.doesNotMatch(workflow, /postgres(?:ql)?:\/\/[A-Za-z0-9]/i);
  assert.doesNotMatch(workflow, /qyapi\.weixin\.qq\.com\/cgi-bin\/webhook/i);
  assert.doesNotMatch(workflow, /curl\s/i);
  assert.doesNotMatch(workflow, /cloudflare/i);
  assert.doesNotMatch(workflow, /\/api\/jobs\/daily/i);
});

test("SMTP notification test is manual, isolated, and least privilege", () => {
  assert.match(notificationTestWorkflow, /on:\s*\n\s*workflow_dispatch:/);
  assert.doesNotMatch(notificationTestWorkflow, /schedule:|pull_request:|push:/);
  assert.match(notificationTestWorkflow, /permissions:\s*\n\s*contents: read/);
  assert.match(notificationTestWorkflow, /environment: production/);
  assert.match(notificationTestWorkflow, /timeout-minutes: 10/);
  assert.match(notificationTestWorkflow, /persist-credentials: false/);
  assert.match(notificationTestWorkflow, /Daily Paper notification test/);
  assert.match(notificationTestWorkflow, /sendDailyNotification/);
});

test("SMTP notification test references only notification configuration symbolically", () => {
  for (const name of [
    "NOTIFICATION_SMTP_HOST",
    "NOTIFICATION_SMTP_PORT",
    "NOTIFICATION_SMTP_SECURE",
    "NOTIFICATION_SMTP_USER",
    "NOTIFICATION_SMTP_PASS",
    "NOTIFICATION_SMTP_FROM",
    "NOTIFICATION_SMTP_TO"
  ]) {
    assert.match(notificationTestWorkflow, new RegExp(`\\$\\{\\{ secrets\\.${name} \\}\\}`));
  }
  assert.match(
    notificationTestWorkflow,
    /\$\{\{ vars\.NOTIFICATION_DASHBOARD_URL \}\}/
  );
  assert.doesNotMatch(notificationTestWorkflow, /WECOM_BOT_WEBHOOK_URL/);
});

test("SMTP notification test cannot run or mutate the persisted pipeline", () => {
  for (const forbidden of [
    "DATABASE_URL",
    "prisma",
    "job:daily",
    "run-daily-cloud",
    "createDailyRecommendationService",
    "/api/jobs/daily",
    "ingestion",
    "normalization",
    "rerank",
    "summary"
  ]) {
    assert.doesNotMatch(notificationTestWorkflow, new RegExp(forbidden, "i"));
  }
});

test("SMTP notification test emits only bounded delivery status and redacted error categories", () => {
  assert.match(notificationTestWorkflow, /delivery\.channel === ["']email["']/);
  assert.match(notificationTestWorkflow, /configuration_incomplete/);
  assert.match(notificationTestWorkflow, /smtp_delivery_failed/);
  assert.match(notificationTestWorkflow, /notification_test_internal/);
  assert.doesNotMatch(notificationTestWorkflow, /delivery\.attempts|error\.message|console\.(?:log|error)\([^\n]*process\.env/);
});

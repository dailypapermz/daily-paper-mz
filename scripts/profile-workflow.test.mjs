import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(new URL("../.github/workflows/profile.yml", import.meta.url), "utf8");

test("cloud profile workflow is manual, separated, and bounded", () => {
  assert.doesNotMatch(workflow, /schedule:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /operation:[\s\S]*?type: choice[\s\S]*?- sync[\s\S]*?- refresh/);
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.match(workflow, /concurrency:[\s\S]*?cancel-in-progress: false/);
  assert.match(workflow, /timeout-minutes: 120/);
});

test("cloud profile workflow uses PostgreSQL and the existing profile CLI contract", () => {
  const commands = [
    "npm ci",
    "npm run check:env",
    "npm run prisma:cloud:validate",
    "npm run prisma:cloud:generate",
    "npm run prisma:cloud:migrate:deploy",
    "npm run job:profile:cloud"
  ];
  let previous = -1;
  for (const command of commands) {
    const current = workflow.indexOf(command);
    assert.ok(current > previous, `${command} must appear in workflow order`);
    previous = current;
  }
  assert.match(workflow, /DEPLOYMENT_MODE: cloud/);
  assert.match(workflow, /ZOTERO_TRANSPORT: web/);
  assert.match(workflow, /\$\{\{ secrets\.DATABASE_URL \}\}/);
  assert.match(workflow, /\$\{\{ secrets\.ZOTERO_ID \}\}/);
  assert.match(workflow, /\$\{\{ secrets\.ZOTERO_KEY \}\}/);
  assert.doesNotMatch(workflow, /job:daily:cloud|\/api\/jobs\/daily|cloudflare/i);
});

test("cloud profile workflow contains no plaintext credentials", () => {
  assert.doesNotMatch(workflow, /postgres(?:ql)?:\/\/[A-Za-z0-9]/i);
  assert.doesNotMatch(workflow, /api[_-]?key\s*[:=]\s*["'][^$]/i);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  NVIDIA_NIM_BASE_URL,
  NVIDIA_NIM_MODEL,
  resolveSmokeConfig,
  runNvidiaSmoke,
  validateSmokeContent
} from "./nvidia-llm-smoke.mjs";

const workflow = await readFile(
  new URL("../.github/workflows/nvidia-llm-smoke.yml", import.meta.url),
  "utf8"
);

const configuredEnvironment = {
  NVIDIA_API_KEY: "test-secret",
  LLM_BASE_URL: `${NVIDIA_NIM_BASE_URL}/`,
  LLM_MODEL: NVIDIA_NIM_MODEL
};

test("smoke configuration is fixed to the hosted NVIDIA endpoint and full model id", () => {
  assert.deepEqual(resolveSmokeConfig(configuredEnvironment), {
    apiKey: "test-secret",
    baseUrl: NVIDIA_NIM_BASE_URL,
    model: NVIDIA_NIM_MODEL
  });
  assert.throws(() => resolveSmokeConfig({ ...configuredEnvironment, NVIDIA_API_KEY: "" }), /NVIDIA_API_KEY/);
  assert.throws(() => resolveSmokeConfig({ ...configuredEnvironment, LLM_BASE_URL: "https://example.test/v1" }), /LLM_BASE_URL/);
  assert.throws(() => resolveSmokeConfig({ ...configuredEnvironment, LLM_MODEL: "deepseek-v4-flash" }), /LLM_MODEL/);
});

test("smoke makes one small non-streaming JSON request and logs only bounded metadata", async () => {
  const calls = [];
  const logs = [];
  const fetchImpl = async (url, init) => {
    calls.push([url, init]);
    return new Response(JSON.stringify({
      choices: [{
        finish_reason: "stop",
        message: {
          reasoning: "not business output",
          reasoning_content: "also ignored",
          content: '{"status":"ok"}'
        }
      }],
      usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 }
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const result = await runNvidiaSmoke({
    environment: configuredEnvironment,
    fetchImpl,
    logger: (line) => logs.push(line),
    now: () => 100
  });

  assert.equal(result.exitCode, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], `${NVIDIA_NIM_BASE_URL}/chat/completions`);
  const request = JSON.parse(calls[0][1].body);
  assert.equal(request.model, NVIDIA_NIM_MODEL);
  assert.equal(request.stream, false);
  assert.deepEqual(request.response_format, { type: "json_object" });
  assert.deepEqual(request.chat_template_kwargs, { thinking: false });
  assert.equal(request.max_tokens, 32);
  assert.equal(logs.length, 1);
  const logged = JSON.parse(logs[0]);
  assert.deepEqual(Object.keys(logged).sort(), ["httpClassification", "jsonValid", "latencyMs", "model"]);
  assert.equal(logs[0].includes("test-secret"), false);
  assert.equal(logs[0].includes(NVIDIA_NIM_BASE_URL), false);
  assert.equal(logs[0].includes("not business output"), false);
});

test("diagnostic mode compares minimal and structured requests with bounded status metadata", async () => {
  const calls = [];
  const logs = [];
  const fetchImpl = async (url, init) => {
    calls.push([url, init]);
    if (calls.length === 1) {
      return new Response(JSON.stringify({
        choices: [{ message: { content: '{"status":"ok"}' } }]
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response("private upstream failure", { status: 500 });
  };

  const result = await runNvidiaSmoke({
    environment: { ...configuredEnvironment, NVIDIA_SMOKE_DIAGNOSTIC: "true" },
    fetchImpl,
    logger: (line) => logs.push(line),
    now: () => 100
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.diagnostic, true);
  assert.equal(calls.length, 2);
  const minimalRequest = JSON.parse(calls[0][1].body);
  const structuredRequest = JSON.parse(calls[1][1].body);
  assert.equal(minimalRequest.response_format, undefined);
  assert.equal(minimalRequest.chat_template_kwargs, undefined);
  assert.deepEqual(structuredRequest.response_format, { type: "json_object" });
  assert.deepEqual(structuredRequest.chat_template_kwargs, { thinking: false });
  assert.equal(logs.length, 2);
  assert.deepEqual(JSON.parse(logs[0]), {
    stage: "minimal",
    model: NVIDIA_NIM_MODEL,
    httpStatus: 200,
    httpClassification: "success",
    latencyMs: 0,
    jsonValid: true
  });
  assert.deepEqual(JSON.parse(logs[1]), {
    stage: "structured",
    model: NVIDIA_NIM_MODEL,
    httpStatus: 500,
    httpClassification: "server_error",
    latencyMs: 0,
    jsonValid: false
  });
  assert.equal(logs.join("\n").includes("test-secret"), false);
  assert.equal(logs.join("\n").includes("private upstream failure"), false);
});

test("smoke fails before fetch when the key is absent", async () => {
  let calls = 0;
  const logs = [];
  const result = await runNvidiaSmoke({
    environment: { LLM_BASE_URL: NVIDIA_NIM_BASE_URL, LLM_MODEL: NVIDIA_NIM_MODEL },
    fetchImpl: async () => {
      calls += 1;
      throw new Error("must not run");
    },
    logger: (line) => logs.push(line),
    now: () => 0
  });

  assert.equal(calls, 0);
  assert.equal(result.httpClassification, "configuration_error");
  assert.equal(logs[0].includes("NVIDIA_API_KEY"), false);
});

test("smoke classifies provider and malformed-response failures without logging bodies", async () => {
  for (const [status, expected] of [[401, "authentication"], [403, "authorization"], [429, "rate_limited"], [503, "server_error"]]) {
    const logs = [];
    const result = await runNvidiaSmoke({
      environment: configuredEnvironment,
      fetchImpl: async () => new Response("private provider body", { status }),
      logger: (line) => logs.push(line),
      now: () => 10
    });
    assert.equal(result.httpClassification, expected);
    assert.equal(logs[0].includes("private provider body"), false);
  }

  const malformed = await runNvidiaSmoke({
    environment: configuredEnvironment,
    fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: "not json" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }),
    logger: () => undefined,
    now: () => 10
  });
  assert.equal(malformed.httpClassification, "invalid_response");
  assert.equal(malformed.jsonValid, false);
});

test("smoke schema accepts only the fixed JSON object", () => {
  assert.equal(validateSmokeContent({ status: "ok" }), true);
  assert.equal(validateSmokeContent({ status: "ok", extra: true }), false);
  assert.equal(validateSmokeContent({ status: "wrong" }), false);
  assert.equal(validateSmokeContent(null), false);
});

test("manual smoke workflow is isolated from the persisted application", () => {
  assert.match(workflow, /on:\s*\n\s*workflow_dispatch:/);
  assert.doesNotMatch(workflow, /schedule:|pull_request:|push:/);
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /NVIDIA_API_KEY: \$\{\{ secrets\.NVIDIA_API_KEY \}\}/);
  assert.match(workflow, /diagnostic:[\s\S]*?type: boolean/);
  assert.match(workflow, /NVIDIA_SMOKE_DIAGNOSTIC: \$\{\{ inputs\.diagnostic \}\}/);
  assert.match(workflow, /node scripts\/nvidia-llm-smoke\.mjs/);
  for (const forbidden of [
    "DATABASE_URL",
    "ZOTERO_KEY",
    "prisma",
    "migrate",
    "job:daily",
    "job:profile",
    "ingestion",
    "rerank",
    "recommendation",
    "notification",
    "WECOM",
    "SMTP"
  ]) {
    assert.doesNotMatch(workflow, new RegExp(forbidden, "i"), forbidden);
  }
});

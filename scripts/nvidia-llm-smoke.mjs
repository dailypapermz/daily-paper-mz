import { pathToFileURL } from "node:url";

export const NVIDIA_NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";
export const NVIDIA_NIM_MODEL = "deepseek-ai/deepseek-v4-flash";

class SmokeConfigurationError extends Error {
  constructor(missingOrInvalidNames) {
    super(missingOrInvalidNames.join(", "));
    this.name = "SmokeConfigurationError";
  }
}

export function resolveSmokeConfig(environment = process.env) {
  const apiKey = environment.NVIDIA_API_KEY?.trim();
  const baseUrl = (environment.LLM_BASE_URL?.trim() || NVIDIA_NIM_BASE_URL).replace(/\/+$/, "");
  const model = environment.LLM_MODEL?.trim() || NVIDIA_NIM_MODEL;
  const invalid = [];

  if (!apiKey) invalid.push("NVIDIA_API_KEY");
  if (baseUrl !== NVIDIA_NIM_BASE_URL) invalid.push("LLM_BASE_URL");
  if (model !== NVIDIA_NIM_MODEL) invalid.push("LLM_MODEL");
  if (invalid.length > 0) throw new SmokeConfigurationError(invalid);

  return { apiKey, baseUrl, model };
}

export function validateSmokeContent(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.keys(value).length === 1 && value.status === "ok";
}

export function classifyHttpStatus(status) {
  if (status === 401) return "authentication";
  if (status === 403) return "authorization";
  if (status === 408) return "request_timeout";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server_error";
  return "http_error";
}

function buildRequestBody(config, stage) {
  const base = {
    model: config.model,
    messages: [
      {
        role: "user",
        content: 'Return exactly this JSON object with no markdown: {"status":"ok"}'
      }
    ],
    max_tokens: 64,
    stream: false
  };

  if (stage === "minimal") return base;
  return {
    ...base,
    messages: [
      {
        role: "system",
        content: "Return only valid JSON matching the requested shape."
      },
      {
        role: "user",
        content: 'Return exactly this JSON object: {"status":"ok"}'
      }
    ],
    temperature: 0,
    max_tokens: 32,
    response_format: { type: "json_object" },
    chat_template_kwargs: { thinking: false }
  };
}

async function runSmokeStage({ config, stage, fetchImpl, now, timeoutMs }) {
  const startedAt = now();
  let httpStatus = null;
  let httpClassification = "network_error";
  let jsonValid = false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(buildRequestBody(config, stage)),
      signal: controller.signal
    });
    httpStatus = response.status;

    if (response.status !== 200) {
      httpClassification = classifyHttpStatus(response.status);
    } else {
      httpClassification = "success";
      const payload = await response.json();
      const content = payload?.choices?.[0]?.message?.content;
      if (typeof content === "string" && content.trim()) {
        jsonValid = validateSmokeContent(JSON.parse(content));
      }
    }
  } catch (error) {
    if (error?.name === "AbortError") {
      httpClassification = "timeout";
    } else if (error instanceof SyntaxError) {
      httpClassification = "invalid_response";
    }
  } finally {
    clearTimeout(timeout);
  }

  return {
    stage,
    model: config.model,
    httpStatus,
    httpClassification,
    latencyMs: Math.max(0, now() - startedAt),
    jsonValid
  };
}

export async function runNvidiaSmoke({
  environment = process.env,
  fetchImpl = fetch,
  logger = console.log,
  now = () => Date.now(),
  timeoutMs = 10_000
} = {}) {
  let config;
  try {
    config = resolveSmokeConfig(environment);
  } catch (error) {
    const result = {
      model: NVIDIA_NIM_MODEL,
      httpClassification: error instanceof SmokeConfigurationError
        ? "configuration_error"
        : "network_error",
      latencyMs: 0,
      jsonValid: false
    };
    logger(JSON.stringify(result));
    return { ...result, exitCode: 1 };
  }

  const diagnostic = environment.NVIDIA_SMOKE_DIAGNOSTIC?.trim().toLowerCase() === "true";
  const stages = diagnostic ? ["minimal", "structured"] : ["structured"];
  const results = [];
  for (const stage of stages) {
    const result = await runSmokeStage({ config, stage, fetchImpl, now, timeoutMs });
    results.push(result);
    const logged = diagnostic
      ? result
      : {
          model: result.model,
          httpClassification: result.httpClassification,
          latencyMs: result.latencyMs,
          jsonValid: result.jsonValid
        };
    logger(JSON.stringify(logged));
  }

  const exitCode = results.every(
    (result) => result.httpClassification === "success" && result.jsonValid
  ) ? 0 : 1;
  if (!diagnostic) return { ...results[0], exitCode };
  return { model: config.model, diagnostic: true, stages: results, exitCode };
}

function isMainModule() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMainModule()) {
  const result = await runNvidiaSmoke();
  process.exitCode = result.exitCode;
}

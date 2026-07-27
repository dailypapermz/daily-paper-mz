import assert from "node:assert/strict";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:8787";
const secretMarkers = ["postgresql://", "DATABASE_URL", "PrismaClient", " at "];

await waitForLiveness();

await expectJson("/api/health/live", { status: 200, code: undefined });
await expectJson("/api/health/ready", { status: 503, code: "DATABASE_UNAVAILABLE" });
await expectJson("/api/jobs/daily", {
  method: "POST",
  status: 503,
  code: "CAPABILITY_UNAVAILABLE_IN_CLOUD"
});
await expectJson("/api/feedback/actions", {
  method: "POST",
  headers: {
    "content-type": "text/plain",
    origin: baseUrl
  },
  body: "{}",
  status: 415,
  code: "UNSUPPORTED_MEDIA_TYPE"
});
await expectJson("/api/feedback/actions", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    origin: "https://evil.example"
  },
  body: "{}",
  status: 403,
  code: "ORIGIN_MISMATCH"
});
await expectJson("/api/feedback/actions", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    origin: baseUrl
  },
  body: JSON.stringify({ padding: "x".repeat(70 * 1024) }),
  status: 413,
  code: "PAYLOAD_TOO_LARGE"
});

const dashboard = await fetch(`${baseUrl}/`);
assert.equal(dashboard.status, 200, "Worker preview dashboard must render");

console.log(JSON.stringify({ status: "ok", runtime: "workerd", checks: 7 }));

async function waitForLiveness() {
  let lastError;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health/live`);
      if (response.ok) return;
      lastError = new Error(`liveness returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw lastError ?? new Error("workerd preview did not become ready");
}

async function expectJson(path, options) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: options.headers,
    body: options.body
  });
  const text = await response.text();
  assert.equal(response.status, options.status, `${path} returned ${response.status}: ${text}`);
  const payload = JSON.parse(text);
  if (options.code) assert.equal(payload.code, options.code);
  for (const marker of secretMarkers) {
    assert.equal(text.includes(marker), false, `${path} exposed forbidden marker ${marker}`);
  }
}

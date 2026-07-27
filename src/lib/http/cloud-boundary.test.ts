import { afterEach, describe, expect, it } from "vitest";

import {
  readJsonMutationBody,
  rejectCloudCapability
} from "./cloud-boundary";

const originalMode = process.env.DEPLOYMENT_MODE;

afterEach(() => {
  if (originalMode === undefined) delete process.env.DEPLOYMENT_MODE;
  else process.env.DEPLOYMENT_MODE = originalMode;
});

describe("Cloud HTTP boundary", () => {
  it("rejects Cloud-only unavailable capabilities without running them", () => {
    process.env.DEPLOYMENT_MODE = "cloud";
    expect(rejectCloudCapability("daily_pipeline")?.status).toBe(503);
  });

  it("requires same-origin JSON for Cloud mutations", async () => {
    process.env.DEPLOYMENT_MODE = "cloud";
    const rejected = await readJsonMutationBody(
      new Request("https://daily.example/api/feedback/actions", {
        method: "POST",
        headers: { "content-type": "text/plain", origin: "https://evil.example" },
        body: "{}"
      })
    );
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.response.status).toBe(415);

    const accepted = await readJsonMutationBody(
      new Request("https://daily.example/api/feedback/actions", {
        method: "POST",
        headers: {
          "content-type": "application/json; charset=utf-8",
          origin: "https://daily.example",
          "sec-fetch-site": "same-origin"
        },
        body: '{"action":"save"}'
      })
    );
    expect(accepted).toEqual({ ok: true, value: { action: "save" } });
  });

  it("preserves local JSON parsing without an Origin header", async () => {
    process.env.DEPLOYMENT_MODE = "local";
    const result = await readJsonMutationBody(
      new Request("http://localhost/api/example", { method: "POST", body: "{}" })
    );
    expect(result).toEqual({ ok: true, value: {} });
  });
});

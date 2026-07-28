import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OperationsDispatcherUnavailableError, OperationsError } from "../../../../modules/operations";
import { handleOperationsRetry } from "./route";

const originalMode = process.env.DEPLOYMENT_MODE;

describe("POST /api/operations/retry", () => {
  beforeEach(() => {
    process.env.DEPLOYMENT_MODE = "cloud";
  });

  afterEach(() => {
    if (originalMode === undefined) delete process.env.DEPLOYMENT_MODE;
    else process.env.DEPLOYMENT_MODE = originalMode;
  });

  it("requires Access before parsing or loading a run", async () => {
    const getRetryDispatch = vi.fn();
    const dispatcher = { dispatchDaily: vi.fn() };
    const response = await handleOperationsRetry(cloudRequest({ action: "retry", runId: "run-1" }), {
      getRetryDispatch,
      dispatcher,
      verifyAccess: vi.fn().mockResolvedValue({ ok: false, code: "ACCESS_TOKEN_REQUIRED" }),
      isCloud: () => true
    });
    expect(response.status).toBe(403);
    expect(getRetryDispatch).not.toHaveBeenCalled();
    expect(dispatcher.dispatchDaily).not.toHaveBeenCalled();
  });

  it("requires same-origin JSON", async () => {
    const getRetryDispatch = vi.fn();
    const response = await handleOperationsRetry(new Request("https://daily.example/api/operations/retry", {
      method: "POST",
      headers: { "content-type": "text/plain", origin: "https://evil.example" },
      body: "{}"
    }), dependencies({ getRetryDispatch }));
    expect(response.status).toBe(415);
    expect(getRetryDispatch).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { action: "resume", runId: "run-1" },
    { action: "retry", runId: "run-1", runDate: "2026-01-01" },
    { action: "retry", runId: "run-1", workflow: "evil.yml" },
    { action: "retry", runId: "run-1", ref: "attacker" },
    { action: "retry", runId: "run-1", shell: "rm -rf" },
    { action: "retry", runId: "../run" }
  ])("strictly rejects non-contract body %j", async (body) => {
    const getRetryDispatch = vi.fn();
    const response = await handleOperationsRetry(cloudRequest(body), dependencies({ getRetryDispatch }));
    expect(response.status).toBe(400);
    expect(getRetryDispatch).not.toHaveBeenCalled();
  });

  it("loads eligibility then dispatches only the derived date", async () => {
    const getRetryDispatch = vi.fn().mockResolvedValue({ runDate: "2026-07-27" });
    const dispatchDaily = vi.fn().mockResolvedValue(undefined);
    const response = await handleOperationsRetry(
      cloudRequest({ action: "retry", runId: "run-1" }),
      dependencies({ getRetryDispatch, dispatcher: { dispatchDaily } })
    );
    expect(response.status).toBe(202);
    expect(getRetryDispatch).toHaveBeenCalledWith("run-1");
    expect(dispatchDaily).toHaveBeenCalledWith({ runDate: "2026-07-27" });
    await expect(response.json()).resolves.toEqual({
      status: "accepted",
      action: "retry",
      runId: "run-1",
      runDate: "2026-07-27"
    });
  });

  it("preserves eligibility conflicts and reports unavailable dispatch as 503", async () => {
    const conflict = await handleOperationsRetry(
      cloudRequest({ action: "retry", runId: "run-1" }),
      dependencies({
        getRetryDispatch: vi.fn().mockRejectedValue(new OperationsError("RUN_ALREADY_RUNNING", "running", 409))
      })
    );
    expect(conflict.status).toBe(409);

    const unavailable = await handleOperationsRetry(
      cloudRequest({ action: "retry", runId: "run-1" }),
      dependencies({
        dispatcher: { dispatchDaily: vi.fn().mockRejectedValue(new OperationsDispatcherUnavailableError()) }
      })
    );
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toMatchObject({ code: "OPERATIONS_DISPATCH_UNAVAILABLE" });
  });
});

function cloudRequest(body: unknown) {
  return new Request("https://daily.example/api/operations/retry", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://daily.example",
      "sec-fetch-site": "same-origin"
    },
    body: JSON.stringify(body)
  });
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    getRetryDispatch: vi.fn().mockResolvedValue({ runDate: "2026-07-27" }),
    dispatcher: { dispatchDaily: vi.fn().mockResolvedValue(undefined) },
    verifyAccess: vi.fn().mockResolvedValue({ ok: true }),
    isCloud: () => true,
    ...overrides
  } as Parameters<typeof handleOperationsRetry>[1];
}

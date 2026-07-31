import { describe, expect, it, vi } from "vitest";

import {
  buildDailyWorkflowDispatchRequest,
  DAILY_SCHEDULER_CRON,
  dispatchDailyWorkflow,
  handleDailySchedule
} from "./daily-scheduler";

const scheduledTime = Date.parse("2026-07-31T00:15:00.000Z");

function deterministicClock(): () => number {
  const values = [100, 107];
  return () => values.shift() ?? 107;
}

describe("Cloudflare daily scheduler", () => {
  it("maps 08:15 Asia/Shanghai to the exact UTC Cron and previous UTC business date", async () => {
    expect(DAILY_SCHEDULER_CRON).toBe("15 0 * * *");
    const beijingClock = new Date(scheduledTime + 8 * 60 * 60 * 1000);
    expect([beijingClock.getUTCHours(), beijingClock.getUTCMinutes()]).toEqual([8, 15]);

    const result = await dispatchDailyWorkflow(scheduledTime, "test-token", {
      fetchImpl: vi.fn<typeof fetch>(async () => new Response(null, { status: 204 })),
      clock: deterministicClock()
    });

    expect(result).toEqual({
      scheduledTime,
      targetBusinessDate: "2026-07-30",
      dispatchStatus: "success",
      httpStatusCategory: "2xx",
      duration: 7
    });
  });

  it("builds one fixed daily.yml dispatch with master and an explicit runDate", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }));

    await dispatchDailyWorkflow(scheduledTime, "worker-secret", {
      fetchImpl,
      clock: deterministicClock()
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(
      "https://api.github.com/repos/linyuan701/daily-paper/actions/workflows/daily.yml/dispatches"
    );
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer worker-secret");
    expect(new Headers(init?.headers).get("X-GitHub-Api-Version")).toBe("2026-03-10");
    expect(JSON.parse(String(init?.body))).toEqual({
      ref: "master",
      inputs: { runDate: "2026-07-30" }
    });
  });

  it.each([
    [204, "success", "2xx"],
    [401, "auth_error", "4xx"],
    [403, "auth_error", "4xx"],
    [404, "workflow_not_found", "4xx"],
    [429, "rate_limited", "4xx"],
    [500, "dispatch_failed", "5xx"]
  ] as const)("classifies HTTP %s without retrying", async (status, expectedStatus, category) => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(status === 204 ? null : "sensitive response content", { status })
    );

    const result = await dispatchDailyWorkflow(scheduledTime, "test-token", {
      fetchImpl,
      clock: deterministicClock()
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.dispatchStatus).toBe(expectedStatus);
    expect(result.httpStatusCategory).toBe(category);
  });

  it("classifies a network failure and performs exactly one attempt", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new Error("response contained a private upstream diagnostic");
    });

    const result = await dispatchDailyWorkflow(scheduledTime, "test-token", {
      fetchImpl,
      clock: deterministicClock()
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.dispatchStatus).toBe("dispatch_failed");
    expect(result.httpStatusCategory).toBe("network");
    expect(JSON.stringify(result)).not.toContain("private upstream diagnostic");
  });

  it("fails closed without a secret and never calls GitHub", async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    const result = await dispatchDailyWorkflow(scheduledTime, undefined, {
      fetchImpl,
      clock: deterministicClock()
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.dispatchStatus).toBe("dispatch_failed");
    expect(result.httpStatusCategory).toBe("not_attempted");
  });

  it("disables Cron retries and emits only the five approved sanitized fields", async () => {
    const noRetry = vi.fn();
    const logger = { log: vi.fn(), error: vi.fn() };

    await handleDailySchedule(
      { scheduledTime, noRetry },
      { DAILY_SCHEDULER_GITHUB_TOKEN: "never-log-this-token" },
      {
        fetchImpl: vi.fn<typeof fetch>(async () => new Response(null, { status: 403 })),
        clock: deterministicClock(),
        logger
      }
    );

    expect(noRetry).toHaveBeenCalledOnce();
    expect(logger.log).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledOnce();
    const serialized = logger.error.mock.calls[0][0];
    const parsed = JSON.parse(serialized);
    expect(Object.keys(parsed).sort()).toEqual([
      "dispatchStatus",
      "duration",
      "httpStatusCategory",
      "scheduledTime",
      "targetBusinessDate"
    ]);
    expect(serialized).not.toContain("never-log-this-token");
    expect(serialized).not.toContain("Authorization");
  });

  it("never creates a request with an omitted or implicit runDate", () => {
    expect(() =>
      buildDailyWorkflowDispatchRequest(
        "",
        "test-token",
        new AbortController().signal
      )
    ).toThrow(/runDate must use the exact YYYY-MM-DD format/);
    const [, init] = buildDailyWorkflowDispatchRequest(
      "2026-07-30",
      "test-token",
      new AbortController().signal
    );
    expect(JSON.parse(String(init.body)).inputs).toEqual({ runDate: "2026-07-30" });
  });
});

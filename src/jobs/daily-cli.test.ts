import { describe, expect, it, vi } from "vitest";

import { dailyJobExitCode, executeDailyJobCli, parseDailyJobArgs } from "./daily-cli";

describe("daily cloud CLI contract", () => {
  it("accepts an omitted date or a strict UTC calendar date", () => {
    expect(parseDailyJobArgs([])).toEqual({});
    expect(parseDailyJobArgs(["--run-date", "2026-07-27"])).toEqual({ runDate: "2026-07-27" });
  });

  it.each([
    ["--run-date"],
    ["--run-date", ""],
    ["--run-date", " 2026-07-27"],
    ["--run-date", "2026-07-27T00:00:00Z"],
    ["--run-date", "2026-02-30"],
    ["--unknown", "2026-07-27"],
    ["--run-date", "2026-07-27", "--run-date", "2026-07-28"]
  ])("rejects invalid arguments: %j", (...args) => {
    expect(() => parseDailyJobArgs(args as string[])).toThrow();
  });

  it.each([
    [{ status: "complete", disposition: "executed", retryable: false }, 0],
    [{ status: "complete_with_warnings", disposition: "executed", retryable: false }, 0],
    [{ status: "complete", disposition: "already_succeeded", retryable: false }, 0],
    [{ status: "partial", disposition: "executed", retryable: false }, 0],
    [{ status: "partial", disposition: "resumed", retryable: true }, 1],
    [{ status: "failed", disposition: "executed", retryable: true }, 1],
    [{ status: "running", disposition: "already_running", retryable: false }, 0]
  ] as const)("maps %j to exit code %i", (result, exitCode) => {
    expect(dailyJobExitCode(result)).toBe(exitCode);
  });

  it("writes a redacted result and disconnects after success", async () => {
    const writeResult = vi.fn();
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const exitCode = await executeDailyJobCli(["--run-date", "2026-07-27"], {
      runPipeline: vi.fn().mockResolvedValue({
        status: "complete",
        disposition: "executed",
        runId: "run-1",
        retryable: false,
        startedAt: "",
        finishedAt: "",
        sources: [],
        stages: []
      }),
      writeResult,
      disconnect
    });

    expect(exitCode).toBe(0);
    expect(writeResult).toHaveBeenCalledWith({
      status: "complete",
      disposition: "executed",
      runId: "run-1",
      failedStage: undefined,
      retryable: false
    });
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("keeps the persisted pipeline exit code when optional notification fails", async () => {
    const warn = vi.fn();
    const writeResult = vi.fn();
    const writeNotificationResult = vi.fn();
    const pipeline = {
      status: "complete" as const,
      disposition: "executed" as const,
      runId: "run-1",
      retryable: false,
      startedAt: "",
      finishedAt: "",
      sources: [],
      stages: []
    };

    const exitCode = await executeDailyJobCli([], {
      runPipeline: vi.fn().mockResolvedValue(pipeline),
      notify: vi.fn().mockRejectedValue(new Error("provider output containing a secret")),
      writeNotificationResult,
      warn,
      writeResult,
      disconnect: vi.fn().mockResolvedValue(undefined)
    });

    expect(exitCode).toBe(0);
    expect(writeResult).toHaveBeenCalledWith(expect.objectContaining({ status: "complete", runId: "run-1" }));
    expect(warn).toHaveBeenCalledWith("Optional daily notification failed after persistence");
    expect(writeNotificationResult).toHaveBeenCalledWith({
      event: "daily_notification",
      runId: "run-1",
      runStatus: "complete",
      deliveryStatus: "failed",
      channel: "none",
      errorCategory: "notification_internal"
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain("provider output containing a secret");
    expect(JSON.stringify(writeNotificationResult.mock.calls)).not.toContain("provider output containing a secret");
  });

  it("writes a bounded structured daily_notification success result", async () => {
    const writeNotificationResult = vi.fn();
    await executeDailyJobCli([], {
      runPipeline: vi.fn().mockResolvedValue({
        status: "complete_with_warnings",
        disposition: "executed",
        runId: "run-1",
        retryable: false,
        startedAt: "",
        finishedAt: "",
        sources: [],
        stages: []
      }),
      notify: vi.fn().mockResolvedValue({
        deliveryStatus: "sent",
        channel: "email",
        businessDate: "2026-07-30",
        recommendationCount: 12,
        warningSummary: "失败来源：journal"
      }),
      writeNotificationResult,
      writeResult: vi.fn(),
      disconnect: vi.fn().mockResolvedValue(undefined)
    });

    expect(writeNotificationResult).toHaveBeenCalledWith({
      event: "daily_notification",
      runId: "run-1",
      runStatus: "complete_with_warnings",
      deliveryStatus: "sent",
      channel: "email",
      businessDate: "2026-07-30",
      recommendationCount: 12,
      warningSummary: "失败来源：journal"
    });
  });

  it("returns failure and disconnects after parser or pipeline exceptions", async () => {
    const writeResult = vi.fn();
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const runPipeline = vi.fn();
    const exitCode = await executeDailyJobCli(["--run-date", "invalid"], {
      runPipeline,
      writeResult,
      disconnect
    });

    expect(exitCode).toBe(1);
    expect(runPipeline).not.toHaveBeenCalled();
    expect(writeResult).toHaveBeenCalledWith({
      status: "failed",
      disposition: "executed",
      retryable: false
    });
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("suppresses notifications only for active runs", async () => {
    const notify = vi.fn();
    const writeNotificationResult = vi.fn();
    await executeDailyJobCli([], {
      runPipeline: vi.fn().mockResolvedValue({
        status: "running",
        disposition: "already_running",
        runId: "run-1",
        retryable: false,
        startedAt: "",
        finishedAt: "",
        sources: [],
        stages: []
      }),
      notify,
      writeNotificationResult,
      writeResult: vi.fn(),
      disconnect: vi.fn().mockResolvedValue(undefined)
    });
    expect(notify).not.toHaveBeenCalled();
    expect(writeNotificationResult).toHaveBeenCalledWith({
      event: "daily_notification",
      runId: "run-1",
      runStatus: "running",
      deliveryStatus: "skipped",
      channel: "none",
      reason: "already_running"
    });
  });

  it("lets persisted delivery state deduplicate an already-succeeded run", async () => {
    const writeNotificationResult = vi.fn();
    const notify = vi.fn().mockResolvedValue({
      deliveryStatus: "skipped",
      channel: "none",
      businessDate: "2026-07-30",
      reason: "already_sent",
      deduplicated: true
    });
    await executeDailyJobCli([], {
      runPipeline: vi.fn().mockResolvedValue({
        status: "complete",
        disposition: "already_succeeded",
        runId: "run-1",
        retryable: false,
        startedAt: "",
        finishedAt: "",
        sources: [],
        stages: []
      }),
      notify,
      writeNotificationResult,
      writeResult: vi.fn(),
      disconnect: vi.fn().mockResolvedValue(undefined)
    });

    expect(notify).toHaveBeenCalledOnce();
    expect(writeNotificationResult).toHaveBeenCalledWith(expect.objectContaining({
      runId: "run-1",
      deliveryStatus: "skipped",
      reason: "already_sent",
      deduplicated: true
    }));
  });
});

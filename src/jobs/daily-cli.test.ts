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
    [{ status: "complete", retryable: false }, 0],
    [{ status: "already_succeeded", retryable: false }, 0],
    [{ status: "partial", retryable: false }, 0],
    [{ status: "partial", retryable: true }, 1],
    [{ status: "failed", retryable: true }, 1],
    [{ status: "already_running", retryable: false }, 1]
  ] as const)("maps %j to exit code %i", (result, exitCode) => {
    expect(dailyJobExitCode(result)).toBe(exitCode);
  });

  it("writes a redacted result and disconnects after success", async () => {
    const writeResult = vi.fn();
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const exitCode = await executeDailyJobCli(["--run-date", "2026-07-27"], {
      runPipeline: vi.fn().mockResolvedValue({
        status: "complete",
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
      runId: "run-1",
      failedStage: undefined,
      retryable: false
    });
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("keeps the persisted pipeline exit code when optional notification fails", async () => {
    const warn = vi.fn();
    const writeResult = vi.fn();
    const pipeline = {
      status: "complete" as const,
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
      warn,
      writeResult,
      disconnect: vi.fn().mockResolvedValue(undefined)
    });

    expect(exitCode).toBe(0);
    expect(writeResult).toHaveBeenCalledWith(expect.objectContaining({ status: "complete", runId: "run-1" }));
    expect(warn).toHaveBeenCalledWith("Optional daily notification failed after persistence");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("provider output containing a secret");
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
    expect(writeResult).toHaveBeenCalledWith({ status: "failed", retryable: false });
    expect(disconnect).toHaveBeenCalledOnce();
  });
});

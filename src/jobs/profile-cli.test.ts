import { describe, expect, it, vi } from "vitest";

import { executeProfileCli, parseProfileArgs } from "./profile-cli";

describe("cloud profile CLI", () => {
  it("accepts only explicit sync and refresh operations", () => {
    expect(parseProfileArgs(["--operation", "sync"])).toBe("sync");
    expect(parseProfileArgs(["--operation", "refresh"])).toBe("refresh");
    expect(() => parseProfileArgs([])).toThrow();
    expect(() => parseProfileArgs(["--operation", "all"])).toThrow();
    expect(() => parseProfileArgs(["--operation", "sync", "extra"])).toThrow();
  });

  it("disconnects after a successful operation", async () => {
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const writeResult = vi.fn();
    const exitCode = await executeProfileCli(["--operation", "sync"], {
      run: vi.fn().mockResolvedValue({
        operation: "sync",
        status: "complete",
        syncRunId: "sync-1",
        itemsCount: 2,
        collectionsCount: 1,
        mappingsCount: 2,
        selectableCollections: 1,
        selectedCollections: 0
      }),
      disconnect,
      writeResult
    });

    expect(exitCode).toBe(0);
    expect(writeResult).toHaveBeenCalledWith(expect.objectContaining({ status: "complete" }));
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("returns a sanitized failure and disconnects", async () => {
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const writeResult = vi.fn();
    const exitCode = await executeProfileCli(["--operation", "refresh"], {
      run: vi.fn().mockRejectedValue(new Error("postgresql://secret.example/db")),
      disconnect,
      writeResult
    });

    expect(exitCode).toBe(1);
    expect(writeResult).toHaveBeenCalledWith({ operation: "refresh", status: "failed" });
    expect(JSON.stringify(writeResult.mock.calls)).not.toContain("secret.example");
    expect(disconnect).toHaveBeenCalledOnce();
  });
});

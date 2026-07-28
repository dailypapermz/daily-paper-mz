import { describe, expect, it, vi } from "vitest";

import { handleOperationsRuns } from "./route";

describe("GET /api/operations/runs", () => {
  it("requires Access again in cloud and performs no read when denied", async () => {
    const listRecentRuns = vi.fn();
    const response = await handleOperationsRuns(
      new Request("https://daily.example/api/operations/runs"),
      {
        listRecentRuns,
        verifyAccess: vi.fn().mockResolvedValue({ ok: false, code: "ACCESS_TOKEN_REQUIRED" }),
        isCloud: () => true
      }
    );
    expect(response.status).toBe(403);
    expect(listRecentRuns).not.toHaveBeenCalled();
  });

  it("strictly validates bounds", async () => {
    const listRecentRuns = vi.fn();
    const response = await handleOperationsRuns(
      new Request("http://localhost/api/operations/runs?limit=31"),
      {
        listRecentRuns,
        verifyAccess: vi.fn(),
        isCloud: () => false
      }
    );
    expect(response.status).toBe(400);
    expect(listRecentRuns).not.toHaveBeenCalled();
  });

  it("returns a bounded no-store projection", async () => {
    const listRecentRuns = vi.fn().mockResolvedValue([{ runId: "run-1" }]);
    const response = await handleOperationsRuns(
      new Request("http://localhost/api/operations/runs?limit=5"),
      { listRecentRuns, verifyAccess: vi.fn(), isCloud: () => false }
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(listRecentRuns).toHaveBeenCalledWith(5);
  });

  it("logs only sanitized diagnostics when a production read fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const response = await handleOperationsRuns(
        new Request("http://localhost/api/operations/runs"),
        {
          listRecentRuns: vi.fn().mockRejectedValue(
            new Error("postgresql://operator:password@private.example/daily?token=secret")
          ),
          verifyAccess: vi.fn(),
          isCloud: () => false
        }
      );

      expect(response.status).toBe(500);
      expect(consoleError).toHaveBeenCalledWith("Operations runs read failed", {
        name: "Error",
        message: "[database url]"
      });
    } finally {
      consoleError.mockRestore();
    }
  });
});

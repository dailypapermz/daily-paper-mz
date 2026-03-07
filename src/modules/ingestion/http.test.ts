import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchWithRetry } from "./http";

describe("fetchWithRetry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retries retryable statuses and returns the successful response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200
      } as Response);

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const response = await fetchWithRetry("https://example.org", undefined, {
      maxRetries: 2,
      backoffMs: 0
    });

    expect(response.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausted retries for network errors", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await expect(
      fetchWithRetry("https://example.org", undefined, {
        maxRetries: 1,
        backoffMs: 0
      })
    ).rejects.toThrow("network down");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

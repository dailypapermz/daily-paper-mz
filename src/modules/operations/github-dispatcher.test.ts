import { describe, expect, it, vi } from "vitest";

import {
  GitHubOperationsDispatcher,
  OperationsDispatcherUnavailableError
} from "./github-dispatcher";

describe("GitHubOperationsDispatcher", () => {
  it("dispatches only fixed daily.yml with the exact stored-date payload", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const dispatcher = new GitHubOperationsDispatcher({
      OPERATIONS_GITHUB_OWNER: "paper-owner",
      OPERATIONS_GITHUB_REPO: "daily-paper",
      OPERATIONS_GITHUB_TOKEN: "server-secret",
      OPERATIONS_GITHUB_REF: "main"
    }, fetchImpl);

    await dispatcher.dispatchDaily({ runDate: "2026-07-27" });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.github.com/repos/paper-owner/daily-paper/actions/workflows/daily.yml/dispatches",
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: "Bearer server-secret",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28"
        },
        body: JSON.stringify({ ref: "main", inputs: { runDate: "2026-07-27" } })
      }
    );
  });

  it("reports missing configuration honestly and does not call GitHub", async () => {
    const fetchImpl = vi.fn();
    const dispatcher = new GitHubOperationsDispatcher({}, fetchImpl);
    await expect(dispatcher.dispatchDaily({ runDate: "2026-07-27" }))
      .rejects.toBeInstanceOf(OperationsDispatcherUnavailableError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

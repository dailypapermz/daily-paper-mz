import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRefreshStatus: vi.fn(),
  runManualRefresh: vi.fn()
}));

vi.mock("../../../../modules/profile-build", () => ({
  createProfileRefreshService: () => ({
    getRefreshStatus: mocks.getRefreshStatus,
    runManualRefresh: mocks.runManualRefresh
  })
}));

import { GET, POST } from "./route";

describe("/api/profile/refresh", () => {
  beforeEach(() => {
    mocks.getRefreshStatus.mockReset();
    mocks.runManualRefresh.mockReset();
  });

  it("returns refresh status on GET", async () => {
    mocks.getRefreshStatus.mockResolvedValueOnce({
      latestJob: null,
      activeSnapshot: null,
      latestReminder: null
    });

    const response = await GET();
    const payload = (await response.json()) as { status: string };

    expect(response.status).toBe(200);
    expect(payload.status).toBe("ok");
  });

  it("triggers manual refresh on POST", async () => {
    mocks.runManualRefresh.mockResolvedValueOnce({
      job: {
        id: "job-1",
        trigger: "manual",
        status: "success",
        startedAt: "2026-03-07T00:00:00.000Z"
      },
      snapshot: {
        id: "snapshot-1",
        status: "active",
        builtAt: "2026-03-07T00:00:00.000Z",
        itemsCount: 1,
        segments: { recentCore: 1, stableLongTerm: 0, background: 0 },
        researchTypePreferences: []
      }
    });

    const response = await POST();
    const payload = (await response.json()) as {
      status: string;
      job: { id: string };
      snapshot: { id: string };
    };

    expect(response.status).toBe(200);
    expect(payload.status).toBe("ok");
    expect(payload.job.id).toBe("job-1");
    expect(payload.snapshot.id).toBe("snapshot-1");
  });
});

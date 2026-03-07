import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runMonthlyReminderCheck: vi.fn()
}));

vi.mock("../../../../modules/profile-build", () => ({
  createProfileRefreshService: () => ({
    runMonthlyReminderCheck: mocks.runMonthlyReminderCheck
  })
}));

import { GET } from "./route";

describe("/api/profile/reminder", () => {
  beforeEach(() => {
    mocks.runMonthlyReminderCheck.mockReset();
  });

  it("returns monthly reminder check result", async () => {
    mocks.runMonthlyReminderCheck.mockResolvedValueOnce({
      id: "reminder-1",
      checkedAt: "2026-03-07T00:00:00.000Z",
      isDue: true,
      lastRefreshAt: "2026-02-01T00:00:00.000Z"
    });

    const response = await GET();
    const payload = (await response.json()) as { status: string; reminder: { isDue: boolean } };

    expect(response.status).toBe(200);
    expect(payload.status).toBe("ok");
    expect(payload.reminder.isDue).toBe(true);
  });
});

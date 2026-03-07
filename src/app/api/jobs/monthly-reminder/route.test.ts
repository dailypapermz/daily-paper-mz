import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runMonthlyProfileReminderCheck: vi.fn()
}));

vi.mock("../../../../modules/scheduler", () => ({
  runMonthlyProfileReminderCheck: mocks.runMonthlyProfileReminderCheck
}));

import { POST } from "./route";

describe("/api/jobs/monthly-reminder", () => {
  beforeEach(() => {
    mocks.runMonthlyProfileReminderCheck.mockReset();
  });

  it("runs monthly reminder check", async () => {
    mocks.runMonthlyProfileReminderCheck.mockResolvedValueOnce({
      id: "reminder-1",
      checkedAt: new Date().toISOString(),
      isDue: true
    });

    const response = await POST();
    const payload = (await response.json()) as { status: string };

    expect(response.status).toBe(200);
    expect(payload.status).toBe("ok");
    expect(mocks.runMonthlyProfileReminderCheck).toHaveBeenCalledTimes(1);
  });
});

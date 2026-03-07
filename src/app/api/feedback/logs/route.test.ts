import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listLogs: vi.fn()
}));

vi.mock("../../../../modules/feedback", () => ({
  createFeedbackService: () => ({
    listLogs: mocks.listLogs
  })
}));

import { GET } from "./route";

describe("/api/feedback/logs", () => {
  beforeEach(() => {
    mocks.listLogs.mockReset();
  });

  it("returns logs", async () => {
    mocks.listLogs.mockResolvedValueOnce([]);

    const response = await GET(new Request("http://localhost/api/feedback/logs?runId=run-1"));
    const payload = (await response.json()) as { status: string };

    expect(response.status).toBe(200);
    expect(payload.status).toBe("ok");
    expect(mocks.listLogs).toHaveBeenCalledWith({
      runId: "run-1",
      candidateId: undefined,
      limit: 100
    });
  });
});

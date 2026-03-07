import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  logTriageAction: vi.fn()
}));

vi.mock("../../../../modules/feedback", () => ({
  createFeedbackService: () => ({
    logTriageAction: mocks.logTriageAction
  })
}));

import { POST } from "./route";

describe("/api/feedback/actions", () => {
  beforeEach(() => {
    mocks.logTriageAction.mockReset();
  });

  it("validates payload", async () => {
    const response = await POST(
      new Request("http://localhost/api/feedback/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      })
    );

    expect(response.status).toBe(400);
  });

  it("logs triage action", async () => {
    mocks.logTriageAction.mockResolvedValueOnce({
      id: "log-1",
      runId: "run-1",
      candidateId: "candidate-1",
      actionType: "save",
      createdAt: new Date().toISOString()
    });

    const response = await POST(
      new Request("http://localhost/api/feedback/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: "run-1",
          candidateId: "candidate-1",
          action: "save"
        })
      })
    );

    const payload = (await response.json()) as { status: string };
    expect(response.status).toBe(200);
    expect(payload.status).toBe("ok");
    expect(mocks.logTriageAction).toHaveBeenCalledWith({
      runId: "run-1",
      candidateId: "candidate-1",
      action: "save",
      metadata: undefined
    });
  });
});

import { describe, expect, it, vi } from "vitest";

import { DefaultFeedbackService } from "./feedback.service";

describe("DefaultFeedbackService", () => {
  it("logs triage and edit feedback events", async () => {
    const repository = {
      appendLog: vi.fn().mockResolvedValue({
        id: "log-1",
        runId: "run-1",
        candidateId: "candidate-1",
        actionType: "save",
        createdAt: new Date().toISOString()
      }),
      listLogs: vi.fn().mockResolvedValue([])
    };

    const service = new DefaultFeedbackService(repository);
    await service.logTriageAction({
      runId: "run-1",
      candidateId: "candidate-1",
      action: "save"
    });
    await service.logLabelEdit({
      runId: "run-1",
      candidateId: "candidate-1",
      oldValue: { label: "old" },
      newValue: { label: "new" }
    });
    await service.logSummaryEdit({
      runId: "run-1",
      candidateId: "candidate-1",
      oldValue: { method: "m1" },
      newValue: { method: "m2" }
    });

    expect(repository.appendLog).toHaveBeenCalledTimes(3);
  });
});

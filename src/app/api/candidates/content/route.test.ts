import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listRunOutputs: vi.fn(),
  generateForRun: vi.fn(),
  updateCandidateOutput: vi.fn()
}));

vi.mock("../../../../modules/summary", () => ({
  createCandidateOutputService: () => ({
    listRunOutputs: mocks.listRunOutputs,
    generateForRun: mocks.generateForRun,
    updateCandidateOutput: mocks.updateCandidateOutput
  })
}));

import { GET, POST, PUT } from "./route";

describe("/api/candidates/content", () => {
  beforeEach(() => {
    mocks.listRunOutputs.mockReset();
    mocks.generateForRun.mockReset();
    mocks.updateCandidateOutput.mockReset();
  });

  it("validates runId on GET", async () => {
    const response = await GET(new Request("http://localhost/api/candidates/content"));
    expect(response.status).toBe(400);
  });

  it("returns outputs on GET", async () => {
    mocks.listRunOutputs.mockResolvedValueOnce([]);

    const response = await GET(new Request("http://localhost/api/candidates/content?runId=run-1"));
    const payload = (await response.json()) as { status: string };

    expect(response.status).toBe(200);
    expect(payload.status).toBe("ok");
    expect(mocks.listRunOutputs).toHaveBeenCalledWith("run-1");
  });

  it("triggers generation on POST", async () => {
    mocks.generateForRun.mockResolvedValueOnce({
      runId: "run-1",
      provider: "generic-llm",
      requested: 2,
      generated: 1,
      failed: 1,
      outputs: []
    });

    const response = await POST(
      new Request("http://localhost/api/candidates/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: "run-1", limit: 10 })
      })
    );
    const payload = (await response.json()) as { status: string; result: { runId: string } };

    expect(response.status).toBe(200);
    expect(payload.status).toBe("ok");
    expect(payload.result.runId).toBe("run-1");
    expect(mocks.generateForRun).toHaveBeenCalledWith({ runId: "run-1", limit: 10 });
  });

  it("updates candidate output on PUT", async () => {
    mocks.updateCandidateOutput.mockResolvedValueOnce({
      candidateId: "candidate-1",
      runId: "run-1",
      canonicalKey: "key",
      labels: {}
    });

    const response = await PUT(
      new Request("http://localhost/api/candidates/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: "candidate-1",
          summary: {
            researchQuestion: "RQ",
            method: "Method",
            mainFinding: "Finding",
            relevanceToUser: "Relevance"
          }
        })
      })
    );

    const payload = (await response.json()) as { status: string };
    expect(response.status).toBe(200);
    expect(payload.status).toBe("ok");
  });
});

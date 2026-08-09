import { describe, expect, it, vi } from "vitest";

import { AppError } from "../../lib/errors";
import { DefaultCandidateOutputService, runWithConcurrency } from "./candidate-output.service";

describe("DefaultCandidateOutputService", () => {
  it("enforces bounded concurrency while completing every item", async () => {
    let active = 0;
    let maximumActive = 0;
    const completed: number[] = [];

    const counts = await runWithConcurrency(
      [1, 2, 3, 4, 5, 6],
      2,
      async (item) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        completed.push(item);
        active -= 1;
      },
      () => undefined
    );

    expect(maximumActive).toBe(2);
    expect(completed).toHaveLength(6);
    expect(counts).toEqual({ succeeded: 6, failed: 0 });
  });
  it("generates and persists outputs with partial failure handling", async () => {
    const repository = {
      listCandidatesForGeneration: vi.fn().mockResolvedValue([
        {
          candidateId: "candidate-1",
          runId: "run-1",
          canonicalKey: "canon-1",
          sourceProvenance: []
        },
        {
          candidateId: "candidate-2",
          runId: "run-1",
          canonicalKey: "canon-2",
          sourceProvenance: []
        }
      ]),
      saveGeneratedOutput: vi.fn(),
      saveGeneratedLabels: vi.fn(),
      saveGeneratedSummary: vi.fn(),
      saveUserCorrectedOutput: vi.fn(),
      listRunOutputs: vi.fn().mockResolvedValue([]),
      listRunOutputsByCandidateId: vi.fn()
    };

    const provider = {
      name: "mock-provider",
      getHealth: () => ({ name: "mock-provider", status: "ready" as const }),
      generateLabels: vi.fn(),
      generateSummary: vi.fn(),
      generateOutput: vi
        .fn()
        .mockResolvedValueOnce({
          summary: {
            researchQuestion: "RQ1",
            method: "M1",
            mainFinding: "F1",
            relevanceToUser: "R1"
          },
          labels: {}
        })
        .mockRejectedValueOnce(new Error("provider failure"))
    };

    const service = new DefaultCandidateOutputService(repository, provider);
    const result = await service.generateForRun({
      runId: "run-1",
      limit: 10
    });

    expect(result.requested).toBe(2);
    expect(result.generated).toBe(1);
    expect(result.failed).toBe(1);
    expect(repository.saveGeneratedOutput).toHaveBeenCalledTimes(1);
    expect(repository.listCandidatesForGeneration).toHaveBeenCalledWith({
      runId: "run-1",
      limit: 10,
      selectedOnly: undefined
    });
  });

  it("forwards selectedOnly generation to the repository", async () => {
    const repository = {
      listCandidatesForGeneration: vi.fn().mockResolvedValue([]),
      saveGeneratedOutput: vi.fn(),
      saveGeneratedLabels: vi.fn(),
      saveGeneratedSummary: vi.fn(),
      saveUserCorrectedOutput: vi.fn(),
      listRunOutputs: vi.fn().mockResolvedValue([]),
      listRunOutputsByCandidateId: vi.fn()
    };

    const provider = {
      name: "mock-provider",
      getHealth: () => ({ name: "mock-provider", status: "ready" as const }),
      generateLabels: vi.fn(),
      generateSummary: vi.fn(),
      generateOutput: vi.fn()
    };

    const service = new DefaultCandidateOutputService(repository, provider);
    await service.generateForRun({
      runId: "run-1",
      limit: 20,
      selectedOnly: true
    });

    expect(repository.listCandidatesForGeneration).toHaveBeenCalledWith({
      runId: "run-1",
      limit: 20,
      selectedOnly: true
    });
  });

  it("saves user-corrected output and returns updated record", async () => {
    const repository = {
      listCandidatesForGeneration: vi.fn(),
      saveGeneratedOutput: vi.fn(),
      saveGeneratedLabels: vi.fn(),
      saveGeneratedSummary: vi.fn(),
      saveUserCorrectedOutput: vi.fn(),
      listRunOutputs: vi.fn(),
      listRunOutputsByCandidateId: vi.fn().mockResolvedValue([
        {
          candidateId: "candidate-1",
          runId: "run-1",
          canonicalKey: "canon-1",
          labels: {}
        }
      ])
    };

    const provider = {
      name: "mock-provider",
      getHealth: () => ({ name: "mock-provider", status: "ready" as const }),
      generateLabels: vi.fn(),
      generateSummary: vi.fn(),
      generateOutput: vi.fn()
    };

    const service = new DefaultCandidateOutputService(repository, provider);
    const updated = await service.updateCandidateOutput({
      candidateId: "candidate-1",
      summary: {
        researchQuestion: "RQ",
        method: "Method",
        mainFinding: "Finding",
        relevanceToUser: "Relevant"
      }
    });

    expect(repository.saveUserCorrectedOutput).toHaveBeenCalledTimes(1);
    expect(updated?.candidateId).toBe("candidate-1");
  });

  it("rejects empty update payload", async () => {
    const repository = {
      listCandidatesForGeneration: vi.fn(),
      saveGeneratedOutput: vi.fn(),
      saveGeneratedLabels: vi.fn(),
      saveGeneratedSummary: vi.fn(),
      saveUserCorrectedOutput: vi.fn(),
      listRunOutputs: vi.fn(),
      listRunOutputsByCandidateId: vi.fn()
    };
    const provider = {
      name: "mock-provider",
      getHealth: () => ({ name: "mock-provider", status: "ready" as const }),
      generateLabels: vi.fn(),
      generateSummary: vi.fn(),
      generateOutput: vi.fn()
    };
    const service = new DefaultCandidateOutputService(repository, provider);

    await expect(service.updateCandidateOutput({ candidateId: "candidate-1" })).rejects.toBeInstanceOf(
      AppError
    );
  });

  it("generates ranking labels for all run candidates before selection", async () => {
    const repository = {
      listCandidatesForGeneration: vi.fn().mockResolvedValue([
        { candidateId: "candidate-1", runId: "run-1", canonicalKey: "canon-1", sourceProvenance: [] },
        { candidateId: "candidate-2", runId: "run-1", canonicalKey: "canon-2", sourceProvenance: [] }
      ]),
      saveGeneratedOutput: vi.fn(),
      saveGeneratedLabels: vi.fn(),
      saveGeneratedSummary: vi.fn(),
      saveUserCorrectedOutput: vi.fn(),
      listRunOutputs: vi.fn().mockResolvedValue([]),
      listRunOutputsByCandidateId: vi.fn()
    };
    const provider = {
      name: "mock-provider",
      getHealth: () => ({ name: "mock-provider", status: "ready" as const }),
      generateLabels: vi
        .fn()
        .mockResolvedValueOnce({ contentRecallLabel: "single-cell mapping" })
        .mockRejectedValueOnce(new Error("label failure")),
      generateSummary: vi.fn(),
      generateOutput: vi.fn()
    };

    const result = await new DefaultCandidateOutputService(repository, provider).generateLabelsForRun({
      runId: "run-1"
    });

    expect(repository.listCandidatesForGeneration).toHaveBeenCalledWith({
      runId: "run-1",
      limit: undefined,
      selectedOnly: undefined,
      missingOutput: "labels"
    });
    expect(repository.saveGeneratedLabels).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ requested: 2, generated: 1, failed: 1 });
  });

  it("does not let unsupported cancer single-cell terms monopolize the label budget", async () => {
    const candidates = [
      {
        candidateId: "candidate-cancer-single-cell",
        runId: "run-1",
        canonicalKey: "canon-1",
        title: "Single-cell tumor atlas for cancer patient stratification",
        sourceProvenance: []
      },
      {
        candidateId: "candidate-comparative",
        runId: "run-1",
        canonicalKey: "canon-2",
        title: "Cross-species comparative genomics of evolutionary conservation",
        sourceProvenance: []
      }
    ];
    const repository = {
      listCandidatesForGeneration: vi.fn().mockResolvedValue(candidates),
      saveGeneratedOutput: vi.fn(),
      saveGeneratedLabels: vi.fn(),
      saveGeneratedSummary: vi.fn(),
      saveUserCorrectedOutput: vi.fn(),
      listRunOutputs: vi.fn().mockResolvedValue([]),
      listRunOutputsByCandidateId: vi.fn()
    };
    const provider = {
      name: "mock-provider",
      getHealth: () => ({ name: "mock-provider", status: "ready" as const }),
      generateLabelsBatch: vi.fn().mockImplementation(async (batch: typeof candidates) =>
        batch.map((candidate) => ({
          candidateId: candidate.candidateId,
          labels: { contentRecallLabel: "comparative genomics" }
        }))
      ),
      generateLabels: vi.fn(),
      generateSummary: vi.fn(),
      generateOutput: vi.fn()
    };

    const result = await new DefaultCandidateOutputService(repository, provider, {
      labelCandidateLimit: 1
    }).generateLabelsForRun({ runId: "run-1" });

    expect(provider.generateLabelsBatch).toHaveBeenCalledWith([
      expect.objectContaining({ candidateId: "candidate-comparative" })
    ]);
    expect(result.requested).toBe(1);
  });

  it("falls back to isolated label generation when a batch fails", async () => {
    const candidates = [
      { candidateId: "candidate-1", runId: "run-1", canonicalKey: "canon-1", sourceProvenance: [] },
      { candidateId: "candidate-2", runId: "run-1", canonicalKey: "canon-2", sourceProvenance: [] }
    ];
    const repository = {
      listCandidatesForGeneration: vi.fn().mockResolvedValue(candidates),
      saveGeneratedOutput: vi.fn(),
      saveGeneratedLabels: vi.fn(),
      saveGeneratedSummary: vi.fn(),
      saveUserCorrectedOutput: vi.fn(),
      listRunOutputs: vi.fn().mockResolvedValue([]),
      listRunOutputsByCandidateId: vi.fn()
    };
    const provider = {
      name: "mock-provider",
      getHealth: () => ({ name: "mock-provider", status: "ready" as const }),
      generateLabelsBatch: vi.fn().mockRejectedValue(new Error("invalid batch")),
      generateLabels: vi.fn().mockResolvedValue({ contentRecallLabel: "fallback" }),
      generateSummary: vi.fn(),
      generateOutput: vi.fn()
    };

    const result = await new DefaultCandidateOutputService(repository, provider).generateLabelsForRun({
      runId: "run-1"
    });

    expect(provider.generateLabelsBatch).toHaveBeenCalledTimes(1);
    expect(provider.generateLabels).toHaveBeenCalledTimes(2);
    expect(repository.saveGeneratedLabels).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ requested: 2, generated: 2, failed: 0 });
  });

  it("preserves partial persistence semantics when NVIDIA batch fallback has an isolated failure", async () => {
    const candidates = [
      { candidateId: "candidate-1", runId: "run-1", canonicalKey: "canon-1", sourceProvenance: [] },
      { candidateId: "candidate-2", runId: "run-1", canonicalKey: "canon-2", sourceProvenance: [] }
    ];
    const repository = {
      listCandidatesForGeneration: vi.fn().mockResolvedValue(candidates),
      saveGeneratedOutput: vi.fn(),
      saveGeneratedLabels: vi.fn(),
      saveGeneratedSummary: vi.fn(),
      saveUserCorrectedOutput: vi.fn(),
      listRunOutputs: vi.fn().mockResolvedValue([]),
      listRunOutputsByCandidateId: vi.fn()
    };
    const provider = {
      name: "nvidia-nim",
      getHealth: () => ({ name: "nvidia-nim", status: "ready" as const }),
      generateLabelsBatch: vi.fn().mockRejectedValue(new Error("batch response invalid")),
      generateLabels: vi
        .fn()
        .mockResolvedValueOnce({ contentRecallLabel: "validated fallback" })
        .mockRejectedValueOnce(new Error("individual response invalid")),
      generateSummary: vi.fn(),
      generateOutput: vi.fn()
    };

    const result = await new DefaultCandidateOutputService(repository, provider).generateLabelsForRun({
      runId: "run-1"
    });

    expect(provider.generateLabelsBatch).toHaveBeenCalledTimes(1);
    expect(provider.generateLabels).toHaveBeenCalledTimes(2);
    expect(repository.saveGeneratedLabels).toHaveBeenCalledTimes(1);
    expect(repository.saveGeneratedLabels).toHaveBeenCalledWith({
      candidateId: "candidate-1",
      provider: "nvidia-nim",
      labels: { contentRecallLabel: "validated fallback" }
    });
    expect(result).toMatchObject({
      provider: "nvidia-nim",
      requested: 2,
      generated: 1,
      failed: 1
    });
  });

  it("generates summaries only for selected top candidates by default", async () => {
    const repository = {
      listCandidatesForGeneration: vi.fn().mockResolvedValue([]),
      saveGeneratedOutput: vi.fn(),
      saveGeneratedLabels: vi.fn(),
      saveGeneratedSummary: vi.fn(),
      saveUserCorrectedOutput: vi.fn(),
      listRunOutputs: vi.fn().mockResolvedValue([]),
      listRunOutputsByCandidateId: vi.fn()
    };
    const provider = {
      name: "mock-provider",
      getHealth: () => ({ name: "mock-provider", status: "ready" as const }),
      generateLabels: vi.fn(),
      generateSummary: vi.fn(),
      generateOutput: vi.fn()
    };

    await new DefaultCandidateOutputService(repository, provider).generateSummariesForRun({
      runId: "run-1"
    });

    expect(repository.listCandidatesForGeneration).toHaveBeenCalledWith({
      runId: "run-1",
      limit: 20,
      selectedOnly: true,
      missingOutput: "summary"
    });
  });
});

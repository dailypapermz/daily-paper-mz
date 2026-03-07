import { describe, expect, it, vi } from "vitest";

import { AppError } from "../../lib/errors";
import { DefaultCandidateOutputService } from "./candidate-output.service";

describe("DefaultCandidateOutputService", () => {
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
      saveUserCorrectedOutput: vi.fn(),
      listRunOutputs: vi.fn().mockResolvedValue([]),
      listRunOutputsByCandidateId: vi.fn()
    };

    const provider = {
      name: "mock-provider",
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
  });

  it("saves user-corrected output and returns updated record", async () => {
    const repository = {
      listCandidatesForGeneration: vi.fn(),
      saveGeneratedOutput: vi.fn(),
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
      saveUserCorrectedOutput: vi.fn(),
      listRunOutputs: vi.fn(),
      listRunOutputsByCandidateId: vi.fn()
    };
    const provider = {
      name: "mock-provider",
      generateOutput: vi.fn()
    };
    const service = new DefaultCandidateOutputService(repository, provider);

    await expect(service.updateCandidateOutput({ candidateId: "candidate-1" })).rejects.toBeInstanceOf(
      AppError
    );
  });
});

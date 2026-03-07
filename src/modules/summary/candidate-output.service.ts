import { logger } from "../../lib/logging";
import { AppError } from "../../lib/errors";
import type {
  CandidateOutputGenerationResult,
  CandidateOutputProvider,
  CandidateOutputRecord,
  CandidateOutputRepository,
  CandidateOutputService,
  CandidateStructuredLabels,
  CandidateSummaryFields
} from "./types";

export class DefaultCandidateOutputService implements CandidateOutputService {
  constructor(
    private readonly repository: CandidateOutputRepository,
    private readonly provider: CandidateOutputProvider
  ) {}

  async generateForRun(input: { runId: string; limit?: number }): Promise<CandidateOutputGenerationResult> {
    const limit = input.limit && input.limit > 0 ? input.limit : 20;
    const candidates = await this.repository.listCandidatesForGeneration({
      runId: input.runId,
      limit
    });

    let generated = 0;
    let failed = 0;

    for (const candidate of candidates) {
      try {
        const output = await this.provider.generateOutput(candidate);
        await this.repository.saveGeneratedOutput({
          candidateId: candidate.candidateId,
          provider: this.provider.name,
          output
        });
        generated += 1;
      } catch (error) {
        failed += 1;

        logger.warn("Candidate output generation failed", {
          runId: input.runId,
          candidateId: candidate.candidateId,
          provider: this.provider.name,
          errorMessage: error instanceof Error ? error.message : "Unknown generation error"
        });
      }
    }

    const outputs = await this.repository.listRunOutputs(input.runId);

    return {
      runId: input.runId,
      provider: this.provider.name,
      requested: candidates.length,
      generated,
      failed,
      outputs
    };
  }

  async listRunOutputs(runId: string): Promise<CandidateOutputRecord[]> {
    return this.repository.listRunOutputs(runId);
  }

  async getCandidateOutput(candidateId: string): Promise<CandidateOutputRecord | null> {
    const [record] = await this.repository.listRunOutputsByCandidateId(candidateId);
    return record ?? null;
  }

  async updateCandidateOutput(input: {
    candidateId: string;
    summary?: CandidateSummaryFields;
    labels?: CandidateStructuredLabels;
  }): Promise<CandidateOutputRecord | null> {
    if (!input.summary && !input.labels) {
      throw new AppError("INVALID_CANDIDATE_OUTPUT_UPDATE", "summary or labels must be provided", 400);
    }

    await this.repository.saveUserCorrectedOutput({
      candidateId: input.candidateId,
      provider: "user",
      summary: input.summary,
      labels: input.labels
    });

    const [updated] = await this.repository.listRunOutputsByCandidateId(input.candidateId);
    return updated ?? null;
  }
}

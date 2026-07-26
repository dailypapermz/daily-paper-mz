import { logger } from "../../lib/logging";
import { AppError } from "../../lib/errors";
import { computeTopicHeuristicScore } from "../ranking/topic-heuristics";
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
  private readonly concurrency: number;
  private readonly labelCandidateLimit: number;

  constructor(
    private readonly repository: CandidateOutputRepository,
    private readonly provider: CandidateOutputProvider,
    options?: { concurrency?: number; labelCandidateLimit?: number }
  ) {
    this.concurrency = normalizeConcurrency(options?.concurrency);
    this.labelCandidateLimit = normalizeLabelLimit(options?.labelCandidateLimit);
  }

  getProviderHealth() {
    return { ...this.provider.getHealth(), concurrency: this.concurrency };
  }

  async generateLabelsForRun(input: {
    runId: string;
    limit?: number;
  }): Promise<CandidateOutputGenerationResult> {
    if (this.provider.generateLabelsBatch) {
      const candidates = await this.repository.listCandidatesForGeneration({
        runId: input.runId,
        missingOutput: "labels"
      });
      const selectedCandidates = prefilterLabelCandidates(
        candidates,
        input.limit ?? this.labelCandidateLimit
      );
      const batches = chunk(selectedCandidates, 5);
      let generated = 0;
      let failed = 0;
      await runWithConcurrency(
        batches,
        this.concurrency,
        async (batch) => {
          try {
            const outputs = await this.provider.generateLabelsBatch!(batch);
            for (const output of outputs) {
              await this.repository.saveGeneratedLabels({
                candidateId: output.candidateId,
                provider: this.provider.name,
                labels: output.labels
              });
            }
            generated += batch.length;
          } catch (batchError) {
            logger.warn("Candidate label batch falling back to individual generation", {
              runId: input.runId,
              candidateIds: batch.map((candidate) => candidate.candidateId),
              provider: this.provider.name,
              errorMessage: batchError instanceof Error ? batchError.message : "Unknown batch error"
            });
            for (const candidate of batch) {
              try {
                const labels = await this.provider.generateLabels(candidate);
                await this.repository.saveGeneratedLabels({
                  candidateId: candidate.candidateId,
                  provider: this.provider.name,
                  labels
                });
                generated += 1;
              } catch (error) {
                failed += 1;
                logger.warn("Candidate labels generation failed after batch fallback", {
                  runId: input.runId,
                  candidateId: candidate.candidateId,
                  provider: this.provider.name,
                  errorMessage: error instanceof Error ? error.message : "Unknown generation error"
                });
              }
            }
          }
        },
        (batch, error) => {
          failed += batch.length;
          logger.warn("Candidate label batch generation failed", {
            runId: input.runId,
            candidateIds: batch.map((candidate) => candidate.candidateId),
            provider: this.provider.name,
            errorMessage: error instanceof Error ? error.message : "Unknown generation error"
          });
        }
      );

      return {
        runId: input.runId,
        provider: this.provider.name,
        requested: selectedCandidates.length,
        generated,
        failed,
        outputs: await this.repository.listRunOutputs(input.runId)
      };
    }

    return this.generateStage({
      ...input,
      stage: "labels",
      generate: (candidate) => this.provider.generateLabels(candidate),
      save: (candidateId, labels) =>
        this.repository.saveGeneratedLabels({
          candidateId,
          provider: this.provider.name,
          labels
        })
    });
  }

  async generateSummariesForRun(input: {
    runId: string;
    limit?: number;
    selectedOnly?: boolean;
  }): Promise<CandidateOutputGenerationResult> {
    return this.generateStage({
      ...input,
      limit: input.limit ?? 20,
      selectedOnly: input.selectedOnly ?? true,
      stage: "summaries",
      generate: (candidate) => this.provider.generateSummary(candidate),
      save: (candidateId, summary) =>
        this.repository.saveGeneratedSummary({
          candidateId,
          provider: this.provider.name,
          summary
        })
    });
  }

  async generateForRun(input: {
    runId: string;
    limit?: number;
    selectedOnly?: boolean;
  }): Promise<CandidateOutputGenerationResult> {
    const limit = input.limit && input.limit > 0 ? input.limit : 20;
    const candidates = await this.repository.listCandidatesForGeneration({
      runId: input.runId,
      limit,
      selectedOnly: input.selectedOnly
    });

    const counts = await runWithConcurrency(candidates, this.concurrency, async (candidate) => {
        const output = await this.provider.generateOutput(candidate);
        await this.repository.saveGeneratedOutput({
          candidateId: candidate.candidateId,
          provider: this.provider.name,
          output
        });
      }, (candidate, error) => {
        logger.warn("Candidate output generation failed", {
          runId: input.runId,
          candidateId: candidate.candidateId,
          provider: this.provider.name,
          errorMessage: error instanceof Error ? error.message : "Unknown generation error"
        });
      });

    const outputs = await this.repository.listRunOutputs(input.runId);

    return {
      runId: input.runId,
      provider: this.provider.name,
      requested: candidates.length,
      generated: counts.succeeded,
      failed: counts.failed,
      outputs
    };
  }

  private async generateStage<T>(input: {
    runId: string;
    limit?: number;
    selectedOnly?: boolean;
    stage: "labels" | "summaries";
    generate: (candidate: Parameters<CandidateOutputProvider["generateOutput"]>[0]) => Promise<T>;
    save: (candidateId: string, value: T) => Promise<void>;
  }): Promise<CandidateOutputGenerationResult> {
    const candidates = await this.repository.listCandidatesForGeneration({
      runId: input.runId,
      limit: input.stage === "labels" ? undefined : input.limit,
      selectedOnly: input.selectedOnly,
      missingOutput: input.stage === "labels" ? "labels" : "summary"
    });
    const selectedCandidates = input.stage === "labels"
      ? prefilterLabelCandidates(candidates, input.limit ?? this.labelCandidateLimit)
      : candidates;
    const counts = await runWithConcurrency(selectedCandidates, this.concurrency, async (candidate) => {
        const value = await input.generate(candidate);
        await input.save(candidate.candidateId, value);
      }, (candidate, error) => {
        logger.warn(`Candidate ${input.stage} generation failed`, {
          runId: input.runId,
          candidateId: candidate.candidateId,
          provider: this.provider.name,
          errorMessage: error instanceof Error ? error.message : "Unknown generation error"
        });
      });

    return {
      runId: input.runId,
      provider: this.provider.name,
      requested: selectedCandidates.length,
      generated: counts.succeeded,
      failed: counts.failed,
      outputs: await this.repository.listRunOutputs(input.runId)
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

function prefilterLabelCandidates<T extends { candidateId: string; title?: string; abstractNote?: string }>(
  candidates: T[],
  limit: number
) {
  return [...candidates]
    .sort((left, right) => {
      const leftScore = computeTopicHeuristicScore(`${left.title ?? ""} ${left.abstractNote ?? ""}`, "");
      const rightScore = computeTopicHeuristicScore(`${right.title ?? ""} ${right.abstractNote ?? ""}`, "");
      return rightScore.score - rightScore.penalty - (leftScore.score - leftScore.penalty) ||
        left.candidateId.localeCompare(right.candidateId);
    })
    .slice(0, limit);
}

function normalizeLabelLimit(value?: number) {
  return value && Number.isInteger(value) && value > 0 ? value : 300;
}

function chunk<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

export async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<void>,
  onError: (item: T, error: unknown) => void
) {
  let nextIndex = 0;
  let succeeded = 0;
  let failed = 0;
  const workerCount = Math.min(normalizeConcurrency(concurrency), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const item = items[nextIndex];
        nextIndex += 1;
        try {
          await task(item);
          succeeded += 1;
        } catch (error) {
          failed += 1;
          onError(item, error);
        }
      }
    })
  );

  return { succeeded, failed };
}

function normalizeConcurrency(value?: number) {
  return value && Number.isInteger(value) && value > 0 ? Math.min(value, 20) : 4;
}

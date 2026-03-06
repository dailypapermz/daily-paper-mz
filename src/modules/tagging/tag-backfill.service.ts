import { AppError } from "../../lib/errors";
import { logger } from "../../lib/logging";
import type {
  TagBackfillRunResult,
  TagBackfillService,
  TagGenerationJobStatusValue,
  TagGenerationProvider,
  TagGenerationRepository
} from "./types";

export class DefaultTagBackfillService implements TagBackfillService {
  constructor(
    private readonly repository: TagGenerationRepository,
    private readonly provider: TagGenerationProvider
  ) {}

  async runBackfill(input?: { limit?: number }): Promise<TagBackfillRunResult> {
    const job = await this.repository.createGenerationJob({ provider: this.provider.name });

    let selectedItemsCount = 0;
    let missingItemsCount = 0;
    let generatedItemsCount = 0;
    let fallbackItemsCount = 0;

    try {
      const missingItems = await this.repository.listSelectedItemsMissingContentTags({
        limit: input?.limit
      });

      selectedItemsCount = missingItems.length;
      missingItemsCount = missingItems.length;

      for (const item of missingItems) {
        try {
          const generated = await this.provider.generateStructuredTags({
            zoteroItemKey: item.zoteroItemKey,
            title: item.title,
            abstractNote: item.abstractNote
          });

          await this.repository.replaceGeneratedStructuredTags({
            itemId: item.itemId,
            jobId: job.id,
            generated
          });

          await this.repository.appendGenerationJobItem({
            jobId: job.id,
            itemId: item.itemId,
            status: "generated",
            usedFallback: false
          });

          generatedItemsCount += 1;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown generation error";
          const unavailable = isUnavailableError(error);

          await this.repository.appendGenerationJobItem({
            jobId: job.id,
            itemId: item.itemId,
            status: unavailable ? "skipped_unavailable" : "failed",
            usedFallback: true,
            errorMessage
          });

          fallbackItemsCount += 1;

          logger.warn("Structured tag generation unavailable for selected item", {
            jobId: job.id,
            zoteroItemKey: item.zoteroItemKey,
            unavailable,
            errorMessage
          });
        }
      }

      const status = resolveBackfillStatus({
        missingItemsCount,
        generatedItemsCount,
        fallbackItemsCount
      });

      const finished = await this.repository.markGenerationJobFinished({
        jobId: job.id,
        status,
        selectedItemsCount,
        missingItemsCount,
        generatedItemsCount,
        fallbackItemsCount
      });

      return { job: finished };
    } catch (error) {
      const appError =
        error instanceof AppError
          ? error
          : new AppError(
              "TAG_BACKFILL_FAILED",
              error instanceof Error ? error.message : "Unknown backfill error"
            );

      await this.repository.markGenerationJobFinished({
        jobId: job.id,
        status: "failed",
        selectedItemsCount,
        missingItemsCount,
        generatedItemsCount,
        fallbackItemsCount,
        errorMessage: appError.message
      });

      logger.error("Structured tag backfill failed", {
        jobId: job.id,
        provider: this.provider.name,
        error: appError.message
      });

      throw appError;
    }
  }

  async getLatestJob() {
    return this.repository.getLatestGenerationJob();
  }
}

function resolveBackfillStatus(input: {
  missingItemsCount: number;
  generatedItemsCount: number;
  fallbackItemsCount: number;
}): TagGenerationJobStatusValue {
  if (input.missingItemsCount === 0) {
    return "success";
  }

  if (input.fallbackItemsCount === 0) {
    return "success";
  }

  return "partial";
}

function isUnavailableError(error: unknown): boolean {
  return error instanceof AppError && error.code === "TAG_GENERATION_UNAVAILABLE";
}

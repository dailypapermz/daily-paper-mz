import { logger } from "../../lib/logging";
import { createJournalEnrichmentService } from "../candidate-enrich";
import { createDailyIngestionService, type DailyCandidateSourceValue } from "../ingestion";
import { createCandidateNormalizationService } from "../normalize-dedupe";
import { createRecallRankingService } from "../ranking/recall";
import { createRerankService } from "../ranking/rerank";
import { createCandidateOutputService } from "../summary";

export type DailySchedulerSource = DailyCandidateSourceValue;

export type DailySchedulerSourceResult = {
  source: DailySchedulerSource;
  runId?: string;
  status: "success" | "failed";
  errorMessage?: string;
};

export type DailyPipelineRunSummary = {
  startedAt: string;
  finishedAt: string;
  runDate?: string;
  sources: DailySchedulerSourceResult[];
};

export async function runDailyRecommendationPipeline(input?: {
  runDate?: string;
  sources?: DailySchedulerSource[];
}) {
  const startedAt = new Date();
  const sourceList = input?.sources?.length
    ? input.sources
    : (["biorxiv", "arxiv", "pubmed", "journal"] as const);

  const ingestion = createDailyIngestionService();
  const enrich = createJournalEnrichmentService();
  const dedupe = createCandidateNormalizationService();
  const summarize = createCandidateOutputService();
  const recall = createRecallRankingService();
  const rerank = createRerankService();

  let results: DailySchedulerSourceResult[] = [];

  try {
    logger.info("Scheduler daily aggregated pipeline started", {
      sources: sourceList,
      runDate: input?.runDate
    });

    const ingestResult = await ingestion.runAggregatedIngestion({
      runDate: input?.runDate,
      sources: [...sourceList]
    });
    const runId = ingestResult.run.id;

    await enrich.enrichRun(runId);
    await dedupe.runForIngestionRun(runId);
    await summarize.generateForRun({ runId });
    await recall.runRecall({ runId });
    await rerank.runRerank({ runId });

    logger.info("Scheduler daily aggregated pipeline succeeded", {
      runId,
      sourceCount: ingestResult.sourceSummaries.length
    });

    results = ingestResult.sourceSummaries.map((entry) => ({
      source: entry.source,
      runId,
      status: "success"
    }));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown scheduler daily error";
    logger.error("Scheduler daily aggregated pipeline failed", {
      sources: sourceList,
      errorMessage
    });

    results = sourceList.map((source) => ({
      source,
      status: "failed",
      errorMessage
    }));
  }

  return {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    runDate: input?.runDate,
    sources: results
  } satisfies DailyPipelineRunSummary;
}

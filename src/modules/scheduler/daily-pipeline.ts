import { logger } from "../../lib/logging";
import { AppError } from "../../lib/errors";
import { createJournalEnrichmentService } from "../candidate-enrich";
import {
  createDailyIngestionService,
  type AggregatedSourceIngestionSummary,
  type DailyCandidateSourceValue
} from "../ingestion";
import { createCandidateNormalizationService } from "../normalize-dedupe";
import { createRecallRankingService } from "../ranking/recall";
import { createRerankService } from "../ranking/rerank";
import { createCandidateOutputService } from "../summary";
import {
  createPipelineStageService,
  STAGE_ORDER,
  type DailyPipelineStageRecord,
  type DailyPipelineStageValue
} from "../pipeline-status";

export type DailySchedulerSource = DailyCandidateSourceValue;

export type DailySchedulerSourceResult = {
  source: DailySchedulerSource;
  runId?: string;
  status: "success" | "failed";
  errorMessage?: string;
};

export type DailyPipelineRunSummary = {
  status: "complete" | "partial" | "failed" | "already_running" | "already_succeeded";
  runId?: string;
  failedStage?: DailyPipelineStageValue;
  retryable: boolean;
  startedAt: string;
  finishedAt: string;
  runDate?: string;
  sources: DailySchedulerSourceResult[];
  stages: DailyPipelineStageRecord[];
};

export async function runDailyRecommendationPipeline(input?: {
  runDate?: string;
  sources?: DailySchedulerSource[];
}): Promise<DailyPipelineRunSummary> {
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
  const stageStatus = createPipelineStageService();

  let results: DailySchedulerSourceResult[] = [];
  let activeRunId: string | undefined;
  let activeStage: DailyPipelineStageValue = "ingestion";
  let pipelineStatus: DailyPipelineRunSummary["status"] = "complete";
  let persistedStages: DailyPipelineStageRecord[] = [];

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
    activeRunId = runId;
    let sourceSummaries = ingestResult.sourceSummaries;

    if (ingestResult.disposition === "already_succeeded") {
      persistedStages = await stageStatus.list(runId);
      sourceSummaries = sourceSummariesFromStages(persistedStages) ?? sourceSummaries;
      const resumeStage = findResumeStage(persistedStages);
      if (!resumeStage) {
        logger.info("Scheduler daily pipeline reused completed ingestion run", { runId });
        results = sourceSummaries.map((entry) => ({
          source: entry.source,
          runId,
          status: entry.status ?? "success",
          ...(entry.errorMessage ? { errorMessage: entry.errorMessage } : {})
        }));
        const hasPartialStage = persistedStages.some((stage) => stage.status === "partial");
        return {
          status: hasPartialStage ? "partial" : "already_succeeded",
          runId,
          retryable: hasRetryablePartialStage(persistedStages),
          startedAt: startedAt.toISOString(),
          finishedAt: new Date().toISOString(),
          runDate: input?.runDate,
          sources: results,
          stages: persistedStages
        } satisfies DailyPipelineRunSummary;
      }
      logger.info("Scheduler daily pipeline resuming partial downstream stages", {
        runId,
        resumeStage
      });
    }

    const sourcePartial = sourceSummaries.some((entry) => entry.status === "failed");
    if (persistedStages.length === 0) {
      await stageStatus.initialize({
        runId,
        ingestionStatus: sourcePartial ? "partial" : "success",
        ingestionDetails: { sources: sourceSummaries }
      });
    }
    const resumeStage = findResumeStage(persistedStages) ?? "enrichment";
    const shouldRun = (stage: DailyPipelineStageValue) =>
      STAGE_ORDER.indexOf(stage) >= STAGE_ORDER.indexOf(resumeStage);

    activeStage = "enrichment";
    if (shouldRun(activeStage)) {
      await stageStatus.start(runId, activeStage);
      const enrichment = await enrich.enrichRun(runId);
      await stageStatus.complete({
        runId,
        stage: activeStage,
        status: enrichment.failed > 0 ? "partial" : "success",
        details: enrichment as unknown as Record<string, unknown>
      });
    }

    activeStage = "normalization";
    if (shouldRun(activeStage)) {
      await stageStatus.start(runId, activeStage);
      const normalization = await dedupe.runForIngestionRun(runId);
      await stageStatus.complete({
        runId,
        stage: activeStage,
        details: {
          runId: normalization.runId,
          inputCount: normalization.inputCount,
          canonicalCount: normalization.canonicalCount,
          mergedCount: normalization.mergedCount
        }
      });
    }

    activeStage = "representation";
    if (shouldRun(activeStage)) {
      await stageStatus.start(runId, activeStage);
      const labels = await summarize.generateLabelsForRun({ runId });
      await stageStatus.complete({
        runId,
        stage: activeStage,
        status: labels.failed > 0 ? "partial" : "success",
        details: { requested: labels.requested, generated: labels.generated, failed: labels.failed }
      });
    }

    activeStage = "recall";
    if (shouldRun(activeStage)) {
      await stageStatus.start(runId, activeStage);
      const recallResult = await recall.runRecall({ runId });
      await stageStatus.complete({ runId, stage: activeStage, details: { recallRunId: recallResult.run.id } });
    }

    activeStage = "rerank";
    if (shouldRun(activeStage)) {
      await stageStatus.start(runId, activeStage);
      const rerankResult = await rerank.runRerank({ runId, topN: 20 });
      await stageStatus.complete({ runId, stage: activeStage, details: { rerankRunId: rerankResult.run.id } });
    }

    activeStage = "summary";
    if (shouldRun(activeStage)) {
      await stageStatus.start(runId, activeStage);
      const summaries = await summarize.generateSummariesForRun({ runId, limit: 20, selectedOnly: true });
      await stageStatus.complete({
        runId,
        stage: activeStage,
        status: summaries.failed > 0 ? "partial" : "success",
        details: { requested: summaries.requested, generated: summaries.generated, failed: summaries.failed }
      });
    }

    persistedStages = await stageStatus.list(runId);
    pipelineStatus = persistedStages.some((stage) => stage.status === "partial") ? "partial" : "complete";

    logger.info("Scheduler daily aggregated pipeline succeeded", {
      runId,
      sourceCount: sourceSummaries.length
    });

    results = sourceSummaries.map((entry) => ({
      source: entry.source,
      ...(entry.status === "failed" ? {} : { runId }),
      status: entry.status ?? "success",
      ...(entry.errorMessage ? { errorMessage: entry.errorMessage } : {})
    }));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown scheduler daily error";
    logger.error("Scheduler daily aggregated pipeline failed", {
      sources: sourceList,
      errorMessage
    });
    const errorRunId = activeRunId ?? extractRunId(error);
    if (error instanceof AppError && error.code === "DAILY_RUN_ALREADY_RUNNING") {
      return {
        status: "already_running",
        runId: errorRunId,
        retryable: false,
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        runDate: input?.runDate,
        sources: sourceList.map((source) => ({ source, status: "failed", errorMessage })),
        stages: errorRunId ? await stageStatus.list(errorRunId) : []
      } satisfies DailyPipelineRunSummary;
    }
    if (errorRunId) {
      if (activeRunId) {
        await stageStatus.fail({ runId: errorRunId, stage: activeStage, errorMessage });
      } else {
        await stageStatus.initialize({
          runId: errorRunId,
          ingestionStatus: "partial",
          ingestionDetails: { errorMessage }
        });
        await stageStatus.fail({ runId: errorRunId, stage: "ingestion", errorMessage });
      }
      persistedStages = await stageStatus.list(errorRunId);
      activeRunId = errorRunId;
    }
    pipelineStatus = "failed";

    results = sourceList.map((source) => ({
      source,
      status: "failed",
      errorMessage
    }));
  }

  return {
    status: pipelineStatus,
    runId: activeRunId,
    failedStage: pipelineStatus === "failed" ? activeStage : undefined,
    retryable: pipelineStatus === "failed" || hasRetryablePartialStage(persistedStages),
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    runDate: input?.runDate,
    sources: results,
    stages: persistedStages
  } satisfies DailyPipelineRunSummary;
}

function hasRetryablePartialStage(stages: DailyPipelineStageRecord[]) {
  return stages.some((stage) =>
    stage.status === "partial" &&
    stage.stage !== "ingestion" &&
    stage.stage !== "enrichment"
  );
}

function extractRunId(error: unknown) {
  const runId = error instanceof AppError ? error.details?.runId : undefined;
  return typeof runId === "string" ? runId : undefined;
}

function findResumeStage(stages: DailyPipelineStageRecord[]): DailyPipelineStageValue | undefined {
  if (stages.length === 0) {
    return "enrichment";
  }
  return STAGE_ORDER.slice(1).find((stage) => {
    const record = stages.find((entry) => entry.stage === stage);
    if (stage === "enrichment" && record?.status === "partial") {
      return false;
    }
    return !record || record.status !== "success";
  });
}

function sourceSummariesFromStages(stages: DailyPipelineStageRecord[]) {
  const sources = stages.find((stage) => stage.stage === "ingestion")?.details?.sources;
  if (!Array.isArray(sources)) return undefined;
  const validSources = new Set<DailySchedulerSource>(["biorxiv", "arxiv", "pubmed", "journal"]);
  return sources.flatMap((entry): AggregatedSourceIngestionSummary[] => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const value = entry as Record<string, unknown>;
    if (typeof value.source !== "string" || !validSources.has(value.source as DailySchedulerSource)) return [];
    return [{
      source: value.source as DailySchedulerSource,
      status: value.status === "failed" ? "failed" : "success",
      candidatesCount: typeof value.candidatesCount === "number" ? value.candidatesCount : 0,
      fetchedCount: typeof value.fetchedCount === "number" ? value.fetchedCount : undefined,
      filteredCount: typeof value.filteredCount === "number" ? value.filteredCount : undefined,
      windowStart: typeof value.windowStart === "string" ? value.windowStart : undefined,
      windowEnd: typeof value.windowEnd === "string" ? value.windowEnd : undefined,
      filterMode:
        value.filterMode === "indexed_day" || value.filterMode === "watermark" || value.filterMode === "first_seen"
          ? value.filterMode
          : undefined,
      errorMessage: typeof value.errorMessage === "string" ? value.errorMessage : undefined
    }];
  });
}

import type {
  DailyPipelineStageValue,
  PipelineStageRepository,
  PipelineStageService
} from "./types";

const STAGE_ORDER: DailyPipelineStageValue[] = [
  "ingestion",
  "enrichment",
  "normalization",
  "representation",
  "recall",
  "rerank",
  "summary"
];

export class DefaultPipelineStageService implements PipelineStageService {
  constructor(private readonly repository: PipelineStageRepository) {}

  initialize(input: Parameters<PipelineStageRepository["initialize"]>[0]) {
    return this.repository.initialize(input);
  }

  start(input: Parameters<PipelineStageRepository["start"]>[0]) {
    return this.repository.start(input);
  }

  complete(input: Parameters<PipelineStageRepository["complete"]>[0]) {
    return this.repository.complete(input);
  }

  fail(input: Parameters<PipelineStageRepository["fail"]>[0]) {
    return this.repository.fail(input);
  }

  list(runId: string) {
    return this.repository.list(runId);
  }

  listRecentIngestionDetails(limit: number) {
    return this.repository.listRecentIngestionDetails(limit);
  }
}

export { STAGE_ORDER };

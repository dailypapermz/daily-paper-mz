export { createDailyIngestionService } from "./factory";
export { ArxivSourceAdapter } from "./arxiv-adapter";
export { BioRxivSourceAdapter } from "./biorxiv-adapter";
export {
  createAdapterMap,
  DefaultDailyIngestionService,
  makeAdapterCandidate,
  toCandidateDate
} from "./ingestion-foundation.service";
export {
  isCandidateInUtcDay,
  normalizeAdapterCandidate,
  resolveUtcDayWindow
} from "./new-today";
export type * from "./types";

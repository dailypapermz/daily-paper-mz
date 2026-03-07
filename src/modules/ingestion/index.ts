export { createDailyIngestionService } from "./factory";
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

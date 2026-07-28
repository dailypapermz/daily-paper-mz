export { createOperationsDispatcher, createOperationsService } from "./factory";
export { GitHubOperationsDispatcher, OperationsDispatcherUnavailableError } from "./github-dispatcher";
export {
  OPERATIONS_DEFAULT_LIMIT,
  OPERATIONS_MAX_LIMIT,
  OperationsError,
  OperationsService
} from "./operations.service";
export { sanitizeOperationsDetails, sanitizeOperationsError } from "./sanitize";
export type * from "./types";

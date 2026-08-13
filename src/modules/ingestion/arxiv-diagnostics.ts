import { AppError } from "../../lib/errors";
import type { ArxivFailureDiagnostic } from "./types";

const REQUEST_FAILURE_CATEGORIES = new Set<ArxivFailureDiagnostic["failureCategory"]>([
  "rate_limit",
  "timeout",
  "network",
  "server_error",
  "http_error"
]);

export function classifyArxivFailure(error: unknown): ArxivFailureDiagnostic {
  if (error instanceof AppError && error.code === "ARXIV_SCOPE_REQUIRED") {
    return {
      source: "arxiv",
      failureCode: "ARXIV_SCOPE_REQUIRED",
      stage: "configuration",
      failureCategory: "configuration_error",
      retryable: false
    };
  }

  if (error instanceof AppError && error.code === "ARXIV_API_ERROR") {
    const configuredCategory = error.details?.failureCategory;
    const failureCategory =
      typeof configuredCategory === "string" &&
      REQUEST_FAILURE_CATEGORIES.has(configuredCategory as ArxivFailureDiagnostic["failureCategory"])
        ? configuredCategory as ArxivFailureDiagnostic["failureCategory"]
        : "unknown";

    return {
      source: "arxiv",
      failureCode: "ARXIV_API_ERROR",
      stage: "request",
      failureCategory,
      retryable:
        failureCategory === "rate_limit" ||
        failureCategory === "timeout" ||
        failureCategory === "network" ||
        failureCategory === "server_error"
    };
  }

  return {
    source: "arxiv",
    failureCode: "ARXIV_UNEXPECTED_ERROR",
    stage: "ingestion",
    failureCategory: "unknown",
    retryable: false
  };
}

export function arxivFailureMessage(diagnostic: ArxivFailureDiagnostic): string {
  if (diagnostic.failureCode === "ARXIV_SCOPE_REQUIRED") {
    return "arXiv category scope configuration is missing";
  }
  if (diagnostic.failureCode === "ARXIV_API_ERROR") {
    return "arXiv request failed";
  }
  return "arXiv ingestion failed";
}

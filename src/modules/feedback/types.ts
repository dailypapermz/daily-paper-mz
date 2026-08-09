export type FeedbackActionValue = "save" | "dismiss" | "promote" | "label_edit" | "summary_edit";

export type NegativeFeedbackSignal = {
  paperIdentityKey: string;
  sourceCandidateId: string;
  sourceFeedbackLogId: string;
  representationText: string;
  contentRecallLabel?: string;
  researchCategory?: "method" | "biology" | "resource" | "benchmark";
  effectiveAt: string;
};

export type FeedbackLogRecord = {
  id: string;
  runId: string;
  candidateId: string;
  actionType: FeedbackActionValue;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export interface FeedbackLogRepository {
  appendLog(input: {
    runId: string;
    candidateId: string;
    actionType: FeedbackActionValue;
    oldValue?: Record<string, unknown>;
    newValue?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Promise<FeedbackLogRecord>;
  listLogs(input?: { runId?: string; candidateId?: string; limit?: number }): Promise<FeedbackLogRecord[]>;
}

export interface FeedbackService {
  logTriageAction(input: {
    runId: string;
    candidateId: string;
    action: "save" | "dismiss" | "promote";
    metadata?: Record<string, unknown>;
  }): Promise<FeedbackLogRecord>;
  logLabelEdit(input: {
    runId: string;
    candidateId: string;
    oldValue?: Record<string, unknown>;
    newValue?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Promise<FeedbackLogRecord>;
  logSummaryEdit(input: {
    runId: string;
    candidateId: string;
    oldValue?: Record<string, unknown>;
    newValue?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Promise<FeedbackLogRecord>;
  listLogs(input?: { runId?: string; candidateId?: string; limit?: number }): Promise<FeedbackLogRecord[]>;
}

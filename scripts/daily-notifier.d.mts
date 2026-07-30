export type DailyNotificationResult =
  | { status: "sent"; channel: "wecom" | "email" }
  | { status: "skipped"; channel: "none"; reason: string }
  | { status: "failed"; channel: "none"; attempts: Array<{ channel: string; error: string }> };

export type DailyNotification = {
  title: string;
  status: string;
  runId?: string;
  businessDate: string;
  recommendationCount: number;
  sourceCounts: Record<string, number>;
  failedSources: string[];
  warningSummary: string;
  papers: Array<{ title: string; url: string | null }>;
  topPapers: Array<{ title: string; url: string | null }>;
  dashboardUrl?: string;
};

export function buildDailyNotification(input: {
  pipelinePayload: unknown;
  feed: unknown;
  dashboardUrl?: string;
  businessDate?: string;
}): DailyNotification;

export function sendDailyNotification(input: {
  notification: unknown;
  env: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  createTransport?: (...args: unknown[]) => unknown;
}): Promise<DailyNotificationResult>;

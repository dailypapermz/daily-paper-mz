export type DailyNotificationResult =
  | { status: "sent"; channel: "wecom" | "email" }
  | { status: "skipped"; channel: "none"; reason: string }
  | { status: "failed"; channel: "none"; attempts: Array<{ channel: string; error: string }> };

export function buildDailyNotification(input: {
  pipelinePayload: unknown;
  feed: unknown;
  dashboardUrl?: string;
}): unknown;

export function sendDailyNotification(input: {
  notification: unknown;
  env: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  createTransport?: (...args: unknown[]) => unknown;
}): Promise<DailyNotificationResult>;

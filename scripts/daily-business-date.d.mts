export function parseUtcBusinessDate(value: string | null | undefined): string;

export function resolveScheduledBusinessDate(
  scheduledTime: Date | string | number
): string;

export function resolveBusinessDate(input: {
  eventName: string | undefined;
  ref: string | undefined;
  manualRunDate?: string | null;
  now?: Date;
}): string;

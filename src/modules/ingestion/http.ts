type FetchWithRetryOptions = {
  timeoutMs?: number;
  maxRetries?: number;
  retryableStatusCodes?: number[];
  backoffMs?: number;
};

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504];
const DEFAULT_BACKOFF_MS = 250;

export async function fetchWithRetry(
  input: string,
  init?: RequestInit,
  options?: FetchWithRetryOptions
): Promise<Response> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const retryableStatusCodes = options?.retryableStatusCodes ?? DEFAULT_RETRYABLE_STATUS_CODES;
  const backoffMs = options?.backoffMs ?? DEFAULT_BACKOFF_MS;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(input, {
        ...init,
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!response.ok && retryableStatusCodes.includes(response.status) && attempt < maxRetries) {
        await wait(backoffMs * (attempt + 1));
        continue;
      }

      return response;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;

      if (attempt >= maxRetries) {
        throw error;
      }

      await wait(backoffMs * (attempt + 1));
    }
  }

  throw (lastError instanceof Error ? lastError : new Error("Unknown source fetch failure"));
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

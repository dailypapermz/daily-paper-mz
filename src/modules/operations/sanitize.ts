const REDACTED = "[redacted]";
const MAX_ERROR_LENGTH = 500;
const MAX_DETAIL_STRING_LENGTH = 1_000;
const MAX_ARRAY_ITEMS = 50;
const MAX_OBJECT_KEYS = 50;
const MAX_DEPTH = 5;

const SENSITIVE_KEY = /(?:authorization|cookie|credential|password|passwd|secret|token|api[_-]?key|webhook|private[_-]?key|access[_-]?key)/i;

export function sanitizeOperationsError(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return sanitizeString(value.trim()).slice(0, MAX_ERROR_LENGTH);
}

export function sanitizeOperationsDetails(
  value: unknown,
  depth = 0
): Record<string, unknown> | undefined {
  if (!isPlainObject(value) || depth >= MAX_DEPTH) return undefined;
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value).slice(0, MAX_OBJECT_KEYS)) {
    output[key] = SENSITIVE_KEY.test(key) ? REDACTED : sanitizeDetailValue(entry, depth + 1);
  }
  return output;
}

function sanitizeDetailValue(value: unknown, depth: number): unknown {
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return sanitizeString(value).slice(0, MAX_DETAIL_STRING_LENGTH);
  if (depth >= MAX_DEPTH) return "[truncated]";
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((entry) => sanitizeDetailValue(entry, depth + 1));
  }
  if (isPlainObject(value)) {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value).slice(0, MAX_OBJECT_KEYS)) {
      output[key] = SENSITIVE_KEY.test(key) ? REDACTED : sanitizeDetailValue(entry, depth + 1);
    }
    return output;
  }
  return String(value).slice(0, MAX_DETAIL_STRING_LENGTH);
}

function sanitizeString(input: string): string {
  return input
    .replace(/\bBearer\s+[^\s,;]+/gi, `Bearer ${REDACTED}`)
    .replace(/\b(?:ghp_|github_pat_|sk-)[A-Za-z0-9_-]{8,}\b/g, REDACTED)
    .replace(
      /\b([A-Za-z0-9_-]*(?:token|secret|password|passwd|credential|api[_-]?key|webhook)[A-Za-z0-9_-]*)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
      `$1=${REDACTED}`
    )
    .replace(/\b(?:postgres(?:ql)?|mysql):\/\/[^\s]+/gi, "[database url]")
    .replace(/\bhttps?:\/\/[^\s]+/gi, sanitizeUrl)
    .replace(/\b[A-Z]:\\Users\\[^\\\s]+\\[^\s]*/gi, "[local path]")
    .replace(/\b[A-Z]:\\[^\s]*/gi, "[local path]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]");
}

function sanitizeUrl(match: string): string {
  try {
    const url = new URL(match);
    if (url.username || url.password) {
      url.username = REDACTED;
      url.password = "";
    }
    for (const key of Array.from(url.searchParams.keys())) {
      if (SENSITIVE_KEY.test(key)) url.searchParams.set(key, REDACTED);
    }
    return url.toString();
  } catch {
    return "[url]";
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

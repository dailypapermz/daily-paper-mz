export function tokenOverlapScore(leftText: string, rightText: string): number {
  const leftTokens = toTokenSet(leftText);
  const rightTokens = toTokenSet(rightText);
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  }

  return clampScore(intersection / Math.max(leftTokens.size, rightTokens.size));
}

function toTokenSet(value: string): Set<string> {
  const normalized = value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);

  return new Set(normalized);
}

function clampScore(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return Number(value.toFixed(6));
}

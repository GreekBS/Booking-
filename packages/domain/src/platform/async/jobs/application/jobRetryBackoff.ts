const BASE_RETRY_MS = 30_000;
const MAX_RETRY_MS = 15 * 60 * 1000;

export function computeNextRetryAt(attemptCount: number, from: Date = new Date()): Date {
  const delayMs = Math.min(BASE_RETRY_MS * 2 ** Math.max(attemptCount - 1, 0), MAX_RETRY_MS);
  return new Date(from.getTime() + delayMs);
}

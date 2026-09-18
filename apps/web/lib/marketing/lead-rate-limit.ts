/**
 * Best-effort per-process rate limit for public lead creation.
 *
 * Not globally authoritative across serverless instances — edge/WAF limits
 * remain required in production. Throws RateLimitedError for HTTP 429.
 */
import { RateLimitedError } from "@/lib/channels/channel-transport-rate-limit";

const WINDOW_MS = 15 * 60_000;
const MAX_REQUESTS = 8;
const MAX_BUCKETS = 4_096;

type Bucket = { count: number; resetAt: number };

const hits = new Map<string, Bucket>();

function clientKey(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

function prune(now: number): void {
  if (hits.size < MAX_BUCKETS) return;
  for (const [key, bucket] of hits) {
    if (now > bucket.resetAt) hits.delete(key);
  }
  while (hits.size >= MAX_BUCKETS) {
    const oldest = hits.keys().next().value;
    if (!oldest) break;
    hits.delete(oldest);
  }
}

export function checkLeadRateLimit(request: Request): void {
  const key = clientKey(request);
  const now = Date.now();
  prune(now);

  const entry = hits.get(key);
  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }

  entry.count += 1;
  if (entry.count > MAX_REQUESTS) {
    throw new RateLimitedError("Too many lead submissions");
  }
}

/** Test helper — clears process-local buckets. */
export function resetLeadRateLimitForTests(): void {
  hits.clear();
}

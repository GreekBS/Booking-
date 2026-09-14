/**
 * CM-4b S4a-2b — process-local, memory-bounded rate limit for channel transport HTTP.
 *
 * Deployment-level WAF / edge / distributed limits remain mandatory in production.
 * This guard is best-effort only and must never grow unbounded under high-cardinality input.
 */

/** Hard cap on stored buckets (expired + active). Map size never exceeds this. */
export const CHANNEL_TRANSPORT_RATE_LIMIT_MAX_BUCKETS = 4_096;

/** Fixed window length per bucket. */
export const CHANNEL_TRANSPORT_RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Minimum wall-clock gap between full expired-entry sweeps.
 * Sweep also runs opportunistically before capacity eviction (no background timers).
 */
export const CHANNEL_TRANSPORT_RATE_LIMIT_SWEEP_INTERVAL_MS = 5_000;

const MAX_WEBHOOK_PER_KEY = 120;
const MAX_ADMIN_TRANSPORT_PER_KEY = 30;

type RateLimitBucket = {
  count: number;
  resetAt: number;
  lastAccessAt: number;
};

const hits = new Map<string, RateLimitBucket>();
let lastSweepAt = 0;
let maxBucketsForTests: number | null = null;

export class RateLimitedError extends Error {
  readonly code = "RATE_LIMITED";

  constructor(message = "Rate limit exceeded") {
    super(message);
    this.name = "RateLimitedError";
  }
}

/**
 * Public webhook limiter.
 *
 * Keys intentionally omit attacker-controlled route segments (provider / tenant /
 * connection). Spoofable `x-forwarded-for` is treated as a coarse hint only — not a
 * reliable security identity. Memory safety comes from the hard bucket cap + eviction.
 */
export function checkChannelWebhookRateLimit(request: Request): void {
  const ip = clientIp(request);
  enforceBucket("wh:global", MAX_WEBHOOK_PER_KEY);
  enforceBucket(`wh:ip:${ip}`, MAX_WEBHOOK_PER_KEY);
}

/**
 * Authenticated admin transport limiter (poll / replay).
 * Tenant/connection keys are lower cardinality than public route spam but still
 * share the same bounded map.
 */
export function checkChannelAdminTransportRateLimit(
  request: Request,
  tenantId: string,
  connectionId: string,
  action: "poll" | "replay",
): void {
  const ip = clientIp(request);
  enforceBucket(`admin:${action}:ip:${ip}`, MAX_ADMIN_TRANSPORT_PER_KEY);
  enforceBucket(
    `admin:${action}:tenant:${tenantId}:connection:${connectionId}`,
    MAX_ADMIN_TRANSPORT_PER_KEY,
  );
}

/**
 * Client IP hint — same convention as `getClientIp` in tenant-context.
 * Forwarded headers are spoofable unless the deployment strips/overwrites them
 * at a trusted proxy edge.
 */
function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

function maxBuckets(): number {
  return maxBucketsForTests ?? CHANNEL_TRANSPORT_RATE_LIMIT_MAX_BUCKETS;
}

function sweepExpired(now: number): void {
  for (const [key, entry] of hits) {
    if (now > entry.resetAt) {
      hits.delete(key);
    }
  }
}

function maybeSweep(now: number): void {
  if (now - lastSweepAt >= CHANNEL_TRANSPORT_RATE_LIMIT_SWEEP_INTERVAL_MS) {
    lastSweepAt = now;
    sweepExpired(now);
  }
}

/** Evict expired first, then least-recently-used until there is room for one insert. */
function ensureCapacityForInsert(now: number): void {
  if (hits.size < maxBuckets()) {
    return;
  }

  sweepExpired(now);
  lastSweepAt = now;

  while (hits.size >= maxBuckets()) {
    let oldestKey: string | null = null;
    let oldestAccess = Number.POSITIVE_INFINITY;
    for (const [key, entry] of hits) {
      if (entry.lastAccessAt < oldestAccess) {
        oldestAccess = entry.lastAccessAt;
        oldestKey = key;
      }
    }
    if (oldestKey == null) {
      break;
    }
    hits.delete(oldestKey);
  }
}

function enforceBucket(bucket: string, maxRequests: number): void {
  const now = Date.now();
  maybeSweep(now);

  const existing = hits.get(bucket);
  if (existing && now <= existing.resetAt) {
    existing.count += 1;
    existing.lastAccessAt = now;
    if (existing.count > maxRequests) {
      throw new RateLimitedError();
    }
    return;
  }

  if (existing) {
    hits.delete(bucket);
  }

  if (!hits.has(bucket)) {
    ensureCapacityForInsert(now);
  }

  hits.set(bucket, {
    count: 1,
    resetAt: now + CHANNEL_TRANSPORT_RATE_LIMIT_WINDOW_MS,
    lastAccessAt: now,
  });
}

/** Test helper — clears in-memory buckets and sweep clock. */
export function resetChannelTransportRateLimitsForTests(): void {
  hits.clear();
  lastSweepAt = 0;
  maxBucketsForTests = null;
}

/** Test helper — override hard cap (null restores production default). */
export function setChannelTransportRateLimitMaxBucketsForTests(
  max: number | null,
): void {
  maxBucketsForTests = max;
}

/** Test helper — current stored bucket count (must stay ≤ hard cap). */
export function getChannelTransportRateLimitBucketCountForTests(): number {
  return hits.size;
}

/** Test helper — force expired-entry sweep without waiting for interval. */
export function sweepChannelTransportRateLimitsForTests(): void {
  sweepExpired(Date.now());
  lastSweepAt = Date.now();
}

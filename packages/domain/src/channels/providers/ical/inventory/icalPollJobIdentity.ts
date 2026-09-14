/**
 * P1-S7b — deterministic poll job identity (scheduled / manual / recovery).
 * Jitter affects runAt only — never the idempotency key.
 */

export const DEFAULT_ICAL_POLL_INTERVAL_MS = 15 * 60 * 1000;
export const MIN_ICAL_POLL_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Resolve poll interval from env `CHANNELS_ICAL_POLL_INTERVAL_MS` when set and valid;
 * otherwise default 15m. Clamped to minimum 5m. Not a feature flag.
 */
export function resolveIcalPollIntervalMs(
  envValue: string | undefined = process.env.CHANNELS_ICAL_POLL_INTERVAL_MS,
): number {
  if (envValue === undefined || envValue.trim() === "") {
    return DEFAULT_ICAL_POLL_INTERVAL_MS;
  }
  const parsed = Number(envValue);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_ICAL_POLL_INTERVAL_MS;
  }
  return Math.max(parsed, MIN_ICAL_POLL_INTERVAL_MS);
}

export function icalPollBucket(
  utcNowMs: number,
  intervalMs: number = resolveIcalPollIntervalMs(),
): number {
  return Math.floor(utcNowMs / intervalMs);
}

export function buildScheduledPollIdempotencyKey(
  tenantId: string,
  connectionId: string,
  bucket: number,
): string {
  return `poll_channel_connection:${tenantId}:${connectionId}:sched:${bucket}`;
}

export function buildManualPollIdempotencyKey(
  tenantId: string,
  connectionId: string,
  bucket: number,
): string {
  return `poll_channel_connection:${tenantId}:${connectionId}:manual:${bucket}`;
}

export function buildRecoveryPollIdempotencyKey(
  tenantId: string,
  connectionId: string,
  deadLetterJobId: string,
): string {
  return `poll_channel_connection:${tenantId}:${connectionId}:recovery:${deadLetterJobId}`;
}

/** Legacy fixed key (pre-S7b). Still recognized for in-flight detection. */
export function buildLegacyPollIdempotencyKey(
  tenantId: string,
  connectionId: string,
): string {
  return `poll_channel_connection:${tenantId}:${connectionId}`;
}

export function computePollEnqueueJitterMs(
  intervalMs: number,
  random: () => number = Math.random,
): number {
  const fraction = Math.min(Math.max(random(), 0), 1) * 0.1;
  return Math.floor(intervalMs * fraction);
}

export function computePollRunAt(
  now: Date = new Date(),
  intervalMs: number = resolveIcalPollIntervalMs(),
  random: () => number = Math.random,
): Date {
  return new Date(now.getTime() + computePollEnqueueJitterMs(intervalMs, random));
}

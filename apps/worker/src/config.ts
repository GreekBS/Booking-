/**
 * Worker runtime configuration.
 *
 * DATABASE SAFETY: resolveWorkerDatabaseUrl refuses Talos Production unless
 * TALOS_WORKER_RUNTIME_MODE=production (reserved; still blocked by mutation gate
 * until an explicit Production activation).
 */

import {
  resolveWorkerDatabaseUrl,
  WORKER_DATABASE_URL_ENV,
  TALOS_WORKER_RUNTIME_MODE_ENV,
} from "@hcp/database";

export type WorkerSchedulerConfig = {
  icalSchedulerEnabled: boolean;
  /** Default ~15 minutes — discovery cadence for ScheduleIcalPollsUseCase. */
  icalSchedulerIntervalMs: number;
  holdExpirySchedulerEnabled: boolean;
  /**
   * Default 60s — holds TTL ~15m; minute-bucket idempotency keeps multi-replica safe.
   */
  holdExpirySchedulerIntervalMs: number;
  holdExpiryJobLimit: number;
  /** Future OTA retrieval — off until a provider port is wired + explicitly enabled. */
  providerRetrievalSchedulerEnabled: boolean;
  providerRetrievalSchedulerIntervalMs: number;
};

export type WorkerConfig = {
  /** Durable processing connection (Prisma). */
  databaseUrl: string;
  /** LISTEN connection — prefer session/direct URL (not transaction pooler). */
  listenDatabaseUrl: string;
  /** Recovery sweep interval in ms (safe default ~2s). */
  recoveryIntervalMs: number;
  jobBatchLimit: number;
  outboxBatchLimit: number;
  listenerReconnectInitialMs: number;
  listenerReconnectMaxMs: number;
  scheduler: WorkerSchedulerConfig;
};

const DEFAULT_RECOVERY_MS = 2_000;
const MIN_RECOVERY_MS = 1_000;
const MAX_RECOVERY_MS = 3_000;

/** ~15 minutes — matches CHANNELS_ICAL_POLL_INTERVAL_MS default discovery cadence. */
export const DEFAULT_ICAL_SCHEDULER_INTERVAL_MS = 15 * 60 * 1000;
const MIN_ICAL_SCHEDULER_INTERVAL_MS = 60_000;

/** 60s — prompt hold release without busy-looping. */
export const DEFAULT_HOLD_EXPIRY_SCHEDULER_INTERVAL_MS = 60_000;
const MIN_HOLD_EXPIRY_SCHEDULER_INTERVAL_MS = 10_000;

/** Placeholder default for future OTA retrieval (seconds-scale possible). */
export const DEFAULT_PROVIDER_RETRIEVAL_SCHEDULER_INTERVAL_MS = 30_000;
const MIN_PROVIDER_RETRIEVAL_SCHEDULER_INTERVAL_MS = 1_000;

function parseIntEnv(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseBoolEnv(
  env: NodeJS.ProcessEnv,
  name: string,
  defaultValue: boolean,
): boolean {
  const raw = env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === "") return defaultValue;
  if (raw === "true" || raw === "1" || raw === "yes") return true;
  if (raw === "false" || raw === "0" || raw === "no") return false;
  return defaultValue;
}

function clampMin(value: number, min: number): number {
  return value < min ? min : value;
}

/**
 * Apply worker DB URL into process.env before any Prisma client import.
 */
export function applyWorkerDatabaseEnv(
  env: NodeJS.ProcessEnv = process.env,
): { databaseUrl: string; listenDatabaseUrl: string } {
  const databaseUrl = resolveWorkerDatabaseUrl(env);
  env.DATABASE_URL = databaseUrl;

  const listenRaw =
    env.WORKER_LISTEN_DATABASE_URL?.trim() ||
    env.DIRECT_URL?.trim() ||
    databaseUrl;

  // Listen URL must also refuse Production unless future production mode.
  resolveWorkerDatabaseUrl({
    ...env,
    [WORKER_DATABASE_URL_ENV]: listenRaw,
    DATABASE_URL: listenRaw,
  });

  if (!env.DIRECT_URL?.trim()) {
    env.DIRECT_URL = listenRaw;
  }

  return { databaseUrl, listenDatabaseUrl: listenRaw };
}

export function loadWorkerSchedulerConfig(
  env: NodeJS.ProcessEnv = process.env,
): WorkerSchedulerConfig {
  return {
    // Safe defaults: enabled when the worker process runs; Production activation
    // is still gated by not deploying the worker / DB safety refusal.
    icalSchedulerEnabled: parseBoolEnv(
      env,
      "WORKER_ICAL_SCHEDULER_ENABLED",
      true,
    ),
    icalSchedulerIntervalMs: clampMin(
      parseIntEnv(
        env,
        "WORKER_ICAL_SCHEDULER_INTERVAL_MS",
        DEFAULT_ICAL_SCHEDULER_INTERVAL_MS,
      ),
      MIN_ICAL_SCHEDULER_INTERVAL_MS,
    ),
    holdExpirySchedulerEnabled: parseBoolEnv(
      env,
      "WORKER_HOLD_EXPIRY_SCHEDULER_ENABLED",
      true,
    ),
    holdExpirySchedulerIntervalMs: clampMin(
      parseIntEnv(
        env,
        "WORKER_HOLD_EXPIRY_SCHEDULER_INTERVAL_MS",
        DEFAULT_HOLD_EXPIRY_SCHEDULER_INTERVAL_MS,
      ),
      MIN_HOLD_EXPIRY_SCHEDULER_INTERVAL_MS,
    ),
    holdExpiryJobLimit: clampMin(
      parseIntEnv(env, "WORKER_HOLD_EXPIRY_JOB_LIMIT", 100),
      1,
    ),
    providerRetrievalSchedulerEnabled: parseBoolEnv(
      env,
      "WORKER_PROVIDER_RETRIEVAL_SCHEDULER_ENABLED",
      false,
    ),
    providerRetrievalSchedulerIntervalMs: clampMin(
      parseIntEnv(
        env,
        "WORKER_PROVIDER_RETRIEVAL_SCHEDULER_INTERVAL_MS",
        DEFAULT_PROVIDER_RETRIEVAL_SCHEDULER_INTERVAL_MS,
      ),
      MIN_PROVIDER_RETRIEVAL_SCHEDULER_INTERVAL_MS,
    ),
  };
}

export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const { databaseUrl, listenDatabaseUrl } = applyWorkerDatabaseEnv(env);

  let recoveryIntervalMs = parseIntEnv(
    env,
    "WORKER_RECOVERY_INTERVAL_MS",
    DEFAULT_RECOVERY_MS,
  );
  if (recoveryIntervalMs < MIN_RECOVERY_MS) recoveryIntervalMs = MIN_RECOVERY_MS;
  if (recoveryIntervalMs > MAX_RECOVERY_MS) recoveryIntervalMs = MAX_RECOVERY_MS;

  return {
    databaseUrl,
    listenDatabaseUrl,
    recoveryIntervalMs,
    jobBatchLimit: parseIntEnv(env, "WORKER_JOB_BATCH_LIMIT", 50),
    outboxBatchLimit: parseIntEnv(env, "WORKER_OUTBOX_BATCH_LIMIT", 100),
    listenerReconnectInitialMs: parseIntEnv(
      env,
      "WORKER_LISTENER_RECONNECT_INITIAL_MS",
      500,
    ),
    listenerReconnectMaxMs: parseIntEnv(
      env,
      "WORKER_LISTENER_RECONNECT_MAX_MS",
      30_000,
    ),
    scheduler: loadWorkerSchedulerConfig(env),
  };
}

export { WORKER_DATABASE_URL_ENV, TALOS_WORKER_RUNTIME_MODE_ENV };

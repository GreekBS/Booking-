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
};

const DEFAULT_RECOVERY_MS = 2_000;
const MIN_RECOVERY_MS = 1_000;
const MAX_RECOVERY_MS = 3_000;

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
  };
}

export { WORKER_DATABASE_URL_ENV, TALOS_WORKER_RUNTIME_MODE_ENV };

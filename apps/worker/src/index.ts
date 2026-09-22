/**
 * Talos async worker entrypoint.
 *
 * Invokes ProcessJobBatchUseCase / ProcessOutboxBatchUseCase directly (no HTTP).
 * Schedulers enqueue durable work via ScheduleIcalPollsUseCase / EnqueueJobUseCase.
 * Does NOT activate Production worker by default — refuses Talos Production DB.
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
// Load local env files without overriding already-set process env.
loadEnv({ path: resolve(here, "../../web/.env.local") });
loadEnv({ path: resolve(here, "../../../.env") });
loadEnv({ path: resolve(here, "../.env") });

import { loadWorkerConfig } from "./config";
import { AsyncWorkerLoop } from "./loop";
import { PgWakeListener } from "./listener";
import { workerLog } from "./logger";
import { SchedulerRunner, buildSchedulerHooks } from "./scheduler";

async function main(): Promise<void> {
  const config = loadWorkerConfig();

  // Import DI only after DATABASE_URL is safely resolved (Prisma reads env at connect).
  const {
    processJobBatchUseCase,
    processOutboxBatchUseCase,
    scheduleIcalPollsUseCase,
    enqueueJobUseCase,
  } = await import("../../web/lib/di/container");

  const loop = new AsyncWorkerLoop({
    processors: {
      processJobs: (limit) => processJobBatchUseCase.execute(limit),
      processOutbox: (limit) => processOutboxBatchUseCase.execute(limit),
    },
    jobBatchLimit: config.jobBatchLimit,
    outboxBatchLimit: config.outboxBatchLimit,
    recoveryIntervalMs: config.recoveryIntervalMs,
  });

  const scheduler = new SchedulerRunner({
    hooks: buildSchedulerHooks(config.scheduler, {
      scheduleIcalPollsUseCase,
      enqueueJobUseCase,
      // Future Booking.com / OTA retrieval ports register here.
      providerRetrievalPorts: [],
    }),
  });

  const listener = new PgWakeListener({
    connectionUrl: config.listenDatabaseUrl,
    onWake: (kind) => loop.signalWake(kind),
    onFailure: () => {
      // Recovery sweep continues independently of listener health.
    },
    reconnectInitialMs: config.listenerReconnectInitialMs,
    reconnectMaxMs: config.listenerReconnectMaxMs,
  });

  const shutdown = async (signal: string) => {
    workerLog.info("worker_stopping", { signal });
    // Stop new scheduled work first; allow in-flight scheduler ticks to finish.
    await scheduler.stop();
    await listener.stop();
    await loop.stop();
    process.exitCode = 0;
  };

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });

  loop.start();
  scheduler.start();
  await listener.start();
  await loop.waitUntilStopped();
}

main().catch((error) => {
  workerLog.error("worker_fatal", {
    reason: error instanceof Error ? error.message : "unknown",
  });
  process.exitCode = 1;
});

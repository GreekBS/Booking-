/**
 * Talos async worker entrypoint.
 *
 * Invokes ProcessJobBatchUseCase / ProcessOutboxBatchUseCase directly (no HTTP for jobs).
 * Schedulers enqueue durable work via ScheduleIcalPollsUseCase / EnqueueJobUseCase.
 * Minimal /healthz for Railway. Does NOT activate Production by default.
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorkerConfig, shouldLoadLocalDotenv } from "./config";
import { AsyncWorkerLoop } from "./loop";
import { PgWakeListener } from "./listener";
import { workerLog } from "./logger";
import { SchedulerRunner, buildSchedulerHooks, createBookingComProviderRetrievalPort } from "./scheduler";
import { WorkerHealthState } from "./healthState";
import { startHealthServer } from "./healthServer";

const here = fileURLToPath(new URL(".", import.meta.url));

// Platform env is authoritative on Railway / Production. Local dotenv is opt-in only.
if (shouldLoadLocalDotenv()) {
  loadEnv({ path: resolve(here, "../../web/.env.local") });
  loadEnv({ path: resolve(here, "../../../.env") });
  loadEnv({ path: resolve(here, "../.env") });
}

async function main(): Promise<void> {
  // Resolve + validate DB targets BEFORE importing Prisma / web DI.
  const config = loadWorkerConfig();
  const health = new WorkerHealthState({
    recoveryAliveWindowMs: Math.max(config.recoveryIntervalMs * 5, 15_000),
  });

  const { prisma } = await import("@hcp/database");
  const {
    processJobBatchUseCase,
    processOutboxBatchUseCase,
    scheduleIcalPollsUseCase,
    enqueueJobUseCase,
    executeChannelPollConnectionUseCase,
  } = await import("../../web/lib/di/container");
  const { PrismaEligibleBookingComRetrievalConnectionReader } = await import(
    "@hcp/database"
  );
  const { parseChannelsEnabledProviders } = await import(
    "../../web/lib/channels/enabled-providers"
  );

  const enabledProviders = parseChannelsEnabledProviders(
    process.env.CHANNELS_ENABLED_PROVIDERS,
  );
  const providerRetrievalPorts =
    enabledProviders.includes("booking_com")
      ? [
          createBookingComProviderRetrievalPort({
            listActiveBookingComConnections: () =>
              new PrismaEligibleBookingComRetrievalConnectionReader().listEligible(),
            executePollConnection: async (target) => {
              await executeChannelPollConnectionUseCase.execute({
                tenantId: target.tenantId,
                connectionId: target.connectionId,
              });
            },
          }),
        ]
      : [];

  try {
    await prisma.$queryRaw`SELECT 1`;
    health.setProcessingDbOk(true);
  } catch {
    health.setProcessingDbOk(false);
    throw new Error("Worker processing database connectivity check failed");
  }

  const healthServer = await startHealthServer(health, { port: config.healthPort });

  const loop = new AsyncWorkerLoop({
    processors: {
      processJobs: (limit) => processJobBatchUseCase.execute(limit),
      processOutbox: (limit) => processOutboxBatchUseCase.execute(limit),
    },
    jobBatchLimit: config.jobBatchLimit,
    outboxBatchLimit: config.outboxBatchLimit,
    recoveryIntervalMs: config.recoveryIntervalMs,
    onRecoverySweep: () => health.markRecoverySweep(),
  });

  const scheduler = new SchedulerRunner({
    hooks: buildSchedulerHooks(config.scheduler, {
      scheduleIcalPollsUseCase,
      enqueueJobUseCase,
      providerRetrievalPorts,
    }),
    onActivity: () => health.markSchedulerActivity(),
  });

  const listener = new PgWakeListener({
    connectionUrl: config.listenDatabaseUrl,
    onWake: (kind) => loop.signalWake(kind),
    onFailure: () => {
      health.setListenerStatus("disconnected");
    },
    reconnectInitialMs: config.listenerReconnectInitialMs,
    reconnectMaxMs: config.listenerReconnectMaxMs,
  });

  const syncListenerHealth = () => {
    health.setListenerStatus(
      listener.isConnected() ? "connected" : "disconnected",
    );
  };

  const shutdown = async (signal: string) => {
    workerLog.info("worker_stopping", { signal });
    await scheduler.stop();
    await listener.stop();
    syncListenerHealth();
    await loop.stop();
    await healthServer.close().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
    process.exitCode = 0;
  };

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });

  health.markProcessStarted();
  loop.start();
  scheduler.start();
  health.markSchedulerStarted();
  await listener.start();
  syncListenerHealth();

  const healthTimer = setInterval(() => {
    syncListenerHealth();
  }, 5_000);
  healthTimer.unref?.();

  await loop.waitUntilStopped();
  clearInterval(healthTimer);
}

main().catch((error) => {
  workerLog.error("worker_fatal", {
    reason: error instanceof Error ? error.message : "unknown",
  });
  process.exitCode = 1;
});

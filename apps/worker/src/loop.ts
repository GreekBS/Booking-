/**
 * Always-on async worker loop.
 *
 * DURABILITY: PostgreSQL background_jobs / outbox_events
 * EXECUTION: this loop invokes ProcessJobBatchUseCase / ProcessOutboxBatchUseCase
 * WAKE-UP: LISTEN/NOTIFY (best-effort)
 * RECOVERY: periodic sweep (~1–3s)
 *
 * SCHEDULING lives in SchedulerRunner (independent cadences) — not on the recovery tick.
 */

import {
  type Result,
  type ProcessJobBatchResult,
  type ProcessOutboxBatchResult,
} from "@hcp/domain";
import { workerLog } from "./logger";
import type { WakeKind } from "./listener";

export type BatchProcessor = {
  processJobs: (limit: number) => Promise<Result<ProcessJobBatchResult, Error>>;
  processOutbox: (limit: number) => Promise<Result<ProcessOutboxBatchResult, Error>>;
};

export type AsyncWorkerLoopOptions = {
  processors: BatchProcessor;
  jobBatchLimit: number;
  outboxBatchLimit: number;
  recoveryIntervalMs: number;
  now?: () => number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  /** Optional hook after each recovery/drain cycle (health). */
  onRecoverySweep?: () => void;
};

export class AsyncWorkerLoop {
  private readonly abort = new AbortController();
  private wakePending = false;
  private wakeJobs = false;
  private wakeOutbox = false;
  private runPromise: Promise<void> | null = null;
  private draining = false;

  constructor(private readonly options: AsyncWorkerLoopOptions) {}

  signalWake(kind: WakeKind = "any"): void {
    this.wakePending = true;
    if (kind === "jobs" || kind === "any") this.wakeJobs = true;
    if (kind === "outbox" || kind === "any") this.wakeOutbox = true;
  }

  start(): void {
    if (this.runPromise) return;
    workerLog.info("worker_started", {
      recoveryIntervalMs: this.options.recoveryIntervalMs,
      jobBatchLimit: this.options.jobBatchLimit,
      outboxBatchLimit: this.options.outboxBatchLimit,
    });
    this.runPromise = this.run();
  }

  async stop(): Promise<void> {
    if (this.abort.signal.aborted) {
      await this.runPromise;
      return;
    }
    workerLog.info("worker_stopping");
    this.abort.abort();
    this.signalWake("any");
    await this.runPromise;
    // Do not abandon in-flight drain — run() finishes current drain before exit.
  }

  async waitUntilStopped(): Promise<void> {
    await this.runPromise;
  }

  /** Exposed for tests — one drain cycle. */
  async drainOnce(): Promise<void> {
    await this.drain();
  }

  private async run(): Promise<void> {
    const sleep =
      this.options.sleep ??
      ((ms: number, signal: AbortSignal) => sleepWithAbort(ms, signal));
    const now = this.options.now ?? (() => Date.now());

    // Startup recovery: process any pending durable work before waiting.
    await this.drain();
    this.options.onRecoverySweep?.();

    let lastRecoveryAt = now();

    while (!this.abort.signal.aborted) {
      const remaining = Math.max(
        0,
        this.options.recoveryIntervalMs - (now() - lastRecoveryAt),
      );

      if (!this.wakePending && remaining > 0) {
        await sleep(remaining, this.abort.signal).catch(() => undefined);
      }

      if (this.abort.signal.aborted) break;

      const wakeDriven = this.wakePending;
      this.wakePending = false;

      const dueRecovery = now() - lastRecoveryAt >= this.options.recoveryIntervalMs;
      if (dueRecovery || wakeDriven) {
        await this.drain();
        this.options.onRecoverySweep?.();
        if (dueRecovery) {
          lastRecoveryAt = now();
        }
      }
    }
  }

  private async drain(): Promise<void> {
    if (this.draining) {
      // Coalesce concurrent wake signals into the in-flight drain + one follow-up.
      this.wakePending = true;
      return;
    }
    this.draining = true;
    try {
      let guard = 0;
      do {
        this.wakeJobs = false;
        this.wakeOutbox = false;
        this.wakePending = false;

        await this.drainJobs();
        await this.drainOutbox();

        // If another wake arrived mid-drain, loop once more.
        guard += 1;
      } while (this.wakePending && guard < 8 && !this.abort.signal.aborted);
    } finally {
      this.draining = false;
    }
  }

  private async drainJobs(): Promise<void> {
    let emptyStreak = 0;
    while (!this.abort.signal.aborted && emptyStreak < 1) {
      const result = await this.options.processors.processJobs(
        this.options.jobBatchLimit,
      );
      if (result.isFailure) {
        workerLog.error("job_batch_failure", {
          reason: result.getError().message,
        });
        break;
      }
      const value = result.getValue();
      if (value.claimed > 0) {
        workerLog.info("job_batch_processed", {
          claimed: value.claimed,
          completed: value.completed,
          retried: value.retried,
          deadLettered: value.deadLettered,
        });
        emptyStreak = 0;
      } else {
        emptyStreak += 1;
      }
      if (value.claimed < this.options.jobBatchLimit) break;
    }
  }

  private async drainOutbox(): Promise<void> {
    let emptyStreak = 0;
    while (!this.abort.signal.aborted && emptyStreak < 1) {
      const result = await this.options.processors.processOutbox(
        this.options.outboxBatchLimit,
      );
      if (result.isFailure) {
        workerLog.error("outbox_batch_failure", {
          reason: result.getError().message,
        });
        break;
      }
      const value = result.getValue();
      if (value.claimed > 0) {
        workerLog.info("outbox_batch_processed", {
          claimed: value.claimed,
          completed: value.completed,
          retried: value.retried,
          deadLettered: value.deadLettered,
        });
        emptyStreak = 0;
      } else {
        emptyStreak += 1;
      }
      if (value.claimed < this.options.outboxBatchLimit) break;
    }
  }
}

function sleepWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("aborted"));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

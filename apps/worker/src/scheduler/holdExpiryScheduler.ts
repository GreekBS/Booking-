/**
 * Hold-expiry scheduler.
 *
 * Cadence default: 60s.
 * Why: booking holds default TTL is 15 minutes (ADR-011). A 60s discovery tick
 * releases expired holds within about one minute without Vercel Cron, while
 * minute-bucket idempotency (`expire_holds:YYYY-MM-DDTHH:MM`) keeps multi-replica
 * enqueues converged on a single durable job per minute.
 *
 * Flow: timer → EnqueueJobUseCase(expire_holds) → wake → ExpireHoldsJobHandler
 * → ExpireHoldsUseCase. No second expiry implementation.
 */

import {
  EXPIRE_HOLDS_JOB_TYPE,
  type EnqueueJobUseCase,
  type Result,
  type BackgroundJobEntry,
} from "@hcp/domain";
import type { SchedulerHookDefinition, SchedulerTickResult } from "./types";

export const HOLD_EXPIRY_SCHEDULER_HOOK_NAME = "hold_expiry_scheduler";

/** Minute-bucket key — authoritative for multi-worker idempotency. */
export function buildExpireHoldsIdempotencyKey(now: Date = new Date()): string {
  return `expire_holds:${now.toISOString().slice(0, 16)}`;
}

export function createHoldExpirySchedulerHook(options: {
  enabled: boolean;
  intervalMs: number;
  enqueueJob: Pick<EnqueueJobUseCase, "execute">;
  /** Max holds to expire per job (passed to ExpireHoldsJobHandler). */
  limit?: number;
}): SchedulerHookDefinition {
  const limit = options.limit ?? 100;
  return {
    name: HOLD_EXPIRY_SCHEDULER_HOOK_NAME,
    enabled: options.enabled,
    intervalMs: options.intervalMs,
    run: async (ctx) => {
      if (ctx.signal.aborted) return;
      const now = ctx.now();
      const result: Result<BackgroundJobEntry, Error> =
        await options.enqueueJob.execute({
          jobType: EXPIRE_HOLDS_JOB_TYPE,
          payload: { limit },
          idempotencyKey: buildExpireHoldsIdempotencyKey(now),
          runAt: now,
        });
      if (result.isFailure) {
        throw result.getError();
      }
      const job = result.getValue();
      // Only surface when a pending durable job exists for this minute bucket.
      // Quiet when the same-minute job already completed (avoid per-interval noise).
      if (job.status === "pending") {
        return {
          enqueued: 1,
          details: { jobStatus: job.status },
        } satisfies SchedulerTickResult;
      }
      return;
    },
  };
}

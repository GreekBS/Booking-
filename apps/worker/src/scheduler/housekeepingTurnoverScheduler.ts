/**
 * Housekeeping turnover scheduler.
 *
 * Cadence default: 5 minutes.
 * Window: confirmed bookings with checkOut in [today-7d, today] (property-local).
 * Idempotency: minute-bucket key generate_housekeeping_turnover:YYYY-MM-DDTHH:MM
 */

import {
  GENERATE_HOUSEKEEPING_TURNOVER_JOB_TYPE,
  type EnqueueJobUseCase,
  type Result,
  type BackgroundJobEntry,
} from "@hcp/domain";
import type { SchedulerHookDefinition, SchedulerTickResult } from "./types";

export const HOUSEKEEPING_TURNOVER_SCHEDULER_HOOK_NAME =
  "housekeeping_turnover_scheduler";

export function buildHousekeepingTurnoverIdempotencyKey(
  now: Date = new Date(),
): string {
  return `generate_housekeeping_turnover:${now.toISOString().slice(0, 16)}`;
}

export function createHousekeepingTurnoverSchedulerHook(options: {
  enabled: boolean;
  intervalMs: number;
  enqueueJob: Pick<EnqueueJobUseCase, "execute">;
  limit?: number;
}): SchedulerHookDefinition {
  const limit = options.limit ?? 200;
  return {
    name: HOUSEKEEPING_TURNOVER_SCHEDULER_HOOK_NAME,
    enabled: options.enabled,
    intervalMs: options.intervalMs,
    run: async (ctx) => {
      if (ctx.signal.aborted) return;
      const now = ctx.now();
      const result: Result<BackgroundJobEntry, Error> =
        await options.enqueueJob.execute({
          jobType: GENERATE_HOUSEKEEPING_TURNOVER_JOB_TYPE,
          payload: { limit },
          idempotencyKey: buildHousekeepingTurnoverIdempotencyKey(now),
          runAt: now,
        });
      if (result.isFailure) {
        throw result.getError();
      }
      const job = result.getValue();
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

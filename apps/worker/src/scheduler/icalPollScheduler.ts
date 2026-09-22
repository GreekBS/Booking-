/**
 * iCal poll discovery scheduler.
 *
 * timer → ScheduleIcalPollsUseCase → durable poll_channel_connection jobs → wake → drain
 *
 * Does not execute iCal inventory/business logic.
 * Multi-replica safety: ScheduleIcalPollsUseCase bucket idempotency keys.
 */

import type { Result, ScheduleIcalPollsResult } from "@hcp/domain";
import type { SchedulerHookDefinition, SchedulerTickResult } from "./types";

export const ICAL_POLL_SCHEDULER_HOOK_NAME = "ical_poll_scheduler";

export type ScheduleIcalPollsExecutor = {
  execute: (options?: {
    now?: Date;
  }) => Promise<Result<ScheduleIcalPollsResult, Error>>;
};

export function createIcalPollSchedulerHook(options: {
  enabled: boolean;
  intervalMs: number;
  scheduleIcalPolls: ScheduleIcalPollsExecutor;
}): SchedulerHookDefinition {
  return {
    name: ICAL_POLL_SCHEDULER_HOOK_NAME,
    enabled: options.enabled,
    intervalMs: options.intervalMs,
    run: async (ctx) => {
      if (ctx.signal.aborted) return;
      const result = await options.scheduleIcalPolls.execute({ now: ctx.now() });
      if (result.isFailure) {
        throw result.getError();
      }
      const value = result.getValue();
      const tick: SchedulerTickResult = {
        examined: value.examined,
        enqueued: value.enqueuedPolls + value.enqueuedSweep,
        skipped: value.skipped,
        details: {
          enqueuedPolls: value.enqueuedPolls,
          enqueuedSweep: value.enqueuedSweep,
        },
      };
      return tick;
    },
  };
}

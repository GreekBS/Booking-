/**
 * Reservation-import draft expiry scheduler (physical cleanup only).
 *
 * Logical expiry is `expiresAt <= now` enforced by domain/repository.
 * This hook only enqueues expire_reservation_import_drafts for row/batch cleanup.
 *
 * Cadence default: 5 minutes (independent of the 72h draft lifetime).
 * Minute-bucket idempotency keeps multi-replica enqueues converged.
 */

import {
  EXPIRE_RESERVATION_IMPORT_DRAFTS_JOB_TYPE,
  type EnqueueJobUseCase,
  type Result,
  type BackgroundJobEntry,
} from "@hcp/domain";
import type { SchedulerHookDefinition, SchedulerTickResult } from "./types";

export const RESERVATION_IMPORT_DRAFT_EXPIRY_SCHEDULER_HOOK_NAME =
  "reservation_import_draft_expiry_scheduler";

/** Minute-bucket key — authoritative for multi-worker idempotency. */
export function buildExpireReservationImportDraftsIdempotencyKey(
  now: Date = new Date(),
): string {
  return `expire_reservation_import_drafts:${now.toISOString().slice(0, 16)}`;
}

export function createReservationImportDraftExpirySchedulerHook(options: {
  enabled: boolean;
  intervalMs: number;
  enqueueJob: Pick<EnqueueJobUseCase, "execute">;
  /** Max batches to expire per job. */
  limit?: number;
}): SchedulerHookDefinition {
  const limit = options.limit ?? 100;
  return {
    name: RESERVATION_IMPORT_DRAFT_EXPIRY_SCHEDULER_HOOK_NAME,
    enabled: options.enabled,
    intervalMs: options.intervalMs,
    run: async (ctx) => {
      if (ctx.signal.aborted) return;
      const now = ctx.now();
      const result: Result<BackgroundJobEntry, Error> =
        await options.enqueueJob.execute({
          jobType: EXPIRE_RESERVATION_IMPORT_DRAFTS_JOB_TYPE,
          payload: { limit },
          idempotencyKey: buildExpireReservationImportDraftsIdempotencyKey(now),
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

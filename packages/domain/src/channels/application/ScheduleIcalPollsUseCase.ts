import { Result } from "../../shared/kernel/Result";
import type { EnqueueJobUseCase } from "../../platform/async/jobs/application/EnqueueJobUseCase";
import { SWEEP_PENDING_ICAL_INVENTORY_RECONCILE_JOB_TYPE } from "../../platform/async/jobs/types/JobTypes";
import type { IEligibleIcalPollConnectionReader } from "../ports/IEligibleIcalPollConnectionReader";
import type { IChannelPollJobQuery } from "../ports/IChannelPollJobQuery";
import type { IChannelProviderRegistry } from "../ports/providers/IChannelProviderRegistry";
import type { EnqueueChannelConnectionPollUseCase } from "./EnqueueChannelConnectionPollUseCase";
import {
  buildScheduledPollIdempotencyKey,
  icalPollBucket,
  resolveIcalPollIntervalMs,
} from "../providers/ical/inventory/icalPollJobIdentity";
import type { ActorContext } from "../../shared/services/PermissionChecker";

export interface ScheduleIcalPollsResult {
  readonly examined: number;
  readonly enqueuedPolls: number;
  readonly skipped: number;
  readonly enqueuedSweep: number;
  readonly skippedReasons: {
    readonly inFlight: number;
    readonly deadLetter: number;
    readonly sameBucketTerminal: number;
    readonly providerNotRegistered: number;
    readonly enqueueFailed: number;
  };
}

export type ScheduleIcalPollsLogFn = (fields: Record<string, unknown>) => void;

function buildSweepIdempotencyKey(bucket: number): string {
  return `sweep_pending_ical_inventory_reconcile:sched:${bucket}`;
}

const INTERNAL_ACTOR: ActorContext = {
  userId: "system:schedule-ical-polls",
  role: "admin",
  propertyIds: null,
  isSuperAdmin: true,
};

/**
 * P1-S7b — enumerate eligible iCal connections and enqueue race-safe scheduled polls.
 * Also enqueues at most one sweep job per scheduling bucket.
 * Does not perform provider I/O.
 */
export class ScheduleIcalPollsUseCase {
  constructor(
    private readonly eligibleReader: IEligibleIcalPollConnectionReader,
    private readonly pollJobQuery: IChannelPollJobQuery,
    private readonly enqueuePoll: EnqueueChannelConnectionPollUseCase,
    private readonly enqueueJobUseCase: EnqueueJobUseCase,
    private readonly providerRegistry: IChannelProviderRegistry,
    private readonly pollingEnabled: () => boolean,
    private readonly log: ScheduleIcalPollsLogFn = () => {},
    private readonly batchLimit = 500,
  ) {}

  async execute(options?: {
    now?: Date;
    random?: () => number;
  }): Promise<Result<ScheduleIcalPollsResult, Error>> {
    try {
      if (!this.pollingEnabled()) {
        return Result.ok({
          examined: 0,
          enqueuedPolls: 0,
          skipped: 0,
          enqueuedSweep: 0,
          skippedReasons: {
            inFlight: 0,
            deadLetter: 0,
            sameBucketTerminal: 0,
            providerNotRegistered: 0,
            enqueueFailed: 0,
          },
        });
      }

      const now = options?.now ?? new Date();
      const intervalMs = resolveIcalPollIntervalMs();
      const bucket = icalPollBucket(now.getTime(), intervalMs);

      const eligible = await this.eligibleReader.listEligible(this.batchLimit);
      let enqueuedPolls = 0;
      let skipped = 0;
      const skippedReasons = {
        inFlight: 0,
        deadLetter: 0,
        sameBucketTerminal: 0,
        providerNotRegistered: 0,
        enqueueFailed: 0,
      };

      for (const row of eligible) {
        const registration = this.providerRegistry.get("ical");
        if (!registration?.capabilities.inbound.polling || !registration.polling) {
          skipped += 1;
          skippedReasons.providerNotRegistered += 1;
          continue;
        }

        const inFlight = await this.pollJobQuery.findInFlightPoll({
          tenantId: row.tenantId,
          connectionId: row.connectionId,
        });
        if (inFlight) {
          skipped += 1;
          skippedReasons.inFlight += 1;
          continue;
        }

        const latest = await this.pollJobQuery.findLatestPoll({
          tenantId: row.tenantId,
          connectionId: row.connectionId,
        });
        if (latest?.status === "dead_letter") {
          skipped += 1;
          skippedReasons.deadLetter += 1;
          this.log({
            action: "channels.ical_poll_schedule_skipped",
            reasonCode: "poll_job_dead_letter",
            tenantId: row.tenantId,
            connectionId: row.connectionId,
          });
          continue;
        }

        // completed within interval → skip (interval elapsed → may enqueue current bucket)
        if (latest?.status === "completed") {
          const completedAt = latest.completedAt ?? latest.createdAt;
          if (now.getTime() - completedAt.getTime() < intervalMs) {
            skipped += 1;
            skippedReasons.sameBucketTerminal += 1;
            continue;
          }
        }

        const scheduledKey = buildScheduledPollIdempotencyKey(
          row.tenantId,
          row.connectionId,
          bucket,
        );
        // cancelled is terminal for the current deterministic bucket only
        if (
          latest &&
          latest.idempotencyKey === scheduledKey &&
          latest.status === "cancelled"
        ) {
          skipped += 1;
          skippedReasons.sameBucketTerminal += 1;
          continue;
        }

        const result = await this.enqueuePoll.execute(
          {
            tenantId: row.tenantId,
            connectionId: row.connectionId,
            mode: "scheduled",
            now,
            random: options?.random,
            bypassPermissionCheck: true,
          },
          INTERNAL_ACTOR,
        );
        if (result.isFailure) {
          skipped += 1;
          skippedReasons.enqueueFailed += 1;
          this.log({
            action: "channels.ical_poll_schedule_enqueue_failed",
            tenantId: row.tenantId,
            connectionId: row.connectionId,
            message: result.getError().message,
          });
          continue;
        }

        const value = result.getValue();
        if (
          value.reusedExisting &&
          (value.job.status === "completed" ||
            value.job.status === "cancelled" ||
            value.job.status === "dead_letter")
        ) {
          skipped += 1;
          skippedReasons.sameBucketTerminal += 1;
          continue;
        }
        if (value.reusedExisting && value.job.status === "pending") {
          // Concurrent scheduler converged on same pending job.
          enqueuedPolls += 1;
          continue;
        }
        if (value.job.status === "pending") {
          enqueuedPolls += 1;
        } else {
          skipped += 1;
          skippedReasons.sameBucketTerminal += 1;
        }
      }

      let enqueuedSweep = 0;
      // At most one sweep per scheduling bucket. Handler no-ops when apply is OFF.
      // Sweep never auto-redrives dead_letter/cancelled (ForceRedrive only).
      const sweep = await this.enqueueJobUseCase.execute({
        jobType: SWEEP_PENDING_ICAL_INVENTORY_RECONCILE_JOB_TYPE,
        payload: { bucket },
        idempotencyKey: buildSweepIdempotencyKey(bucket),
        runAt: now,
      });
      if (sweep.isSuccess) {
        const job = sweep.getValue();
        if (job.status === "pending") {
          enqueuedSweep = 1;
        }
      }

      return Result.ok({
        examined: eligible.length,
        enqueuedPolls,
        skipped,
        enqueuedSweep,
        skippedReasons,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

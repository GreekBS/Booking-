import { Result } from "../../shared/kernel/Result";
import { isChannelInventoryApplyEnabled } from "./channelInventoryApplyGate";
import type { EnqueueJobUseCase } from "../../platform/async/jobs/application/EnqueueJobUseCase";
import type { BackgroundJobEntry, BackgroundJobStatus } from "../../shared/types/index";
import {
  RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE,
} from "../../platform/async/jobs/types/JobTypes";
import {
  buildIcalInventoryReconcilePrimaryJobKey,
  buildIcalInventoryReconcileSuccessorJobKey,
} from "../providers/ical/inventory/icalInventoryReconcileJobIdentity";
import type { IChannelConnectionStatusFinder } from "../ports/IChannelConnectionStatusFinder";

export interface PendingInventoryReconciliationRef {
  readonly tenantId: string;
  readonly connectionId: string;
  readonly cursorVersion: number;
  readonly semanticConfigVersion: number;
  readonly mappingId: string;
  readonly mappingVersion: number;
}

export interface IPendingIcalInventoryReconciliationReader {
  listPending(limit: number): Promise<readonly PendingInventoryReconciliationRef[]>;
}

export interface IIcalInventoryReconcileJobQuery {
  listJobsForGeneration(params: {
    tenantId: string;
    connectionId: string;
    cursorVersion: number;
  }): Promise<readonly BackgroundJobEntry[]>;
}

export type SweepLogFn = (fields: Record<string, unknown>) => void;

export interface SweepPendingIcalInventoryReconcileResult {
  readonly examined: number;
  readonly enqueuedPrimary: number;
  readonly enqueuedSuccessor: number;
  readonly skippedInFlight: number;
  readonly stuckDeadLetter: number;
  readonly stuckCancelled: number;
  /** P1-S6c: generations skipped because the connection is not active. */
  readonly skippedLifecycle: number;
  /** P1-S7c: generations skipped because connection inventory apply is OFF. */
  readonly skippedConnectionApplyOff: number;
  readonly skippedFlagOff: boolean;
}

const IN_FLIGHT: ReadonlySet<BackgroundJobStatus> = new Set(["pending", "processing"]);

/**
 * Scheduled sweep — durable redrive for pending generations.
 * Does NOT auto-redrive dead_letter / cancelled.
 *
 * P1-S6c: a generation is only redriven while its connection is `active`. Paused
 * (including paused-for-rotation), error, disconnected, and deleted connections
 * are skipped with `lifecycle_not_active` so operator lifecycle state — not the
 * scheduler — decides when inventory work resumes.
 */
export class SweepPendingIcalInventoryReconcileUseCase {
  constructor(
    private readonly reader: IPendingIcalInventoryReconciliationReader,
    private readonly jobQuery: IIcalInventoryReconcileJobQuery,
    private readonly enqueueJobUseCase: EnqueueJobUseCase,
    private readonly connectionStatusFinder: IChannelConnectionStatusFinder,
    private readonly log: SweepLogFn = () => {},
    private readonly batchSize = 50,
  ) {}

  async execute(): Promise<Result<SweepPendingIcalInventoryReconcileResult, Error>> {
    try {
      if (!isChannelInventoryApplyEnabled()) {
        return Result.ok({
          examined: 0,
          enqueuedPrimary: 0,
          enqueuedSuccessor: 0,
          skippedInFlight: 0,
          stuckDeadLetter: 0,
          stuckCancelled: 0,
          skippedLifecycle: 0,
          skippedConnectionApplyOff: 0,
          skippedFlagOff: true,
        });
      }

      const pending = await this.reader.listPending(this.batchSize);
      let enqueuedPrimary = 0;
      let enqueuedSuccessor = 0;
      let skippedInFlight = 0;
      let stuckDeadLetter = 0;
      let stuckCancelled = 0;
      let skippedLifecycle = 0;
      let skippedConnectionApplyOff = 0;

      for (const gen of pending) {
        const gate = await this.connectionStatusFinder.findRedriveGate(
          gen.tenantId,
          gen.connectionId,
        );
        if (gate === null || gate.status !== "active") {
          skippedLifecycle += 1;
          this.log({
            action: "channels.ical_inventory_reconcile_skipped",
            reasonCode: "lifecycle_not_active",
            tenantId: gen.tenantId,
            connectionId: gen.connectionId,
            cursorVersion: gen.cursorVersion,
            connectionStatus: gate?.status ?? "not_found",
          });
          continue;
        }
        if (gate.inventoryApplyEnabled !== true) {
          skippedConnectionApplyOff += 1;
          this.log({
            action: "channels.ical_inventory_reconcile_skipped",
            reasonCode: "connection_inventory_apply_disabled",
            tenantId: gen.tenantId,
            connectionId: gen.connectionId,
            cursorVersion: gen.cursorVersion,
          });
          continue;
        }

        const jobs = await this.jobQuery.listJobsForGeneration({
          tenantId: gen.tenantId,
          connectionId: gen.connectionId,
          cursorVersion: gen.cursorVersion,
        });
        const ordered = [...jobs].sort((a, b) => {
          const byCreated = b.createdAt.getTime() - a.createdAt.getTime();
          if (byCreated !== 0) return byCreated;
          return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
        });

        if (ordered.length === 0) {
          const key = buildIcalInventoryReconcilePrimaryJobKey({
            tenantId: gen.tenantId,
            connectionId: gen.connectionId,
            cursorVersion: gen.cursorVersion,
          });
          const result = await this.enqueueJobUseCase.execute({
            tenantId: gen.tenantId,
            jobType: RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE,
            idempotencyKey: key,
            payload: {
              connectionId: gen.connectionId,
              cursorVersion: gen.cursorVersion,
              semanticConfigVersion: gen.semanticConfigVersion,
              mappingId: gen.mappingId,
              mappingVersion: gen.mappingVersion,
            },
          });
          if (result.isFailure) {
            throw result.getError();
          }
          enqueuedPrimary += 1;
          continue;
        }

        const latest = ordered[0]!;
        if (IN_FLIGHT.has(latest.status)) {
          skippedInFlight += 1;
          continue;
        }
        if (latest.status === "dead_letter") {
          stuckDeadLetter += 1;
          this.log({
            action: "channels.ical_inventory_reconcile_stuck",
            stuckReason: "dead_letter",
            tenantId: gen.tenantId,
            connectionId: gen.connectionId,
            cursorVersion: gen.cursorVersion,
            jobId: latest.id,
          });
          continue;
        }
        if (latest.status === "cancelled") {
          stuckCancelled += 1;
          this.log({
            action: "channels.ical_inventory_reconcile_stuck",
            stuckReason: "cancelled",
            tenantId: gen.tenantId,
            connectionId: gen.connectionId,
            cursorVersion: gen.cursorVersion,
            jobId: latest.id,
          });
          continue;
        }
        if (latest.status === "completed") {
          const key = buildIcalInventoryReconcileSuccessorJobKey(
            {
              tenantId: gen.tenantId,
              connectionId: gen.connectionId,
              cursorVersion: gen.cursorVersion,
            },
            latest.id,
          );
          const result = await this.enqueueJobUseCase.execute({
            tenantId: gen.tenantId,
            jobType: RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE,
            idempotencyKey: key,
            payload: {
              connectionId: gen.connectionId,
              cursorVersion: gen.cursorVersion,
              semanticConfigVersion: gen.semanticConfigVersion,
              mappingId: gen.mappingId,
              mappingVersion: gen.mappingVersion,
            },
          });
          if (result.isFailure) {
            throw result.getError();
          }
          enqueuedSuccessor += 1;
        }
      }

      return Result.ok({
        examined: pending.length,
        enqueuedPrimary,
        enqueuedSuccessor,
        skippedInFlight,
        stuckDeadLetter,
        stuckCancelled,
        skippedLifecycle,
        skippedConnectionApplyOff,
        skippedFlagOff: false,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

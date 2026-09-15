import { Result } from "../../shared/kernel/Result";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/DomainError";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import type { UseCaseAuditContext } from "../../shared/types/AuditContext";
import type { IAuditLogRepository } from "../../shared/ports/InfrastructurePorts";
import { isChannelInventoryApplyEnabled } from "./channelInventoryApplyGate";
import type { EnqueueJobUseCase } from "../../platform/async/jobs/application/EnqueueJobUseCase";
import type {
  IIcalInventoryReconcileJobQuery,
  PendingInventoryReconciliationRef,
} from "./SweepPendingIcalInventoryReconcileUseCase";
import { RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE } from "../../platform/async/jobs/types/JobTypes";
import { buildIcalInventoryReconcileSuccessorJobKey } from "../providers/ical/inventory/icalInventoryReconcileJobIdentity";
import type { IChannelConnectionStatusFinder } from "../ports/IChannelConnectionStatusFinder";

export interface ForceRedrivePendingIcalInventoryReconcileCommand {
  tenantId: string;
  connectionId: string;
  cursorVersion: number;
}

export interface ForceRedrivePendingIcalInventoryReconcileResult {
  readonly jobId: string;
  readonly predecessorJobId: string;
  readonly idempotencyKey: string;
  /** Present when a new successor was enqueued from a terminal predecessor. */
  readonly previousJobStatus?: "dead_letter" | "cancelled";
}

export type ForceRedriveLogFn = (fields: Record<string, unknown>) => void;

/**
 * Explicit operator recovery for pending + dead_letter|cancelled.
 * Does not bypass via scheduled sweep.
 *
 * Authorization and durable audit live here (operator use-case boundary).
 * P1-S6c: fails closed unless the connection is `active`. A paused connection —
 * including one paused for credential rotation — must be resumed by an operator
 * before inventory work is redriven.
 */
export class ForceRedrivePendingIcalInventoryReconcileUseCase {
  constructor(
    private readonly jobQuery: IIcalInventoryReconcileJobQuery,
    private readonly enqueueJobUseCase: EnqueueJobUseCase,
    private readonly findPendingGeneration: (
      tenantId: string,
      connectionId: string,
      cursorVersion: number,
    ) => Promise<PendingInventoryReconciliationRef | null>,
    private readonly connectionStatusFinder: IChannelConnectionStatusFinder,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditLog: IAuditLogRepository,
    private readonly log: ForceRedriveLogFn = () => {},
  ) {}

  async execute(
    command: ForceRedrivePendingIcalInventoryReconcileCommand,
    actor: ActorContext,
    audit: UseCaseAuditContext,
  ): Promise<Result<ForceRedrivePendingIcalInventoryReconcileResult, Error>> {
    try {
      if (!isChannelInventoryApplyEnabled()) {
        return Result.fail(new ConflictError("CHANNELS_INVENTORY_APPLY_ENABLED is not true"));
      }

      const tenantId = command.tenantId.trim();
      const connectionId = command.connectionId.trim();
      if (!tenantId || !connectionId) {
        return Result.fail(new ValidationError("tenantId and connectionId are required"));
      }
      if (!Number.isInteger(command.cursorVersion) || command.cursorVersion < 1) {
        return Result.fail(new ValidationError("cursorVersion must be a positive integer"));
      }

      if (
        !this.permissionChecker.hasPermission(
          actor,
          PERMISSIONS.CHANNELS_CONNECTION_MANAGE,
          tenantId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const gate = await this.connectionStatusFinder.findRedriveGate(
        tenantId,
        connectionId,
      );
      if (gate === null) {
        return Result.fail(new NotFoundError("ChannelConnection", connectionId));
      }
      if (gate.status !== "active") {
        return Result.fail(
          new ConflictError(
            `Force redrive requires an active connection, found: ${gate.status}`,
            "lifecycle_not_active",
          ),
        );
      }
      if (gate.inventoryApplyEnabled !== true) {
        return Result.fail(
          new ConflictError(
            "Force redrive requires connection inventory apply enabled",
            "connection_inventory_apply_disabled",
          ),
        );
      }

      const generation = await this.findPendingGeneration(
        tenantId,
        connectionId,
        command.cursorVersion,
      );
      if (!generation) {
        return Result.fail(
          new NotFoundError(
            "ChannelInventoryReconciliation",
            `${connectionId}:${command.cursorVersion}`,
          ),
        );
      }

      const jobs = await this.jobQuery.listJobsForGeneration({
        tenantId,
        connectionId,
        cursorVersion: command.cursorVersion,
      });
      const ordered = [...jobs].sort((a, b) => {
        const byCreated = b.createdAt.getTime() - a.createdAt.getTime();
        if (byCreated !== 0) return byCreated;
        return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
      });
      const latest = ordered[0];
      if (!latest) {
        return Result.fail(
          new ConflictError(
            "Force redrive requires latest reconcile job to be dead_letter or cancelled",
          ),
        );
      }

      // Successor already pending/processing → idempotent existing result.
      if (latest.status === "pending" || latest.status === "processing") {
        const predecessor = ordered.find(
          (job) =>
            job.id !== latest.id &&
            (job.status === "dead_letter" || job.status === "cancelled"),
        );
        if (predecessor) {
          const expectedKey = buildIcalInventoryReconcileSuccessorJobKey(
            {
              tenantId,
              connectionId,
              cursorVersion: command.cursorVersion,
            },
            predecessor.id,
          );
          if (latest.idempotencyKey === expectedKey) {
            const reused = {
              jobId: latest.id,
              predecessorJobId: predecessor.id,
              idempotencyKey: expectedKey,
            };
            await this.appendAudit(tenantId, connectionId, command.cursorVersion, reused, audit);
            this.log({
              action: "channels.ical_inventory_reconcile_force_redrive",
              tenantId,
              connectionId,
              cursorVersion: command.cursorVersion,
              predecessorJobId: predecessor.id,
              predecessorStatus: predecessor.status,
              jobId: latest.id,
              actorId: audit.actorId,
              reusedExisting: true,
            });
            return Result.ok(reused);
          }
        }
        return Result.fail(
          new ConflictError(
            "Force redrive requires latest reconcile job to be dead_letter or cancelled",
          ),
        );
      }

      if (latest.status !== "dead_letter" && latest.status !== "cancelled") {
        return Result.fail(
          new ConflictError(
            "Force redrive requires latest reconcile job to be dead_letter or cancelled",
          ),
        );
      }

      const predecessorStatus = latest.status;
      const idempotencyKey = buildIcalInventoryReconcileSuccessorJobKey(
        {
          tenantId,
          connectionId,
          cursorVersion: command.cursorVersion,
        },
        latest.id,
      );

      const enqueued = await this.enqueueJobUseCase.execute({
        tenantId,
        jobType: RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE,
        idempotencyKey,
        payload: {
          connectionId,
          cursorVersion: command.cursorVersion,
          semanticConfigVersion: generation.semanticConfigVersion,
          mappingId: generation.mappingId,
          mappingVersion: generation.mappingVersion,
        },
      });
      if (enqueued.isFailure) {
        return Result.fail(enqueued.getError());
      }

      const value: ForceRedrivePendingIcalInventoryReconcileResult = {
        jobId: enqueued.getValue().id,
        predecessorJobId: latest.id,
        idempotencyKey,
        previousJobStatus: predecessorStatus,
      };

      await this.appendAudit(tenantId, connectionId, command.cursorVersion, value, audit);

      this.log({
        action: "channels.ical_inventory_reconcile_force_redrive",
        tenantId,
        connectionId,
        cursorVersion: command.cursorVersion,
        predecessorJobId: latest.id,
        predecessorStatus,
        jobId: value.jobId,
        actorId: audit.actorId,
        reusedExisting: false,
      });

      return Result.ok(value);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async appendAudit(
    tenantId: string,
    connectionId: string,
    cursorVersion: number,
    value: ForceRedrivePendingIcalInventoryReconcileResult,
    audit: UseCaseAuditContext,
  ): Promise<void> {
    await this.auditLog.append({
      tenantId,
      actorId: audit.actorId,
      action: "channel.connection.inventory_reconcile_force_redrive",
      resourceType: "ChannelInventoryReconciliation",
      resourceId: `${connectionId}:${cursorVersion}`,
      metadata: {
        connectionId,
        cursorVersion,
        predecessorJobId: value.predecessorJobId,
        successorJobId: value.jobId,
        idempotencyKey: value.idempotencyKey,
        previousJobStatus: value.previousJobStatus ?? null,
      },
      ipAddress: audit.ipAddress,
    });
  }
}

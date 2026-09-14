import { Result } from "../../shared/kernel/Result";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/DomainError";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import {
  isChannelInventoryApplyEnabled,
  isInventoryApplyEffective,
} from "./channelInventoryApplyGate";
import {
  collectInventoryApplyEnableEligibilityReasons,
  shouldAttentionPendingWithoutRunnableJob,
  type InventoryApplyEnableEligibilityReason,
} from "./inventoryApplyEnableEligibility";
import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import type { IChannelListingMappingRepository } from "../ports/IChannelListingMappingRepository";
import type { IChannelPollCursorRepository } from "../ports/IChannelPollCursorRepository";
import type { IChannelPollJobQuery } from "../ports/IChannelPollJobQuery";
import type { IChannelConnectionHealthQuery } from "../ports/IChannelConnectionHealthQuery";
import type { IIcalCredentialRotationStore } from "../ports/IIcalCredentialRotationStore";
import { resolveIcalPollIntervalMs } from "../providers/ical/inventory/icalPollJobIdentity";

export type ChannelHealthAttentionReason =
  | "poll_job_dead_letter"
  | "reconcile_job_dead_letter"
  | "reconcile_job_cancelled_with_pending_generation"
  | "pending_reconciliation_without_runnable_job"
  | "poll_stale_beyond_2x_interval"
  | "rotation_in_progress";

export type PilotEligibilityReason = InventoryApplyEnableEligibilityReason;

export interface ChannelJobHealthDto {
  readonly id: string;
  readonly status: string;
  readonly attemptCount: number;
  readonly runAt: string;
  readonly nextRetryAt: string | null;
  readonly completedAt: string | null;
}

export interface ChannelReconciliationHealthDto {
  readonly cursorVersion: number;
  readonly status: string;
  readonly appliedAt: string | null;
  readonly errorCode: string | null;
  readonly completeObservedEvidence: boolean;
}

export interface ChannelConnectionHealthDto {
  readonly connectionId: string;
  readonly connectionStatus: string;
  readonly provider: string;
  readonly semanticMode: string;
  readonly semanticConfigVersion: number;
  readonly hasCredentialRef: boolean;
  readonly activeMappingCount: number;
  readonly cursorVersion: number | null;
  readonly cursorUpdatedAt: string | null;
  /** @deprecated Prefer inventoryApplyGloballyEnabled (P1-S7c). */
  readonly inventoryApplyEnabled: boolean;
  readonly inventoryApplyGloballyEnabled: boolean;
  readonly inventoryApplyForConnection: boolean;
  readonly inventoryApplyEffective: boolean;
  readonly pilotEligible: boolean;
  readonly pilotEligibilityReasons: readonly PilotEligibilityReason[];
  readonly activeChannelImportCount: number;
  readonly latestPollJob: ChannelJobHealthDto | null;
  readonly latestReconciliation: ChannelReconciliationHealthDto | null;
  readonly latestReconcileJob: ChannelJobHealthDto | null;
  readonly pendingReconciliationCount: number;
  readonly needsAttention: boolean;
  readonly attentionReasons: readonly ChannelHealthAttentionReason[];
}

export interface GetChannelConnectionHealthCommand {
  tenantId: string;
  connectionId: string;
  now?: Date;
}

function toJobDto(job: {
  id: string;
  status: string;
  attemptCount: number;
  runAt: Date;
  nextRetryAt: Date | null;
  completedAt: Date | null;
}): ChannelJobHealthDto {
  return {
    id: job.id,
    status: job.status,
    attemptCount: job.attemptCount,
    runAt: job.runAt.toISOString(),
    nextRetryAt: job.nextRetryAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
  };
}

/**
 * P1-S7b / P1-S7c — derived connection health (no persisted health columns).
 */
export class GetChannelConnectionHealthUseCase {
  constructor(
    private readonly connectionRepository: IChannelConnectionRepository,
    private readonly mappingRepository: IChannelListingMappingRepository,
    private readonly cursorRepository: IChannelPollCursorRepository,
    private readonly pollJobQuery: IChannelPollJobQuery,
    private readonly healthQuery: IChannelConnectionHealthQuery,
    private readonly rotationStore: IIcalCredentialRotationStore,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    command: GetChannelConnectionHealthCommand,
    actor: ActorContext,
  ): Promise<Result<ChannelConnectionHealthDto, Error>> {
    try {
      const tenantId = command.tenantId.trim();
      const connectionId = command.connectionId.trim();
      if (!tenantId || !connectionId) {
        return Result.fail(new ValidationError("tenantId and connectionId are required"));
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

      const connection = await this.connectionRepository.findById(tenantId, connectionId);
      if (!connection) {
        return Result.fail(new NotFoundError("ChannelConnection", connectionId));
      }

      const mappings = await this.mappingRepository.listByConnection(tenantId, connectionId);
      const activeMappings = mappings.filter((m) => m.status === "active");
      const activeMappingCount = activeMappings.length;
      const cursor = await this.cursorRepository.getCursor(tenantId, connectionId);
      const latestPollJob = await this.pollJobQuery.findLatestPoll({ tenantId, connectionId });
      const reconSummary = await this.healthQuery.getReconciliationSummary({
        tenantId,
        connectionId,
      });
      const latestReconcileJob = await this.healthQuery.findLatestReconcileJob({
        tenantId,
        connectionId,
      });
      const rotation = await this.rotationStore.findInProgressForConnection(
        tenantId,
        connectionId,
      );
      const activeChannelImportCount = await this.healthQuery.countActiveChannelImports({
        tenantId,
        connectionId,
      });

      const now = command.now ?? new Date();
      const intervalMs = resolveIcalPollIntervalMs();
      const attentionReasons: ChannelHealthAttentionReason[] = [];

      if (latestPollJob?.status === "dead_letter") {
        attentionReasons.push("poll_job_dead_letter");
      }
      if (latestReconcileJob?.status === "dead_letter") {
        attentionReasons.push("reconcile_job_dead_letter");
      }
      if (
        reconSummary.pendingCount > 0 &&
        latestReconcileJob?.status === "cancelled"
      ) {
        attentionReasons.push("reconcile_job_cancelled_with_pending_generation");
      }
      const inventoryApplyForConnection = connection.inventoryApplyEnabled === true;
      if (
        shouldAttentionPendingWithoutRunnableJob({
          inventoryApplyForConnection,
          pendingReconciliationCount: reconSummary.pendingCount,
          latestReconcileJobStatus: latestReconcileJob?.status ?? null,
        })
      ) {
        attentionReasons.push("pending_reconciliation_without_runnable_job");
      }
      if (rotation) {
        attentionReasons.push("rotation_in_progress");
      }
      if (connection.status === "active") {
        const lastProgressAt =
          latestPollJob?.status === "completed" && latestPollJob.completedAt
            ? latestPollJob.completedAt.getTime()
            : cursor
              ? cursor.updatedAt.getTime()
              : null;
        if (
          lastProgressAt !== null &&
          now.getTime() - lastProgressAt > 2 * intervalMs
        ) {
          attentionReasons.push("poll_stale_beyond_2x_interval");
        } else if (lastProgressAt === null && !latestPollJob) {
          if (now.getTime() - connection.updatedAt.getTime() > 2 * intervalMs) {
            attentionReasons.push("poll_stale_beyond_2x_interval");
          }
        }
      }

      const globalApply = isChannelInventoryApplyEnabled();
      const inventoryApplyEffective = isInventoryApplyEffective({
        globalApplyEnabled: globalApply,
        inventoryApplyEnabled: inventoryApplyForConnection,
        status: connection.status,
        provider: connection.provider,
        semanticMode: connection.semanticMode,
        activeMappings: activeMappings.map((m) => ({
          propertyId: m.propertyId,
          unitId: m.unitId,
        })),
      });

      const pilotEligibilityReasons = collectInventoryApplyEnableEligibilityReasons({
        globalApplyEnabled: globalApply,
        inventoryApplyForConnection,
        status: connection.status,
        provider: connection.provider,
        semanticMode: connection.semanticMode,
        hasCredentialRef: connection.credentialRef != null,
        activeMappings: activeMappings.map((m) => ({
          propertyId: m.propertyId,
          unitId: m.unitId,
        })),
        rotationInProgress: rotation != null,
        latestPollJobStatus: latestPollJob?.status ?? null,
        latestReconcileJobStatus: latestReconcileJob?.status ?? null,
        pendingReconciliationCount: reconSummary.pendingCount,
      });

      return Result.ok({
        connectionId,
        connectionStatus: connection.status,
        provider: connection.provider,
        semanticMode: connection.semanticMode,
        semanticConfigVersion: connection.semanticConfigVersion,
        hasCredentialRef: connection.credentialRef != null,
        activeMappingCount,
        cursorVersion: cursor?.version ?? null,
        cursorUpdatedAt: cursor?.updatedAt.toISOString() ?? null,
        inventoryApplyEnabled: globalApply,
        inventoryApplyGloballyEnabled: globalApply,
        inventoryApplyForConnection,
        inventoryApplyEffective,
        pilotEligible: pilotEligibilityReasons.length === 0,
        pilotEligibilityReasons,
        activeChannelImportCount,
        latestPollJob: latestPollJob
          ? toJobDto({
              id: latestPollJob.id,
              status: latestPollJob.status,
              attemptCount: latestPollJob.attemptCount,
              runAt: latestPollJob.runAt,
              nextRetryAt: latestPollJob.nextRetryAt,
              completedAt: latestPollJob.completedAt,
            })
          : null,
        latestReconciliation: reconSummary.latest
          ? {
              cursorVersion: reconSummary.latest.cursorVersion,
              status: reconSummary.latest.status,
              appliedAt: reconSummary.latest.appliedAt?.toISOString() ?? null,
              errorCode: reconSummary.latest.errorCode,
              completeObservedEvidence: reconSummary.latest.completeObservedEvidence,
            }
          : null,
        latestReconcileJob: latestReconcileJob ? toJobDto(latestReconcileJob) : null,
        pendingReconciliationCount: reconSummary.pendingCount,
        needsAttention: attentionReasons.length > 0,
        attentionReasons,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

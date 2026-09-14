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
import { isChannelInventoryApplyEnabled } from "./channelInventoryApplyGate";
import {
  collectInventoryApplyEnableEligibilityReasons,
  type InventoryApplyEnableEligibilityReason,
} from "./inventoryApplyEnableEligibility";
import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import type { IChannelListingMappingRepository } from "../ports/IChannelListingMappingRepository";
import type { IChannelPollJobQuery } from "../ports/IChannelPollJobQuery";
import type { IChannelConnectionHealthQuery } from "../ports/IChannelConnectionHealthQuery";
import type { IIcalCredentialRotationStore } from "../ports/IIcalCredentialRotationStore";
import type { IChannelConnectionInventoryApplyStore } from "../ports/IChannelConnectionInventoryApplyStore";

export interface EnableChannelConnectionInventoryApplyCommand {
  tenantId: string;
  connectionId: string;
  expectedSemanticConfigVersion: number;
}

export interface EnableChannelConnectionInventoryApplyResult {
  connectionId: string;
  inventoryApplyEnabled: true;
  alreadyEnabled: boolean;
  semanticConfigVersion: number;
  supersededPendingCount: number;
}

/** @deprecated Prefer InventoryApplyEnableEligibilityReason from inventoryApplyEnableEligibility. */
export type PilotEligibilityHardReason = InventoryApplyEnableEligibilityReason;

/**
 * P1-S7c — enable connection inventory apply.
 *
 * Pre-TX: global flag + shared enable-eligibility classification.
 * Under connection lock (store): stale supersession + structural re-checks + set true + audit.
 */
export class EnableChannelConnectionInventoryApplyUseCase {
  constructor(
    private readonly connectionRepository: IChannelConnectionRepository,
    private readonly mappingRepository: IChannelListingMappingRepository,
    private readonly pollJobQuery: IChannelPollJobQuery,
    private readonly healthQuery: IChannelConnectionHealthQuery,
    private readonly rotationStore: IIcalCredentialRotationStore,
    private readonly store: IChannelConnectionInventoryApplyStore,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    command: EnableChannelConnectionInventoryApplyCommand,
    actor: ActorContext,
    audit: UseCaseAuditContext,
  ): Promise<Result<EnableChannelConnectionInventoryApplyResult, Error>> {
    try {
      const tenantId = command.tenantId.trim();
      const connectionId = command.connectionId.trim();
      if (!tenantId || !connectionId) {
        return Result.fail(new ValidationError("tenantId and connectionId are required"));
      }
      if (
        !Number.isInteger(command.expectedSemanticConfigVersion) ||
        command.expectedSemanticConfigVersion < 1
      ) {
        return Result.fail(
          new ValidationError("expectedSemanticConfigVersion must be a positive integer"),
        );
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
      const latestPollJob = await this.pollJobQuery.findLatestPoll({ tenantId, connectionId });
      const latestReconcileJob = await this.healthQuery.findLatestReconcileJob({
        tenantId,
        connectionId,
      });
      const recon = await this.healthQuery.getReconciliationSummary({ tenantId, connectionId });
      const rotation = await this.rotationStore.findInProgressForConnection(
        tenantId,
        connectionId,
      );

      const precheck = collectInventoryApplyEnableEligibilityReasons({
        globalApplyEnabled: isChannelInventoryApplyEnabled(),
        inventoryApplyForConnection: connection.inventoryApplyEnabled === true,
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
        pendingReconciliationCount: recon.pendingCount,
      });
      if (precheck.length > 0) {
        return Result.fail(
          new ConflictError(
            `Cannot enable inventory apply: ${precheck.join(",")}`,
            precheck[0],
          ),
        );
      }

      const outcome = await this.store.enable({
        tenantId,
        connectionId,
        expectedSemanticConfigVersion: command.expectedSemanticConfigVersion,
        actorId: audit.actorId,
        ipAddress: audit.ipAddress ?? null,
      });

      return Result.ok({
        connectionId,
        inventoryApplyEnabled: true,
        alreadyEnabled: outcome.alreadyEnabled,
        semanticConfigVersion: outcome.semanticConfigVersion,
        supersededPendingCount: outcome.supersededPendingCount,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

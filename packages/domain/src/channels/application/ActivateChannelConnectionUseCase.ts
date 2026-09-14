import { Result } from "../../shared/kernel/Result";
import type { UseCaseAuditContext } from "../../shared/types/AuditContext";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import type { ChannelConnectionStatus } from "../domain/ChannelConnectionStatus";
import type { IChannelConnectionLifecycleUnitOfWork } from "../ports/IChannelConnectionLifecycleUnitOfWork";
import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import type { IChannelProviderRegistry } from "../ports/providers/IChannelProviderRegistry";
import type { FeedSemanticMode } from "../types/FeedSemanticMode";
import {
  buildLifecycleAuditMetadata,
  prepareLifecycleActivation,
  type ChannelConnectionLifecycleCommandBase,
  type ChannelConnectionRotationGate,
} from "./ChannelConnectionLifecycleActivationSupport";

export type ActivateChannelConnectionCommand = ChannelConnectionLifecycleCommandBase;

export interface ChannelConnectionLifecycleActivationResult {
  connectionId: string;
  status: "active";
  semanticMode: FeedSemanticMode;
  semanticConfigVersion: number;
}

const ACTIVATE_SOURCE_STATUSES = new Set<ChannelConnectionStatus>([
  "pending_auth",
  "error",
]);

/**
 * Activate a ChannelConnection under mandatory semantic policy and epoch CAS (CM-4b S3e).
 *
 * Source statuses: pending_auth | error → active.
 * Does not call the S3d transition store, reset cursors, or mutate semantic columns.
 */
export class ActivateChannelConnectionUseCase {
  constructor(
    private readonly connectionRepository: IChannelConnectionRepository,
    private readonly providerRegistry: IChannelProviderRegistry,
    private readonly permissionChecker: PermissionChecker,
    private readonly unitOfWork: IChannelConnectionLifecycleUnitOfWork,
    /** P1-S6c: refuses activation while a credential rotation is in flight. */
    private readonly rotationGate: ChannelConnectionRotationGate | null = null,
  ) {}

  async execute(
    command: ActivateChannelConnectionCommand,
    actor: ActorContext,
    audit: UseCaseAuditContext,
  ): Promise<Result<ChannelConnectionLifecycleActivationResult, Error>> {
    try {
      const prepared = await prepareLifecycleActivation({
        command,
        actor,
        connectionRepository: this.connectionRepository,
        providerRegistry: this.providerRegistry,
        permissionChecker: this.permissionChecker,
        allowedPriorStatuses: ACTIVATE_SOURCE_STATUSES,
        invalidStatusMessage: (status) =>
          `Cannot activate connection in status: ${status}`,
        mutate: (connection, now) => connection.activate(now),
        rotationGate: this.rotationGate,
      });

      await this.unitOfWork.runInTransaction(prepared.connection.tenantId, async (ports) => {
        await ports.connections.activateWithExpectedSemanticVersion(
          prepared.connection,
          prepared.expectedSemanticConfigVersion,
          prepared.priorStatus,
        );
        await ports.audit.append({
          tenantId: prepared.connection.tenantId,
          actorId: audit.actorId,
          action: "channel.connection.activated",
          resourceType: "ChannelConnection",
          resourceId: prepared.connection.id,
          metadata: buildLifecycleAuditMetadata(prepared),
          ipAddress: audit.ipAddress,
        });
      });

      return Result.ok({
        connectionId: prepared.connection.id,
        status: "active",
        semanticMode: prepared.semanticMode,
        semanticConfigVersion: prepared.semanticConfigVersion,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

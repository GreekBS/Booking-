import { Result } from "../../shared/kernel/Result";
import type { UseCaseAuditContext } from "../../shared/types/AuditContext";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import type { ChannelConnectionStatus } from "../domain/ChannelConnectionStatus";
import type { IChannelConnectionLifecycleUnitOfWork } from "../ports/IChannelConnectionLifecycleUnitOfWork";
import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import type { IChannelConnectionPropertyRelevanceReader } from "../ports/IChannelConnectionPropertyRelevanceReader";
import type { IChannelImportedInventoryCleanupStore } from "../ports/IChannelImportedInventoryCleanupStore";
import type { FeedSemanticMode } from "../types/FeedSemanticMode";
import {
  buildRestrictedLifecycleAuditMetadata,
  prepareLifecycleRestrictedTransition,
  type ChannelConnectionLifecycleRestrictedCommand,
} from "./ChannelConnectionLifecycleRestrictedSupport";

export type DisconnectChannelConnectionCommand = ChannelConnectionLifecycleRestrictedCommand;

export interface DisconnectChannelConnectionResult {
  connectionId: string;
  status: "disconnected";
  semanticMode: FeedSemanticMode;
  semanticConfigVersion: number;
  /** Active channel_import rows released for this connection (all epochs). */
  releasedImportedInventoryCount: number;
}

const DISCONNECT_BLOCKED = new Set<ChannelConnectionStatus>(["disconnected"]);

/**
 * Disconnect a ChannelConnection under semantic-epoch CAS (CM-4b S4a-1).
 * Clears credential/webhook refs on the aggregate; does not mutate semantic columns.
 * After durable disconnect, releases all connection-owned active channel_import blocks.
 */
export class DisconnectChannelConnectionUseCase {
  constructor(
    private readonly connectionRepository: IChannelConnectionRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly unitOfWork: IChannelConnectionLifecycleUnitOfWork,
    private readonly importedInventoryCleanup: IChannelImportedInventoryCleanupStore | null = null,
    private readonly relevanceReader: IChannelConnectionPropertyRelevanceReader | null = null,
  ) {}

  async execute(
    command: DisconnectChannelConnectionCommand,
    actor: ActorContext,
    audit: UseCaseAuditContext,
  ): Promise<Result<DisconnectChannelConnectionResult, Error>> {
    try {
      const prepared = await prepareLifecycleRestrictedTransition({
        command,
        actor,
        connectionRepository: this.connectionRepository,
        permissionChecker: this.permissionChecker,
        relevanceReader: this.relevanceReader,
        allowedPriorStatuses: new Set(
          (["draft", "pending_auth", "active", "paused", "error"] as ChannelConnectionStatus[]).filter(
            (s) => !DISCONNECT_BLOCKED.has(s),
          ),
        ),
        invalidStatusMessage: (status) =>
          `Cannot disconnect connection in status: ${status}`,
        mutate: (connection, now) => connection.disconnect(now),
      });

      await this.unitOfWork.runInTransaction(prepared.connection.tenantId, async (ports) => {
        await ports.connections.disconnectWithExpectedSemanticVersion(
          prepared.connection,
          prepared.expectedSemanticConfigVersion,
          prepared.priorStatus,
        );
        await ports.audit.append({
          tenantId: prepared.connection.tenantId,
          actorId: audit.actorId,
          action: "channel.connection.disconnected",
          resourceType: "ChannelConnection",
          resourceId: prepared.connection.id,
          metadata: buildRestrictedLifecycleAuditMetadata(prepared),
          ipAddress: audit.ipAddress,
        });
      });

      let releasedImportedInventoryCount = 0;
      if (this.importedInventoryCleanup) {
        const cleanup = await this.importedInventoryCleanup.releaseAllForConnection({
          tenantId: prepared.connection.tenantId,
          connectionId: prepared.connection.id,
          expectedSemanticConfigVersion: prepared.semanticConfigVersion,
          reason: "disconnect",
          actorId: audit.actorId,
          ipAddress: audit.ipAddress ?? null,
        });
        releasedImportedInventoryCount = cleanup.releasedCount;
      }

      return Result.ok({
        connectionId: prepared.connection.id,
        status: "disconnected",
        semanticMode: prepared.semanticMode,
        semanticConfigVersion: prepared.semanticConfigVersion,
        releasedImportedInventoryCount,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

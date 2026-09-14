import { Result } from "../../shared/kernel/Result";
import type { UseCaseAuditContext } from "../../shared/types/AuditContext";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import type { ChannelConnectionStatus } from "../domain/ChannelConnectionStatus";
import type { IChannelConnectionLifecycleUnitOfWork } from "../ports/IChannelConnectionLifecycleUnitOfWork";
import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import type { FeedSemanticMode } from "../types/FeedSemanticMode";
import {
  buildRestrictedLifecycleAuditMetadata,
  prepareLifecycleRestrictedTransition,
  type ChannelConnectionLifecycleRestrictedCommand,
} from "./ChannelConnectionLifecycleRestrictedSupport";

export type PauseChannelConnectionCommand = ChannelConnectionLifecycleRestrictedCommand;

export interface PauseChannelConnectionResult {
  connectionId: string;
  status: "paused";
  semanticMode: FeedSemanticMode;
  semanticConfigVersion: number;
}

const PAUSE_SOURCE_STATUSES = new Set<ChannelConnectionStatus>(["active"]);

/**
 * Pause an active ChannelConnection under semantic-epoch CAS (CM-4b S4a-1).
 * Does not reset cursors or mutate semantic columns.
 */
export class PauseChannelConnectionUseCase {
  constructor(
    private readonly connectionRepository: IChannelConnectionRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly unitOfWork: IChannelConnectionLifecycleUnitOfWork,
  ) {}

  async execute(
    command: PauseChannelConnectionCommand,
    actor: ActorContext,
    audit: UseCaseAuditContext,
  ): Promise<Result<PauseChannelConnectionResult, Error>> {
    try {
      const prepared = await prepareLifecycleRestrictedTransition({
        command,
        actor,
        connectionRepository: this.connectionRepository,
        permissionChecker: this.permissionChecker,
        allowedPriorStatuses: PAUSE_SOURCE_STATUSES,
        invalidStatusMessage: (status) => `Cannot pause connection in status: ${status}`,
        mutate: (connection, now) => connection.pause(now),
      });

      await this.unitOfWork.runInTransaction(prepared.connection.tenantId, async (ports) => {
        await ports.connections.pauseWithExpectedSemanticVersion(
          prepared.connection,
          prepared.expectedSemanticConfigVersion,
          prepared.priorStatus,
        );
        await ports.audit.append({
          tenantId: prepared.connection.tenantId,
          actorId: audit.actorId,
          action: "channel.connection.paused",
          resourceType: "ChannelConnection",
          resourceId: prepared.connection.id,
          metadata: buildRestrictedLifecycleAuditMetadata(prepared),
          ipAddress: audit.ipAddress,
        });
      });

      return Result.ok({
        connectionId: prepared.connection.id,
        status: "paused",
        semanticMode: prepared.semanticMode,
        semanticConfigVersion: prepared.semanticConfigVersion,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

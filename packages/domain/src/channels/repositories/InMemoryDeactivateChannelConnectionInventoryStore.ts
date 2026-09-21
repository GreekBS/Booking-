import { ConflictError } from "../../shared/errors/DomainError";
import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import type {
  DeactivateChannelConnectionInventoryStoreCommand,
  DeactivateChannelConnectionInventoryStoreResult,
  IDeactivateChannelConnectionInventoryStore,
} from "../ports/IDeactivateChannelConnectionInventoryStore";

export interface InMemoryDeactivateInventoryBlock {
  id: string;
  tenantId: string;
  connectionId: string;
  blockType: "channel_import" | "hold" | "booking" | string;
  status: "active" | "released" | string;
}

/**
 * In-memory emergency inventory rollback for domain tests.
 * Releases active channel_import blocks owned by the connection (all epochs).
 */
export class InMemoryDeactivateChannelConnectionInventoryStore
  implements IDeactivateChannelConnectionInventoryStore
{
  readonly audits: Array<{
    action: string;
    tenantId: string;
    connectionId: string;
    actorId: string;
    releasedCount: number;
    alreadyPaused: boolean;
  }> = [];

  constructor(
    private readonly connections: IChannelConnectionRepository,
    private readonly blocks: InMemoryDeactivateInventoryBlock[],
  ) {}

  async deactivate(
    command: DeactivateChannelConnectionInventoryStoreCommand,
  ): Promise<DeactivateChannelConnectionInventoryStoreResult> {
    const connection = await this.connections.findById(
      command.tenantId,
      command.connectionId,
    );
    if (!connection) {
      throw new ConflictError("Channel connection not found", "not_found");
    }
    if (connection.semanticConfigVersion !== command.expectedSemanticConfigVersion) {
      throw new ConflictError(
        "Channel connection semantic configuration version is stale",
        "semantic_version_conflict",
      );
    }
    if (
      connection.status !== "active" &&
      connection.status !== "paused" &&
      connection.status !== "disconnected"
    ) {
      throw new ConflictError(
        `Cannot deactivate inventory for connection in status: ${connection.status}`,
        "lifecycle_status_conflict",
      );
    }

    const alreadyPaused =
      connection.status === "paused" || connection.status === "disconnected";
    if (connection.status === "active") {
      connection.pause();
      await this.connections.pauseWithExpectedSemanticVersion(
        connection,
        command.expectedSemanticConfigVersion,
        "active",
      );
    }

    let releasedCount = 0;
    for (const block of this.blocks) {
      if (
        block.tenantId === command.tenantId &&
        block.connectionId === command.connectionId &&
        block.blockType === "channel_import" &&
        block.status === "active"
      ) {
        block.status = "released";
        releasedCount += 1;
      }
    }

    this.audits.push({
      action: "channel.connection.inventory_deactivated",
      tenantId: command.tenantId,
      connectionId: command.connectionId,
      actorId: command.actorId,
      releasedCount,
      alreadyPaused,
    });

    return {
      releasedCount,
      alreadyPaused,
      semanticConfigVersion: connection.semanticConfigVersion,
    };
  }
}

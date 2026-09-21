import { ConflictError } from "../../shared/errors/DomainError";
import type {
  ChannelImportedInventoryCleanupResult,
  IChannelImportedInventoryCleanupStore,
  ReleaseAllChannelImportedInventoryCommand,
  ReleaseSupersededEpochChannelImportedInventoryCommand,
} from "../ports/IChannelImportedInventoryCleanupStore";

export type InMemoryCleanupCalendarBlock = {
  id: string;
  tenantId: string;
  connectionId: string | null;
  blockType: string;
  status: string;
  semanticConfigVersion: number | null;
};

export type InMemoryCleanupConnection = {
  tenantId: string;
  id: string;
  status: string;
  semanticConfigVersion: number;
};

const RELEASE_ALLOWED_STATUSES = new Set([
  "active",
  "paused",
  "error",
  "disconnected",
]);

/**
 * In-memory cleanup parity for disconnect / superseded-epoch release.
 */
export class InMemoryChannelImportedInventoryCleanupStore
  implements IChannelImportedInventoryCleanupStore
{
  constructor(
    private readonly connections: Map<string, InMemoryCleanupConnection>,
    private readonly blocks: InMemoryCleanupCalendarBlock[],
  ) {}

  async releaseAllForConnection(
    command: ReleaseAllChannelImportedInventoryCommand,
  ): Promise<ChannelImportedInventoryCleanupResult> {
    const connection = this.lockConnection(command.tenantId, command.connectionId);
    this.assertCas(connection, command.expectedSemanticConfigVersion);
    this.assertStatusAllowed(connection);
    return this.release(command.tenantId, command.connectionId, null, connection);
  }

  async releaseSupersededEpochs(
    command: ReleaseSupersededEpochChannelImportedInventoryCommand,
  ): Promise<ChannelImportedInventoryCleanupResult> {
    const connection = this.lockConnection(command.tenantId, command.connectionId);
    this.assertCas(connection, command.expectedSemanticConfigVersion);
    if (connection.semanticConfigVersion !== command.keepFromSemanticConfigVersion) {
      throw new ConflictError(
        "keepFromSemanticConfigVersion must match live connection epoch",
        "semantic_version_conflict",
      );
    }
    this.assertStatusAllowed(connection);
    return this.release(
      command.tenantId,
      command.connectionId,
      command.keepFromSemanticConfigVersion,
      connection,
    );
  }

  private release(
    tenantId: string,
    connectionId: string,
    keepFromSemanticConfigVersion: number | null,
    connection: InMemoryCleanupConnection,
  ): ChannelImportedInventoryCleanupResult {
    let releasedCount = 0;
    for (const block of this.blocks) {
      if (block.tenantId !== tenantId) continue;
      if (block.connectionId !== connectionId) continue;
      if (block.blockType !== "channel_import") continue;
      if (block.status !== "active") continue;
      if (
        keepFromSemanticConfigVersion != null &&
        (block.semanticConfigVersion == null ||
          block.semanticConfigVersion >= keepFromSemanticConfigVersion)
      ) {
        continue;
      }
      block.status = "released";
      releasedCount += 1;
    }
    return {
      releasedCount,
      semanticConfigVersion: connection.semanticConfigVersion,
    };
  }

  private lockConnection(tenantId: string, connectionId: string): InMemoryCleanupConnection {
    const key = `${tenantId}:${connectionId}`;
    const connection = this.connections.get(key);
    if (!connection) {
      throw new ConflictError("Channel connection not found", "not_found");
    }
    return connection;
  }

  private assertCas(
    connection: InMemoryCleanupConnection,
    expectedSemanticConfigVersion: number,
  ): void {
    if (connection.semanticConfigVersion !== expectedSemanticConfigVersion) {
      throw new ConflictError(
        "Channel connection semantic configuration version is stale",
        "semantic_version_conflict",
      );
    }
  }

  private assertStatusAllowed(connection: InMemoryCleanupConnection): void {
    if (!RELEASE_ALLOWED_STATUSES.has(connection.status)) {
      throw new ConflictError(
        `Cannot release imported inventory for connection in status: ${connection.status}`,
        "lifecycle_status_conflict",
      );
    }
  }
}

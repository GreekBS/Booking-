/**
 * Safe release of provider-owned `channel_import` calendar blocks.
 *
 * Never touches Hold/Booking/manual blocks or another connection's inventory.
 * Callers must hold authoritative connection state (CAS via semantic version).
 */
export type ChannelImportedInventoryCleanupReason =
  | "disconnect"
  | "superseded_epoch"
  | "operator_deactivate";

export interface ReleaseAllChannelImportedInventoryCommand {
  tenantId: string;
  connectionId: string;
  /** CAS against live connection.semanticConfigVersion. */
  expectedSemanticConfigVersion: number;
  reason: ChannelImportedInventoryCleanupReason;
  actorId: string;
  ipAddress?: string | null;
}

export interface ReleaseSupersededEpochChannelImportedInventoryCommand {
  tenantId: string;
  connectionId: string;
  /**
   * After an epoch bump, release active channel_import rows whose
   * semantic_config_version is strictly less than this value.
   */
  keepFromSemanticConfigVersion: number;
  /** CAS against live connection.semanticConfigVersion (must equal keepFrom). */
  expectedSemanticConfigVersion: number;
  reason: "superseded_epoch";
  actorId: string;
  ipAddress?: string | null;
}

export interface ChannelImportedInventoryCleanupResult {
  releasedCount: number;
  semanticConfigVersion: number;
}

export interface IChannelImportedInventoryCleanupStore {
  /**
   * Release every active channel_import owned by the connection (all epochs).
   * Allowed when connection is active, paused, error, or disconnected.
   */
  releaseAllForConnection(
    command: ReleaseAllChannelImportedInventoryCommand,
  ): Promise<ChannelImportedInventoryCleanupResult>;

  /**
   * Release active channel_import rows from superseded semantic epochs only.
   * Newer-epoch rows (semantic_config_version >= keepFrom) are retained.
   */
  releaseSupersededEpochs(
    command: ReleaseSupersededEpochChannelImportedInventoryCommand,
  ): Promise<ChannelImportedInventoryCleanupResult>;
}

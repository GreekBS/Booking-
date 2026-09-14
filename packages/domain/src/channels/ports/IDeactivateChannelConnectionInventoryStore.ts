export interface DeactivateChannelConnectionInventoryStoreCommand {
  readonly tenantId: string;
  readonly connectionId: string;
  readonly expectedSemanticConfigVersion: number;
  readonly actorId: string;
  readonly ipAddress: string | null;
}

export interface DeactivateChannelConnectionInventoryStoreResult {
  readonly releasedCount: number;
  readonly alreadyPaused: boolean;
  readonly semanticConfigVersion: number;
}

/**
 * P1-S7b — atomic pause + release all active channel_import for a connection.
 */
export interface IDeactivateChannelConnectionInventoryStore {
  deactivate(
    command: DeactivateChannelConnectionInventoryStoreCommand,
  ): Promise<DeactivateChannelConnectionInventoryStoreResult>;
}

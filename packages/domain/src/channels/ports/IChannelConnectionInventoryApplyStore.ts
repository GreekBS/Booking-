export interface ChannelConnectionInventoryApplyStoreCommand {
  readonly tenantId: string;
  readonly connectionId: string;
  readonly expectedSemanticConfigVersion: number;
  readonly actorId: string;
  readonly ipAddress: string | null;
}

export interface EnableChannelConnectionInventoryApplyStoreResult {
  readonly inventoryApplyEnabled: true;
  readonly alreadyEnabled: boolean;
  readonly semanticConfigVersion: number;
  readonly supersededPendingCount: number;
}

export interface DisableChannelConnectionInventoryApplyStoreResult {
  readonly inventoryApplyEnabled: false;
  readonly alreadyDisabled: boolean;
  readonly semanticConfigVersion: number;
}

/**
 * P1-S7c — connection FOR UPDATE linearization for inventory-apply enable/disable.
 * Enable supersedes stale pending reconciliations before apply becomes true.
 */
export interface IChannelConnectionInventoryApplyStore {
  enable(
    command: ChannelConnectionInventoryApplyStoreCommand,
  ): Promise<EnableChannelConnectionInventoryApplyStoreResult>;

  disable(
    command: ChannelConnectionInventoryApplyStoreCommand,
  ): Promise<DisableChannelConnectionInventoryApplyStoreResult>;
}

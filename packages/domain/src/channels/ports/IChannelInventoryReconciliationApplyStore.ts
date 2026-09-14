import type { DesiredChannelImportBlock } from "../providers/ical/inventory/projectDesiredChannelImportBlocks";

export type ChannelInventoryApplyExecution =
  | "APPLY"
  | "NOOP"
  | "SUPERSEDE"
  | "PERMANENT_FAIL"
  | "DEFER"
  | "RETRY";

export type ChannelInventoryApplyFailureCode =
  | "inventory_apply_disabled"
  | "connection_not_found"
  | "inactive_connection"
  | "provider_mismatch"
  | "feed_semantic_mode_not_availability_block"
  | "semantic_epoch_stale"
  | "mapping_count_invalid"
  | "mapping_id_mismatch"
  | "mapping_version_mismatch"
  | "unit_id_mismatch"
  | "property_id_mismatch"
  | "invalid_snapshot"
  | "invariant_corruption"
  | "internal_error";

export interface ChannelInventoryApplyCommand {
  readonly tenantId: string;
  readonly connectionId: string;
  readonly cursorVersion: number;
  /** Optional fence hints from job/outbox payload (validated against DB row). */
  readonly observedSemanticConfigVersion?: number;
  readonly observedMappingId?: string;
  readonly observedMappingVersion?: number;
}

export interface ChannelInventoryApplySuccess {
  readonly ok: true;
  readonly execution: "APPLY" | "NOOP" | "SUPERSEDE" | "DEFER";
  readonly reconcileStatus: "pending" | "applied" | "superseded" | "failed";
  readonly deferReason?: "inventory_apply_disabled" | "inactive_connection";
  readonly desiredItemCount: number;
  readonly createdCount: number;
  readonly updatedCount: number;
  /** Active owned identities left active but not in actionable desired set. */
  readonly retainedStaleCount: number;
  /** P1-S7a: channel_import rows soft-released in this apply. */
  readonly deactivatedCount: number;
}

export interface ChannelInventoryApplyFailure {
  readonly ok: false;
  readonly execution: "PERMANENT_FAIL" | "RETRY";
  readonly code: ChannelInventoryApplyFailureCode;
  readonly message: string;
  readonly reconcileStatus: "pending" | "failed";
  readonly shouldRetryJob: boolean;
}

export type ChannelInventoryApplyResult =
  | ChannelInventoryApplySuccess
  | ChannelInventoryApplyFailure;

export interface ChannelInventoryApplyTestHooks {
  afterReconciliationLock?: () => Promise<void>;
  afterFirstBlockWrite?: () => Promise<void>;
}

/**
 * TX2 port — applies one pending generation atomically.
 */
export interface IChannelInventoryReconciliationApplyStore {
  apply(command: ChannelInventoryApplyCommand): Promise<ChannelInventoryApplyResult>;
}

export type { DesiredChannelImportBlock };

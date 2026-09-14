import type { IcalInventoryActionableSnapshot } from "../providers/ical/inventory/buildIcalInventoryActionableSnapshot";
import type { ChannelPollConnectionResult } from "../types/ChannelPollConnectionResult";
import type { ReceiveChannelPollBatchResult } from "../types/ChannelIngressOrchestrationTypes";

export interface ChannelPollInventoryCommitCommand {
  readonly tenantId: string;
  readonly connectionId: string;
  readonly provider: string;
  readonly observedSemanticConfigVersion: number;
  readonly expectedCursorVersion: number;
  readonly proposedNextCursor: string;
  readonly inventorySnapshot: IcalInventoryActionableSnapshot;
  readonly batch: ReceiveChannelPollBatchResult;
  readonly loadedCursorVersion: number;
}

export type ChannelPollInventoryCommitFailureCode =
  | "connection_not_found"
  | "inactive_connection"
  | "provider_mismatch"
  | "semantic_epoch_stale"
  | "feed_semantic_mode_not_availability_block"
  | "inventory_apply_disabled"
  | "mapping_count_invalid"
  | "capacity_exceeded"
  | "cursor_conflict"
  | "internal_error";

export type ChannelPollInventoryCommitResult =
  | {
      readonly ok: true;
      readonly pollResult: ChannelPollConnectionResult;
    }
  | {
      readonly ok: false;
      readonly code: ChannelPollInventoryCommitFailureCode;
      readonly message: string;
      readonly pollResult: ChannelPollConnectionResult;
    };

/**
 * Atomic TX1: connection lock → mapping validation → cursor CAS →
 * generation insert → outbox (pending only).
 * No calendar inventory row mutation in S6a.
 */
export interface IChannelPollInventoryCommitStore {
  commit(command: ChannelPollInventoryCommitCommand): Promise<ChannelPollInventoryCommitResult>;
}

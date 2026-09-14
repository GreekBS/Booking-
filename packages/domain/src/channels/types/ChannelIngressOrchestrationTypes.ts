import type { IcalInventoryActionableSnapshot } from "../providers/ical/inventory/buildIcalInventoryActionableSnapshot";
import type { ChannelIngressBatchResult } from "./ChannelIngressTypes";

export type ChannelIngressFailurePhase =
  | "connection"
  | "provenance"
  | "malformed"
  | "provider_registration"
  | "verify"
  | "parse"
  | "poll";

export type IcalInventoryProjectionFailureCode =
  | "CAPACITY_EXCEEDED"
  | "ITEM_LIMIT_EXCEEDED"
  | "INVALID_ITEM";

export interface ChannelIngressOrchestrationResult extends ChannelIngressBatchResult {
  failurePhase?: ChannelIngressFailurePhase;
  errorMessage?: string;
}

export interface ReceiveChannelPollBatchResult extends ChannelIngressOrchestrationResult {
  proposedNextCursor: string | null;
  /**
   * P1-S6a — FULL DATE actionable snapshot from CURRENT IcalSnapshotIndex.
   * Independent of S4b message/delta count. Null when N/A or projection failed.
   */
  inventoryActionableSnapshot?: IcalInventoryActionableSnapshot | null;
  inventoryProjectionFailureCode?: IcalInventoryProjectionFailureCode | null;
}

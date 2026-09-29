import type { MutationOrigin } from "../../shared/types/MutationOrigin";
import { sha256HexUtf8 } from "../utils/sha256Hex";

/**
 * Provider-independent change intent for external distribution.
 * Commerce emits inventory-affecting facts; Channels fan out to eligible connections.
 */
export const UNIT_EXTERNAL_SYNC_REQUIRED_EVENT_TYPE =
  "UnitExternalSyncRequired" as const;

export type ChannelUnitSyncChangeKind =
  | "availability"
  | "rates"
  | "restrictions";

export interface ChannelUnitSyncChangePayload {
  readonly unitId: string;
  readonly propertyId: string;
  readonly from: string;
  readonly to: string;
  readonly changeKinds: readonly ChannelUnitSyncChangeKind[];
  readonly mutationOrigin: MutationOrigin | null;
  /** Monotonic revision for coalesce (ms epoch or higher). */
  readonly revision: number;
  /** Stable source identity for idempotent fan-out. */
  readonly sourceEventId: string;
}

/**
 * Outbox `delivery_key` is CHAR(64). Hash the logical identity so rate/rules
 * sourceEventIds (uuid + timestamp) never overflow the column.
 */
export function buildUnitExternalSyncDeliveryKey(input: {
  tenantId: string;
  unitId: string;
  sourceEventId: string;
}): string {
  return sha256HexUtf8(
    `unit-external-sync:${input.tenantId}:${input.unitId}:${input.sourceEventId}`,
  );
}

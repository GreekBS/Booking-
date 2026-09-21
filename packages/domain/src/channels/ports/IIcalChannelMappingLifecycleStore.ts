import type { ChannelConnectionStatus } from "../domain/ChannelConnectionStatus";
import type { ChannelListingMapping } from "../domain/ChannelListingMapping";

/**
 * Closed classification of P1-S6c listing-mapping mutations.
 *
 * - `create` — first mapping for the connection (epoch bump not required)
 * - `property_only` — propertyId changed, unit unchanged (no epoch bump)
 * - `external_identity_only` — external ids / sync direction changed
 *   (mappingVersion bump, no epoch bump)
 * - `unit_change` — internal unit reassignment (epoch bump + baseline + supersede)
 * - `replacement` — deactivate the current mapping and activate a new one
 *   (epoch bump + baseline + supersede)
 * - `deactivate` — deactivate/archive without a replacement
 * - `noop` — nothing changed
 */
export type IcalMappingMutationKind =
  | "create"
  | "property_only"
  | "external_identity_only"
  | "unit_change"
  | "replacement"
  | "deactivate"
  | "noop";

export interface IcalMappingLifecycleMutationParams {
  readonly tenantId: string;
  readonly connectionId: string;
  readonly actorId: string;
  readonly mutationKind: IcalMappingMutationKind;
  /** Statuses the connection may hold under lock; anything else fails closed. */
  readonly allowedConnectionStatuses: readonly ChannelConnectionStatus[];
  /** Epoch CAS observed before the aggregate was mutated. */
  readonly expectedSemanticConfigVersion: number;
  /** Mapping to create/update. Null for pure deactivate. */
  readonly mapping: ChannelListingMapping | null;
  /** Mapping to deactivate in the same connection-locked transaction. */
  readonly deactivatedMapping: ChannelListingMapping | null;
  /**
   * When true: bump the semantic epoch by one, baseline-reset the poll cursor
   * (retaining the durable cursor version), and supersede pending
   * reconciliations. Required for unit reassignment and replacement.
   */
  readonly requiresEpochBump: boolean;
  readonly auditAction: string;
  /** Non-secret audit metadata only. */
  readonly auditMetadata: Record<string, unknown>;
  readonly reason?: string | null;
  readonly ipAddress?: string | null;
  readonly now?: Date;
}

export interface IcalMappingLifecycleMutationResult {
  readonly mappingId: string | null;
  readonly mappingVersion: number | null;
  readonly mappingStatus: string | null;
  readonly deactivatedMappingId: string | null;
  readonly previousSemanticConfigVersion: number;
  readonly resultingSemanticConfigVersion: number;
  readonly epochBumped: boolean;
  readonly cursorBaselineReset: boolean;
  readonly retainedCursorVersion: number | null;
  readonly supersededPendingCount: number;
  readonly activeMappingCount: number;
  /**
   * True when already-materialized `channel_import` blocks no longer match the
   * mapping and a fresh poll is required to rematerialize inventory.
   * Superseded-epoch rows are soft-released in the mapping lifecycle transaction.
   */
  readonly requiresPollRematerialization: boolean;
}

/**
 * P1-S6c mapping lifecycle store.
 *
 * One short transaction per mutation, always under
 * `channel_connections FOR UPDATE`, preserving the S6b lock order:
 * connection → mappings → reconciliation → blocks.
 *
 * Invariants enforced inside the transaction:
 * - iCal `availability_block_feed` connections keep at most one active mapping
 * - epoch bump, cursor baseline reset, and pending supersession are atomic with
 *   the mapping write
 * - superseded-epoch `channel_import` soft-release on epoch bump (Hold/Booking untouched)
 */
export interface IIcalChannelMappingLifecycleStore {
  mutateUnderConnectionLock(
    params: IcalMappingLifecycleMutationParams,
  ): Promise<IcalMappingLifecycleMutationResult>;
}

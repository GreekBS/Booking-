export type ChannelInventoryReconcileStatus =
  | "pending"
  | "applied"
  | "superseded"
  | "failed";

export interface ChannelInventoryReconciliationRecord {
  readonly tenantId: string;
  readonly connectionId: string;
  readonly cursorVersion: number;
  readonly semanticConfigVersion: number;
  readonly mappingId: string;
  readonly mappingVersion: number;
  readonly unitId: string;
  readonly propertyId: string;
  readonly snapshotHash: string;
  /** Parsed actionable snapshot array (canonical items). */
  readonly actionableSnapshot: unknown;
  /**
   * P1-S7a: when false/missing, TX2 must never absence-deactivate
   * (legacy generations fail closed).
   */
  readonly completeObservedEvidence: boolean;
  /** Every authoritative snapshot identityKey when evidence is complete. */
  readonly observedSourceIdentityKeys: readonly string[] | null;
  /** Explicit STATUS:CANCELLED identities when evidence is complete. */
  readonly cancelledSourceIdentityKeys: readonly string[] | null;
  readonly reconcileStatus: ChannelInventoryReconcileStatus;
  readonly reconcileErrorCode: string | null;
  readonly createdAt: Date;
  readonly appliedAt: Date | null;
}

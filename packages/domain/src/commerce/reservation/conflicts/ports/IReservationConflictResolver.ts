import type { ConflictContext, ConflictResolution } from "../types/ConflictTypes";

/**
 * Future extension point for deterministic conflict handling (Phase 5+).
 * Not wired in P2. See ADR-020.
 */
export interface IReservationConflictResolver {
  resolve(context: ConflictContext): Promise<ConflictResolution>;
}

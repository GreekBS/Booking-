/**
 * Supersede every `pending` inventory reconciliation generation for a connection.
 *
 * Used by P1-S6c epoch mutations (credential rotation, unit reassignment,
 * mapping replacement): the generation was computed against a feed identity or
 * mapping that no longer applies, so it must not be applied later.
 *
 * Never mutates `unit_calendar_blocks` — V1 does not remove materialized blocks.
 */
export interface IPendingChannelReconciliationSuperseder {
  supersedePendingForConnection(
    tenantId: string,
    connectionId: string,
  ): Promise<number> | number;
}

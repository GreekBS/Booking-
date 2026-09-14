/**
 * P1-S6c locked monotonic cursor/generation rule for (tenantId, connectionId).
 *
 * nextVersion =
 *   max(
 *     current channel_poll_cursors.version if present else 0,
 *     MAX(channel_inventory_reconciliations.cursor_version) if present else 0
 *   ) + 1
 *
 * Semantic epoch changes must never restart this sequence.
 */
export function nextChannelPollCursorVersion(
  currentCursorVersion: number | null | undefined,
  maxReconciliationCursorVersion: number | null | undefined,
): number {
  const cursor = currentCursorVersion ?? 0;
  const recon = maxReconciliationCursorVersion ?? 0;
  if (!Number.isInteger(cursor) || cursor < 0) {
    throw new RangeError("currentCursorVersion must be a non-negative integer");
  }
  if (!Number.isInteger(recon) || recon < 0) {
    throw new RangeError("maxReconciliationCursorVersion must be a non-negative integer");
  }
  return Math.max(cursor, recon) + 1;
}

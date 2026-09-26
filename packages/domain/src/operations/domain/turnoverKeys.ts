/**
 * Stable turnover intent identity: one active canonical TURNOVER task per Booking.
 *
 * Normal: `turnover:{bookingId}`
 * History (IN_PROGRESS preserved / COMPLETED preserved after stay mutation):
 * `turnover:{bookingId}:history:{taskId}`
 */

export function canonicalTurnoverSourceKey(bookingId: string): string {
  return `turnover:${bookingId}`;
}

export function historyTurnoverSourceKey(
  bookingId: string,
  taskId: string,
): string {
  return `turnover:${bookingId}:history:${taskId}`;
}

export function isCanonicalTurnoverSourceKey(
  sourceKey: string | null | undefined,
  bookingId: string,
): boolean {
  return sourceKey === canonicalTurnoverSourceKey(bookingId);
}

/** Lookback days for missed departures (property-local). */
export const TURNOVER_LOOKBACK_DAYS = 7;

/** Title for system-generated turnover cleaning tasks. */
export const TURNOVER_TASK_TITLE = "Departure turnover clean";

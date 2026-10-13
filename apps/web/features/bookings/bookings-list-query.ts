/**
 * Pure helpers for Bookings list status tabs / URL sync.
 * Kept free of React so regression tests can pin filter behavior.
 */

export type BookingStatusTabId =
  | "all"
  | "pending"
  | "payment_pending"
  | "confirmed"
  | "completed"
  | "cancelled";

/** Tabs shown in the Bookings header (pending / payment_pending stay API-supported). */
export const VISIBLE_BOOKING_STATUS_TABS: ReadonlyArray<
  Exclude<BookingStatusTabId, "pending" | "payment_pending">
> = ["all", "confirmed", "completed", "cancelled"];

/** All status values accepted from URL / API (includes hidden operational statuses). */
export const ALL_BOOKING_STATUS_TABS: ReadonlyArray<BookingStatusTabId> = [
  "all",
  "confirmed",
  "completed",
  "cancelled",
  "pending",
  "payment_pending",
];

export function parseBookingStatusTab(raw: string | null | undefined): BookingStatusTabId {
  if (raw && (ALL_BOOKING_STATUS_TABS as readonly string[]).includes(raw)) {
    return raw as BookingStatusTabId;
  }
  return "all";
}

/** Map UI tab → list API `status` query param (omit for Όλες). */
export function statusTabToListParam(
  tab: BookingStatusTabId,
): Exclude<BookingStatusTabId, "all"> | undefined {
  return tab === "all" ? undefined : tab;
}

export function bookingsMatchStatusTab<T extends { status: string }>(
  bookings: readonly T[],
  tab: BookingStatusTabId,
): boolean {
  if (tab === "all") return true;
  return bookings.every((b) => b.status === tab);
}

export function filterBookingsByStatusTab<T extends { status: string }>(
  bookings: readonly T[],
  tab: BookingStatusTabId,
): T[] {
  if (tab === "all") return [...bookings];
  return bookings.filter((b) => b.status === tab);
}

/** Seeded fixture matching the reported Production mix (23 / 2 / 17 / 4). */
export function buildBookingsStatusFixture(): Array<{ id: string; status: string }> {
  const rows: Array<{ id: string; status: string }> = [];
  for (let i = 0; i < 2; i++) rows.push({ id: `confirmed-${i}`, status: "confirmed" });
  for (let i = 0; i < 17; i++) rows.push({ id: `completed-${i}`, status: "completed" });
  for (let i = 0; i < 4; i++) rows.push({ id: `cancelled-${i}`, status: "cancelled" });
  return rows;
}

export function countFixtureByTab(
  rows: ReadonlyArray<{ status: string }>,
  tab: BookingStatusTabId,
): number {
  return filterBookingsByStatusTab(rows, tab).length;
}

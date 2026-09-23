import type {
  ActiveCalendarBlock,
  BookingComAriDiffCell,
  RatePlanProps,
  UnitAvailabilityRulesProps,
} from "@hcp/domain";
import {
  fingerprintTalosAriCells,
  projectTalosUnitAriSnapshot,
  ValidationError,
} from "@hcp/domain";

/**
 * Max inclusive calendar days for local ARI cell materialization.
 * Covers ≥12 months with margin; callers must not silently truncate.
 */
export const BOOKING_COM_LOCAL_ARI_MAX_DAYS = 400;

/**
 * Builds Talos-authoritative ARI local cells for initial-sync preview.
 * Uses sellable inventory (active blocks), PricingCalculator nightly amounts,
 * and availability rules (min/max/CTA/CTD). No placeholder cells.
 *
 * Inventory semantics (unit capacity = 1):
 *   roomsToSell = 0 if any ACTIVE calendar block covers the night, else 1
 *   closed = 1 iff roomsToSell === 0
 * Blocks already encode bookings/holds/channel_import/manual — no double-subtract.
 *
 * Fails closed when the horizon exceeds {@link BOOKING_COM_LOCAL_ARI_MAX_DAYS}.
 */
export function buildBookingComLocalAriCells(input: {
  hotelId: string;
  rooms: readonly {
    roomTypeId: string;
    ratePlanId: string | null;
    unitId: string;
    activeBlocks: readonly ActiveCalendarBlock[];
    ratePlan: RatePlanProps | null;
    rules: UnitAvailabilityRulesProps | null;
  }[];
  from: string;
  to: string;
}): { cells: BookingComAriDiffCell[]; talosStateFingerprint: string } {
  assertHorizon(input.from, input.to);

  const cells: BookingComAriDiffCell[] = [];
  for (const room of input.rooms) {
    const snapshot = projectTalosUnitAriSnapshot({
      hotelId: input.hotelId,
      roomTypeId: room.roomTypeId,
      ratePlanId: room.ratePlanId,
      from: input.from,
      to: nextDayInclusiveEnd(input.to),
      activeBlocks: room.activeBlocks,
      ratePlan: room.ratePlan,
      rules: room.rules,
      includePrices: true,
    });
    cells.push(...snapshot.cells);
  }

  return {
    cells,
    talosStateFingerprint: fingerprintTalosAriCells(cells),
  };
}

function assertHorizon(from: string, to: string): void {
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    throw new ValidationError("Invalid ARI horizon dates");
  }
  const daySpan =
    Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (daySpan > BOOKING_COM_LOCAL_ARI_MAX_DAYS) {
    throw new ValidationError(
      `Booking.com ARI horizon exceeds ${BOOKING_COM_LOCAL_ARI_MAX_DAYS} days (${daySpan} requested)`,
    );
  }
}

/** projectTalosUnitAriSnapshot uses half-open [from, to); convert inclusive end. */
function nextDayInclusiveEnd(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + 1));
  return dt.toISOString().slice(0, 10);
}

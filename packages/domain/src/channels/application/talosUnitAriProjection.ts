import { StayPeriod } from "../../commerce/shared/value-objects/StayPeriod";
import { LocalDate } from "../../commerce/shared/value-objects/LocalDate";
import { PricingCalculator } from "../../commerce/pricing/PricingCalculator";
import type {
  ActiveCalendarBlock,
  RatePlanProps,
  UnitAvailabilityRulesProps,
} from "../../commerce/shared/types/CommerceTypes";
import type { BookingComAriDiffCell } from "../providers/booking_com/sync/bookingComAriDiff";
import { fingerprintTalosAriCells } from "../application/GenerateBookingComInitialSyncPreviewUseCase";

const DEFAULT_RULES: UnitAvailabilityRulesProps = {
  minNights: 1,
  maxNights: 30,
  checkInDays: [0, 1, 2, 3, 4, 5, 6],
  checkOutDays: [0, 1, 2, 3, 4, 5, 6],
  advanceMinDays: 0,
  advanceMaxDays: 365,
  turnoverNights: 0,
};

/**
 * Inventory semantics for Booking.com roomstosell (unit capacity = 1):
 *
 * remainingSellable(night) =
 *   0 if any ACTIVE calendar block covers the night
 *     (booking | hold | channel_import | manual | maintenance | cleaning | owner | turnover)
 *   1 otherwise
 *
 * closed = 1 iff remainingSellable === 0
 *
 * Blocks already encode confirmed bookings and active holds; do not double-subtract.
 */
export function nightIsSellable(
  nightYmd: string,
  activeBlocks: readonly ActiveCalendarBlock[],
): boolean {
  return !activeBlocks.some(
    (block) =>
      block.status === "active" &&
      nightYmd >= block.checkIn &&
      nightYmd < block.checkOut,
  );
}

export interface TalosUnitAriProjectionInput {
  hotelId: string;
  roomTypeId: string;
  ratePlanId: string | null;
  from: string;
  to: string;
  activeBlocks: readonly ActiveCalendarBlock[];
  ratePlan: RatePlanProps | null;
  rules: UnitAvailabilityRulesProps | null;
  /** Include price cells when ratePlanId + ratePlan present. */
  includePrices?: boolean;
}

export interface TalosUnitAriProjectionResult {
  cells: BookingComAriDiffCell[];
  talosStateFingerprint: string;
  nights: Array<{
    date: string;
    roomsToSell: 0 | 1;
    closed: 0 | 1;
    price: string | null;
    minStay: number;
    maxStay: number;
    closedToArrival: boolean;
    closedToDeparture: boolean;
  }>;
}

/**
 * Build ARI cells from authoritative Talos inventory/pricing/rules — no placeholders.
 * Reuses PricingCalculator for Standard nightly amounts.
 */
export function projectTalosUnitAriSnapshot(
  input: TalosUnitAriProjectionInput,
): TalosUnitAriProjectionResult {
  const rules = input.rules ?? DEFAULT_RULES;
  const pricing = new PricingCalculator();
  const nights: TalosUnitAriProjectionResult["nights"] = [];
  const cells: BookingComAriDiffCell[] = [];

  for (const date of enumerateHalfOpenDates(input.from, input.to)) {
    const sellable = nightIsSellable(date, input.activeBlocks);
    const roomsToSell: 0 | 1 = sellable ? 1 : 0;
    const closed: 0 | 1 = sellable ? 0 : 1;
    const weekday = LocalDate.create(date).dayOfWeek();
    const closedToArrival =
      rules.checkInDays.length > 0 && !rules.checkInDays.includes(weekday);
    const closedToDeparture =
      rules.checkOutDays.length > 0 && !rules.checkOutDays.includes(weekday);

    let price: string | null = null;
    if (input.includePrices !== false && input.ratePlan && input.ratePlanId) {
      const next = nextDay(date);
      const priced = pricing.calculate(
        input.ratePlan,
        StayPeriod.create(date, next),
        new Date(),
      );
      price = priced.lineItems[0]?.adjustedAmount ?? null;
    }

    nights.push({
      date,
      roomsToSell,
      closed,
      price,
      minStay: rules.minNights,
      maxStay: rules.maxNights,
      closedToArrival,
      closedToDeparture,
    });

    cells.push({
      hotelId: input.hotelId,
      roomTypeId: input.roomTypeId,
      ratePlanId: input.ratePlanId,
      date,
      field: "roomstosell",
      local: roomsToSell,
      remote: null,
    });
    cells.push({
      hotelId: input.hotelId,
      roomTypeId: input.roomTypeId,
      ratePlanId: input.ratePlanId,
      date,
      field: "closed",
      local: closed,
      remote: null,
    });
    if (price != null && input.ratePlanId) {
      cells.push({
        hotelId: input.hotelId,
        roomTypeId: input.roomTypeId,
        ratePlanId: input.ratePlanId,
        date,
        field: "price",
        local: Number(price),
        remote: null,
      });
    }
    cells.push({
      hotelId: input.hotelId,
      roomTypeId: input.roomTypeId,
      ratePlanId: input.ratePlanId,
      date,
      field: "minstay",
      local: rules.minNights,
      remote: null,
    });
    cells.push({
      hotelId: input.hotelId,
      roomTypeId: input.roomTypeId,
      ratePlanId: input.ratePlanId,
      date,
      field: "maxstay",
      local: rules.maxNights,
      remote: null,
    });
    cells.push({
      hotelId: input.hotelId,
      roomTypeId: input.roomTypeId,
      ratePlanId: input.ratePlanId,
      date,
      field: "cta",
      local: closedToArrival ? 1 : 0,
      remote: null,
    });
    cells.push({
      hotelId: input.hotelId,
      roomTypeId: input.roomTypeId,
      ratePlanId: input.ratePlanId,
      date,
      field: "ctd",
      local: closedToDeparture ? 1 : 0,
      remote: null,
    });
  }

  return {
    cells,
    talosStateFingerprint: fingerprintTalosAriCells(cells),
    nights,
  };
}

function enumerateHalfOpenDates(from: string, to: string): string[] {
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return [];
  }
  const out: string[] = [];
  const cursor = new Date(start);
  while (cursor < end) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function nextDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + 1));
  return dt.toISOString().slice(0, 10);
}

import type { BookingComAriPushRequest } from "./IBookingComAriClient";
import type { BookingComAriResolvedProjection } from "./BookingComAriProjection";
import { BookingComHotelId } from "../ids/BookingComIds";

/**
 * Split a resolved projection into hotel-scoped monthly ARI push requests.
 * One hotel per request; never crosses months in a single monthKey batch.
 */
export function batchBookingComAriProjectionByMonth(
  projection: BookingComAriResolvedProjection,
): BookingComAriPushRequest[] {
  const months = enumerateMonthKeys(projection.from, projection.to);
  return months.map((monthKey) => {
    const { monthStart, monthEndExclusive } = monthBounds(monthKey);
    return {
      hotelId: BookingComHotelId(projection.hotelId),
      monthKey,
      availability: projection.availability
        .map((seg) => clipAvailability(seg, monthStart, monthEndExclusive))
        .filter((seg): seg is NonNullable<typeof seg> => seg !== null),
      rates: projection.rates
        .map((seg) => clipRate(seg, monthStart, monthEndExclusive))
        .filter((seg): seg is NonNullable<typeof seg> => seg !== null),
      restrictions: projection.restrictions
        .map((seg) => clipRestriction(seg, monthStart, monthEndExclusive))
        .filter((seg): seg is NonNullable<typeof seg> => seg !== null),
    };
  }).filter(
    (req) =>
      req.availability.length > 0 ||
      req.rates.length > 0 ||
      req.restrictions.length > 0,
  );
}

/**
 * CM-4c-4 building block — produce monthly batches for a longer horizon snapshot.
 * Does not execute any provider I/O.
 */
export function buildBookingComAriSnapshotBatches(
  projections: readonly BookingComAriResolvedProjection[],
): BookingComAriPushRequest[] {
  const byKey = new Map<string, BookingComAriPushRequest>();
  for (const projection of projections) {
    for (const batch of batchBookingComAriProjectionByMonth(projection)) {
      const key = `${batch.hotelId}|${batch.monthKey}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, {
          hotelId: batch.hotelId,
          monthKey: batch.monthKey,
          availability: [...batch.availability],
          rates: [...batch.rates],
          restrictions: [...batch.restrictions],
        });
        continue;
      }
      byKey.set(key, {
        hotelId: existing.hotelId,
        monthKey: existing.monthKey,
        availability: [...existing.availability, ...batch.availability],
        rates: [...existing.rates, ...batch.rates],
        restrictions: [...existing.restrictions, ...batch.restrictions],
      });
    }
  }
  return [...byKey.values()].sort((a, b) =>
    a.monthKey === b.monthKey
      ? a.hotelId.localeCompare(b.hotelId)
      : a.monthKey.localeCompare(b.monthKey),
  );
}

export function enumerateMonthKeys(from: string, to: string): string[] {
  const start = parseYmd(from);
  const endExclusive = parseYmd(to);
  if (endExclusive.getTime() <= start.getTime()) {
    return [`${from.slice(0, 7)}`];
  }
  const keys: string[] = [];
  let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const last = new Date(
    Date.UTC(endExclusive.getUTCFullYear(), endExclusive.getUTCMonth(), 1),
  );
  // Include month of last occupied night (to is exclusive).
  const lastOccupied = new Date(endExclusive.getTime() - 86400000);
  const lastMonth = new Date(
    Date.UTC(lastOccupied.getUTCFullYear(), lastOccupied.getUTCMonth(), 1),
  );
  while (cursor.getTime() <= lastMonth.getTime()) {
    keys.push(
      `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`,
    );
    cursor = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1),
    );
  }
  void last;
  return keys.length > 0 ? keys : [from.slice(0, 7)];
}

function monthBounds(monthKey: string): {
  monthStart: string;
  monthEndExclusive: string;
} {
  const [y, m] = monthKey.split("-").map(Number);
  const start = new Date(Date.UTC(y!, m! - 1, 1));
  const end = new Date(Date.UTC(y!, m!, 1));
  return {
    monthStart: start.toISOString().slice(0, 10),
    monthEndExclusive: end.toISOString().slice(0, 10),
  };
}

function parseYmd(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

function maxYmd(a: string, b: string): string {
  return a >= b ? a : b;
}

function minYmd(a: string, b: string): string {
  return a <= b ? a : b;
}

function clipRange(
  from: string,
  to: string,
  monthStart: string,
  monthEndExclusive: string,
): { from: string; to: string } | null {
  const clippedFrom = maxYmd(from, monthStart);
  const clippedTo = minYmd(to, monthEndExclusive);
  if (clippedFrom >= clippedTo) return null;
  return { from: clippedFrom, to: clippedTo };
}

function clipAvailability(
  seg: BookingComAriPushRequest["availability"][number],
  monthStart: string,
  monthEndExclusive: string,
) {
  const range = clipRange(
    seg.dateRange.from,
    seg.dateRange.to,
    monthStart,
    monthEndExclusive,
  );
  if (!range) return null;
  return { ...seg, dateRange: range };
}

function clipRate(
  seg: BookingComAriPushRequest["rates"][number],
  monthStart: string,
  monthEndExclusive: string,
) {
  const range = clipRange(
    seg.dateRange.from,
    seg.dateRange.to,
    monthStart,
    monthEndExclusive,
  );
  if (!range) return null;
  return { ...seg, dateRange: range };
}

function clipRestriction(
  seg: BookingComAriPushRequest["restrictions"][number],
  monthStart: string,
  monthEndExclusive: string,
) {
  const range = clipRange(
    seg.dateRange.from,
    seg.dateRange.to,
    monthStart,
    monthEndExclusive,
  );
  if (!range) return null;
  return { ...seg, dateRange: range };
}

import type { BookingComAriDiffCell } from "@hcp/domain";
import { fingerprintTalosAriCells } from "@hcp/domain";

/**
 * Builds a conservative Talos ARI local projection for initial-sync preview.
 * V1 does not import Booking.com prices; cells are Talos-authored placeholders
 * for mapped roomrates over the requested horizon.
 */
export function buildBookingComLocalAriCells(input: {
  hotelId: string;
  rooms: readonly { roomTypeId: string; ratePlanId: string | null }[];
  from: string;
  to: string;
  roomsToSell?: number;
  price?: number | null;
}): { cells: BookingComAriDiffCell[]; talosStateFingerprint: string } {
  const cells: BookingComAriDiffCell[] = [];
  const dates = enumerateDates(input.from, input.to);
  const roomsToSell = input.roomsToSell ?? 1;

  for (const room of input.rooms) {
    for (const date of dates) {
      cells.push({
        hotelId: input.hotelId,
        roomTypeId: room.roomTypeId,
        ratePlanId: room.ratePlanId,
        date,
        field: "roomstosell",
        local: roomsToSell,
        remote: null,
      });
      cells.push({
        hotelId: input.hotelId,
        roomTypeId: room.roomTypeId,
        ratePlanId: room.ratePlanId,
        date,
        field: "closed",
        local: 0,
        remote: null,
      });
      if (room.ratePlanId && input.price != null) {
        cells.push({
          hotelId: input.hotelId,
          roomTypeId: room.roomTypeId,
          ratePlanId: room.ratePlanId,
          date,
          field: "price",
          local: input.price,
          remote: null,
        });
      }
    }
  }

  return {
    cells,
    talosStateFingerprint: fingerprintTalosAriCells(cells),
  };
}

function enumerateDates(from: string, to: string): string[] {
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return [from];
  }
  const out: string[] = [];
  const cursor = new Date(start);
  let guard = 0;
  while (cursor <= end && guard < 62) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    guard += 1;
  }
  return out;
}

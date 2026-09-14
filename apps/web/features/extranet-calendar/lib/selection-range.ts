import { addDaysIso } from "./timeline-model";

/** Selection dates are inclusive nights; stay uses [checkIn, checkOut). */
export function normalizeSelectionRange(from: string, to: string): { checkIn: string; checkOut: string } {
  const start = from <= to ? from : to;
  const end = from <= to ? to : from;
  return { checkIn: start, checkOut: addDaysIso(end, 1) };
}

export function selectionNightCount(from: string, to: string): number {
  const start = from <= to ? from : to;
  const end = from <= to ? to : from;
  let nights = 0;
  let cursor = start;
  while (cursor <= end) {
    nights += 1;
    cursor = addDaysIso(cursor, 1);
  }
  return nights;
}

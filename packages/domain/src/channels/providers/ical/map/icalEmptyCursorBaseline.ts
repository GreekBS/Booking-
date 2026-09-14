import { parseIcalCalendar } from "../parse/parseIcalCalendar";
import { buildIcalSnapshotIndex } from "./buildIcalSnapshotIndex";
import { encodeIcalCursor } from "./encodeIcalCursor";
import { toIcalDigestIndex } from "./toIcalDigestIndex";

/**
 * Canonical empty VCALENDAR used for semantic-epoch baseline reset.
 * Must remain byte-stable so the frozen cursor payload is reproducible.
 */
const EMPTY_VCALENDAR_BYTES = new TextEncoder().encode(
  "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//HCP//EMPTY-BASELINE//EN\r\nEND:VCALENDAR\r\n",
);

/**
 * Opaque cursor payload equivalent to:
 * encodeIcalCursor(toIcalDigestIndex(buildIcalSnapshotIndex(empty VCALENDAR)))
 *
 * Used by semantic epoch / credential rotation baseline reset.
 * Must not be "", null, arbitrary JSON, or a fake digest.
 */
export const EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD: string = encodeIcalCursor(
  toIcalDigestIndex(buildIcalSnapshotIndex(parseIcalCalendar(EMPTY_VCALENDAR_BYTES))),
);

export function buildEmptyIcalCursorBaselinePayload(): string {
  return EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD;
}

import { parseIcalCursorPayload } from "./icalCursorParser";
import type { IcalCursorDecodeResult } from "./icalMapTypes";

/**
 * Soft decode of a persisted opaque cursor payload.
 * Never throws for corrupt external input.
 */
export function decodeIcalCursor(payload: string | null): IcalCursorDecodeResult {
  if (payload === null) {
    return { status: "absent" };
  }
  if (typeof payload !== "string") {
    return { status: "invalid", issueCode: "CURSOR_INVALID" };
  }
  return parseIcalCursorPayload(payload);
}

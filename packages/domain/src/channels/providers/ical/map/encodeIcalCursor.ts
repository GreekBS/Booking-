import { serializeIcalCursorCanonical } from "./icalCursorCanonicalJson";
import { IcalMapError, wrapIcalMapBoundaryError } from "./icalMapErrors";
import type { IcalDigestIndex } from "./icalMapTypes";

/**
 * Encode a digest index as an opaque canonical cursor payload string.
 */
export function encodeIcalCursor(digest: IcalDigestIndex): string {
  try {
    return serializeIcalCursorCanonical(digest);
  } catch (error) {
    if (error instanceof IcalMapError) {
      throw error;
    }
    wrapIcalMapBoundaryError(error);
  }
}

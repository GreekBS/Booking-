import { IcalParseError } from "./icalParseErrors";
import { ICAL_PARSE_LIMITS } from "./icalParseLimits";

export interface IcalPhysicalLine {
  /** Inclusive start byte offset. */
  readonly start: number;
  /** Exclusive end byte offset (excludes newline bytes). */
  readonly end: number;
}

/**
 * Scan raw bytes for physical lines. Enforces size/count limits and rejects bare CR.
 */
export function scanIcalPhysicalLines(rawBytes: Uint8Array): IcalPhysicalLine[] {
  if (rawBytes.byteLength === 0) {
    throw new IcalParseError("ICAL_PARSE_EMPTY_INPUT", "Calendar input is empty", {
      byteLength: 0,
    });
  }
  if (rawBytes.byteLength > ICAL_PARSE_LIMITS.maxInputBytes) {
    throw new IcalParseError(
      "ICAL_PARSE_LIMIT_EXCEEDED",
      "Calendar input exceeds size limit",
      { byteLength: rawBytes.byteLength, limitKey: "maxInputBytes" },
    );
  }

  const lines: IcalPhysicalLine[] = [];
  let lineStart = 0;
  let i = 0;

  const pushLine = (end: number): void => {
    const length = end - lineStart;
    if (length > ICAL_PARSE_LIMITS.maxPhysicalLineBytes) {
      throw new IcalParseError(
        "ICAL_PARSE_LIMIT_EXCEEDED",
        "Physical line exceeds size limit",
        { limitKey: "maxPhysicalLineBytes", byteLength: length },
      );
    }
    if (lines.length >= ICAL_PARSE_LIMITS.maxPhysicalLines) {
      throw new IcalParseError(
        "ICAL_PARSE_LIMIT_EXCEEDED",
        "Physical line count exceeds limit",
        { limitKey: "maxPhysicalLines" },
      );
    }
    lines.push({ start: lineStart, end });
  };

  while (i < rawBytes.byteLength) {
    const b = rawBytes[i]!;
    if (b === 0x0d) {
      if (i + 1 >= rawBytes.byteLength || rawBytes[i + 1] !== 0x0a) {
        throw new IcalParseError("ICAL_PARSE_BAD_NEWLINE", "Bare CR is not allowed", {
          byteLength: rawBytes.byteLength,
        });
      }
      pushLine(i);
      i += 2;
      lineStart = i;
      continue;
    }
    if (b === 0x0a) {
      pushLine(i);
      i += 1;
      lineStart = i;
      continue;
    }
    i += 1;
  }

  // Final line (possibly empty when file ends with newline — empty physical line OK;
  // empty logical line after unfold is rejected later).
  if (lineStart < rawBytes.byteLength || lines.length === 0) {
    pushLine(rawBytes.byteLength);
  } else if (lineStart === rawBytes.byteLength) {
    // Trailing newline produced an empty physical line — include it for unfold fidelity.
    pushLine(rawBytes.byteLength);
  }

  return lines;
}

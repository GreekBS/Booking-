import { decodeIcalUtf8Strict } from "./decodeIcalText";
import { IcalParseError } from "./icalParseErrors";
import { ICAL_PARSE_LIMITS } from "./icalParseLimits";
import type { IcalPhysicalLine } from "./scanIcalPhysicalLines";

export interface IcalLogicalLine {
  readonly text: string;
  /** 1-based logical line number after unfold. */
  readonly lineNumber: number;
}

function isFoldWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t";
}

function assertNoInternalBom(segments: readonly string[]): void {
  for (let s = 0; s < segments.length; s += 1) {
    const text = segments[s]!;
    const start = s === 0 && text.length > 0 && text.charCodeAt(0) === 0xfeff ? 1 : 0;
    for (let i = start; i < text.length; i += 1) {
      if (text.charCodeAt(i) === 0xfeff) {
        throw new IcalParseError(
          "ICAL_PARSE_BAD_BOM",
          "BOM is only allowed as a leading character",
        );
      }
    }
  }
}

/**
 * Decode physical byte segments, strip one leading BOM, unfold logical lines.
 */
export function unfoldIcalLogicalLines(
  rawBytes: Uint8Array,
  physicalLines: readonly IcalPhysicalLine[],
): IcalLogicalLine[] {
  const segments: string[] = [];
  for (const line of physicalLines) {
    segments.push(decodeIcalUtf8Strict(rawBytes.subarray(line.start, line.end)));
  }

  assertNoInternalBom(segments);

  if (segments.length > 0 && segments[0]!.length > 0 && segments[0]!.charCodeAt(0) === 0xfeff) {
    segments[0] = segments[0]!.slice(1);
  }

  const logical: IcalLogicalLine[] = [];
  let current: string | null = null;
  let logicalNumber = 0;

  const flush = (): void => {
    if (current === null) {
      return;
    }
    if (current.length === 0) {
      throw new IcalParseError("ICAL_PARSE_MALFORMED_FOLDING", "Empty logical content line", {
        lineNumber: logicalNumber + 1,
      });
    }
    if (current.length > ICAL_PARSE_LIMITS.maxLogicalLineUtf16Length) {
      throw new IcalParseError(
        "ICAL_PARSE_LIMIT_EXCEEDED",
        "Logical line exceeds size limit",
        { lineNumber: logicalNumber + 1, limitKey: "maxLogicalLineUtf16Length" },
      );
    }
    if (logical.length >= ICAL_PARSE_LIMITS.maxLogicalLines) {
      throw new IcalParseError(
        "ICAL_PARSE_LIMIT_EXCEEDED",
        "Logical line count exceeds limit",
        { limitKey: "maxLogicalLines" },
      );
    }
    logicalNumber += 1;
    logical.push({ text: current, lineNumber: logicalNumber });
    current = null;
  };

  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i]!;

    // Trailing empty physical line from a final newline is not a content line.
    if (segment.length === 0 && i === segments.length - 1) {
      flush();
      continue;
    }

    if (segment.length > 0 && isFoldWhitespace(segment[0]!)) {
      if (current === null) {
        throw new IcalParseError(
          "ICAL_PARSE_MALFORMED_FOLDING",
          "Orphan continuation line",
          { lineNumber: i + 1 },
        );
      }
      current += segment.slice(1);
      if (current.length > ICAL_PARSE_LIMITS.maxLogicalLineUtf16Length) {
        throw new IcalParseError(
          "ICAL_PARSE_LIMIT_EXCEEDED",
          "Logical line exceeds size limit",
          { limitKey: "maxLogicalLineUtf16Length" },
        );
      }
      continue;
    }

    flush();
    current = segment;
  }
  flush();

  if (logical.length === 0) {
    throw new IcalParseError("ICAL_PARSE_EMPTY_INPUT", "Calendar input is empty");
  }

  return logical;
}

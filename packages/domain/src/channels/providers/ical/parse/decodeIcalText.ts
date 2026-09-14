import { IcalParseError } from "./icalParseErrors";

/**
 * Strict fatal UTF-8 decode. Rejects overlong encodings, surrogates, and NUL.
 */
export function decodeIcalUtf8Strict(bytes: Uint8Array): string {
  let result = "";
  let index = 0;

  while (index < bytes.length) {
    const b0 = bytes[index]!;

    if (b0 === 0x00) {
      throw new IcalParseError("ICAL_PARSE_NUL_REJECTED", "NUL byte is not allowed");
    }

    if (b0 < 0x80) {
      result += String.fromCharCode(b0);
      index += 1;
      continue;
    }

    if ((b0 & 0xe0) === 0xc0) {
      if (index + 1 >= bytes.length) {
        throw new IcalParseError("ICAL_PARSE_INVALID_UTF8", "Invalid UTF-8 sequence");
      }
      const b1 = bytes[index + 1]!;
      if ((b1 & 0xc0) !== 0x80 || b0 < 0xc2) {
        throw new IcalParseError("ICAL_PARSE_INVALID_UTF8", "Invalid UTF-8 sequence");
      }
      const code = ((b0 & 0x1f) << 6) | (b1 & 0x3f);
      if (code === 0) {
        throw new IcalParseError("ICAL_PARSE_NUL_REJECTED", "NUL byte is not allowed");
      }
      result += String.fromCharCode(code);
      index += 2;
      continue;
    }

    if ((b0 & 0xf0) === 0xe0) {
      if (index + 2 >= bytes.length) {
        throw new IcalParseError("ICAL_PARSE_INVALID_UTF8", "Invalid UTF-8 sequence");
      }
      const b1 = bytes[index + 1]!;
      const b2 = bytes[index + 2]!;
      if ((b1 & 0xc0) !== 0x80 || (b2 & 0xc0) !== 0x80) {
        throw new IcalParseError("ICAL_PARSE_INVALID_UTF8", "Invalid UTF-8 sequence");
      }
      if (b0 === 0xe0 && b1 < 0xa0) {
        throw new IcalParseError("ICAL_PARSE_INVALID_UTF8", "Invalid UTF-8 sequence");
      }
      if (b0 === 0xed && b1 >= 0xa0) {
        throw new IcalParseError("ICAL_PARSE_INVALID_UTF8", "Invalid UTF-8 sequence");
      }
      const code = ((b0 & 0x0f) << 12) | ((b1 & 0x3f) << 6) | (b2 & 0x3f);
      if (code === 0) {
        throw new IcalParseError("ICAL_PARSE_NUL_REJECTED", "NUL byte is not allowed");
      }
      result += String.fromCharCode(code);
      index += 3;
      continue;
    }

    if ((b0 & 0xf8) === 0xf0) {
      if (index + 3 >= bytes.length) {
        throw new IcalParseError("ICAL_PARSE_INVALID_UTF8", "Invalid UTF-8 sequence");
      }
      const b1 = bytes[index + 1]!;
      const b2 = bytes[index + 2]!;
      const b3 = bytes[index + 3]!;
      if ((b1 & 0xc0) !== 0x80 || (b2 & 0xc0) !== 0x80 || (b3 & 0xc0) !== 0x80) {
        throw new IcalParseError("ICAL_PARSE_INVALID_UTF8", "Invalid UTF-8 sequence");
      }
      if (b0 === 0xf0 && b1 < 0x90) {
        throw new IcalParseError("ICAL_PARSE_INVALID_UTF8", "Invalid UTF-8 sequence");
      }
      if (b0 > 0xf4 || (b0 === 0xf4 && b1 > 0x8f)) {
        throw new IcalParseError("ICAL_PARSE_INVALID_UTF8", "Invalid UTF-8 sequence");
      }
      const code =
        ((b0 & 0x07) << 18) | ((b1 & 0x3f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f);
      if (code > 0x10ffff) {
        throw new IcalParseError("ICAL_PARSE_INVALID_UTF8", "Invalid UTF-8 sequence");
      }
      const offset = code - 0x10000;
      result += String.fromCharCode(0xd800 + (offset >> 10), 0xdc00 + (offset & 0x3ff));
      index += 4;
      continue;
    }

    throw new IcalParseError("ICAL_PARSE_INVALID_UTF8", "Invalid UTF-8 sequence");
  }

  return result;
}

/**
 * Strip exactly one leading BOM. Internal BOM is rejected.
 */
export function stripLeadingBomOrReject(text: string): string {
  if (text.length === 0) {
    return text;
  }
  let start = 0;
  if (text.charCodeAt(0) === 0xfeff) {
    start = 1;
  }
  for (let i = start; i < text.length; i += 1) {
    if (text.charCodeAt(i) === 0xfeff) {
      throw new IcalParseError("ICAL_PARSE_BAD_BOM", "BOM is only allowed as a leading character");
    }
  }
  return start === 0 ? text : text.slice(1);
}

/**
 * TEXT value unescape for SUMMARY/DESCRIPTION/LOCATION only.
 * Returns null on invalid escape (caller emits INVALID_TEXT_ESCAPE).
 */
export function decodeIcalTextValue(value: string): string | null {
  let out = "";
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i]!;
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    if (i + 1 >= value.length) {
      return null;
    }
    const next = value[i + 1]!;
    i += 1;
    if (next === "\\" || next === ";" || next === ",") {
      out += next;
    } else if (next === "n" || next === "N") {
      out += "\n";
    } else {
      return null;
    }
  }
  return out;
}

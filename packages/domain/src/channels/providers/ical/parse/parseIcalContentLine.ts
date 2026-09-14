import { IcalParseError } from "./icalParseErrors";
import { ICAL_PARSE_LIMITS } from "./icalParseLimits";
import type { NormalizedIcalParameter } from "./icalParseTypes";

const NAME_CHAR = /^[A-Za-z0-9-]+$/;

export interface ParsedIcalContentLine {
  readonly name: string;
  readonly parameters: readonly NormalizedIcalParameter[];
  readonly value: string;
}

function isControlChar(code: number): boolean {
  return (
    (code >= 0x00 && code <= 0x08) ||
    code === 0x0b ||
    code === 0x0c ||
    (code >= 0x0e && code <= 0x1f) ||
    code === 0x7f
  );
}

function assertNoControls(line: string, lineNumber?: number): void {
  for (let i = 0; i < line.length; i += 1) {
    if (isControlChar(line.charCodeAt(i))) {
      throw new IcalParseError(
        "ICAL_PARSE_CONTROL_CHARACTER",
        "Control character is not allowed",
        { lineNumber },
      );
    }
  }
}

function parseParamValues(
  input: string,
  start: number,
  lineNumber?: number,
): { values: string[]; nextIndex: number } {
  const values: string[] = [];
  let i = start;

  const pushValue = (value: string): void => {
    if (values.length >= ICAL_PARSE_LIMITS.maxValuesPerParameter) {
      throw new IcalParseError(
        "ICAL_PARSE_LIMIT_EXCEEDED",
        "Parameter value count exceeds limit",
        { lineNumber, limitKey: "maxValuesPerParameter" },
      );
    }
    values.push(value);
  };

  while (i <= input.length) {
    if (i >= input.length || input[i] === ";" || input[i] === ":") {
      // Empty value at end of param section (PARAM=)
      if (values.length === 0) {
        pushValue("");
      }
      return { values, nextIndex: i };
    }

    if (input[i] === '"') {
      // Quoted value token
      i += 1;
      let value = "";
      let closed = false;
      while (i < input.length) {
        const ch = input[i]!;
        if (ch === '"') {
          closed = true;
          i += 1;
          break;
        }
        // No escaped DQUOTE support
        value += ch;
        i += 1;
      }
      if (!closed) {
        throw new IcalParseError(
          "ICAL_PARSE_MALFORMED_PARAMETER",
          "Unmatched quote in parameter value",
          { lineNumber },
        );
      }
      pushValue(value);
      if (i >= input.length) {
        return { values, nextIndex: i };
      }
      const next = input[i]!;
      if (next === ",") {
        i += 1;
        continue;
      }
      if (next === ";" || next === ":") {
        return { values, nextIndex: i };
      }
      throw new IcalParseError(
        "ICAL_PARSE_MALFORMED_PARAMETER",
        "Invalid characters after quoted parameter value",
        { lineNumber },
      );
    }

    // Unquoted value token
    if (input[i] === '"') {
      throw new IcalParseError(
        "ICAL_PARSE_MALFORMED_PARAMETER",
        "Invalid quote in parameter value",
        { lineNumber },
      );
    }
    let value = "";
    while (i < input.length) {
      const ch = input[i]!;
      if (ch === "," || ch === ";" || ch === ":") {
        break;
      }
      if (ch === '"') {
        throw new IcalParseError(
          "ICAL_PARSE_MALFORMED_PARAMETER",
          "QUOTE is not allowed in unquoted parameter value",
          { lineNumber },
        );
      }
      value += ch;
      i += 1;
    }
    pushValue(value);
    if (i >= input.length) {
      return { values, nextIndex: i };
    }
    if (input[i] === ",") {
      i += 1;
      continue;
    }
    return { values, nextIndex: i };
  }

  return { values, nextIndex: i };
}

/**
 * State-aware content-line parse. Does not TEXT-unescape the value.
 */
export function parseIcalContentLine(
  line: string,
  lineNumber?: number,
): ParsedIcalContentLine {
  assertNoControls(line, lineNumber);

  if (line.length === 0) {
    throw new IcalParseError("ICAL_PARSE_MALFORMED_PROPERTY", "Empty content line", {
      lineNumber,
    });
  }

  // Name
  let i = 0;
  while (i < line.length) {
    const ch = line[i]!;
    if (ch === ";" || ch === ":") {
      break;
    }
    if (ch === ".") {
      throw new IcalParseError(
        "ICAL_PARSE_MALFORMED_PROPERTY",
        "Property group prefixes are not allowed",
        { lineNumber },
      );
    }
    i += 1;
  }
  const rawName = line.slice(0, i);
  if (rawName.length === 0 || !NAME_CHAR.test(rawName)) {
    throw new IcalParseError("ICAL_PARSE_MALFORMED_PROPERTY", "Invalid property name", {
      lineNumber,
    });
  }
  if (rawName.length > ICAL_PARSE_LIMITS.maxNameUtf16Length) {
    throw new IcalParseError(
      "ICAL_PARSE_LIMIT_EXCEEDED",
      "Property name exceeds size limit",
      { lineNumber, limitKey: "maxNameUtf16Length" },
    );
  }
  const name = rawName.toUpperCase();

  const parameters: NormalizedIcalParameter[] = [];
  let aggregateParamUtf16 = 0;

  while (i < line.length && line[i] === ";") {
    if (parameters.length >= ICAL_PARSE_LIMITS.maxParamsPerProperty) {
      throw new IcalParseError(
        "ICAL_PARSE_LIMIT_EXCEEDED",
        "Parameter count exceeds limit",
        { lineNumber, limitKey: "maxParamsPerProperty" },
      );
    }
    i += 1; // skip ;
    const nameStart = i;
    while (i < line.length) {
      const ch = line[i]!;
      if (ch === "=" || ch === ";" || ch === ":") {
        break;
      }
      i += 1;
    }
    const rawParamName = line.slice(nameStart, i);
    if (rawParamName.length === 0 || !NAME_CHAR.test(rawParamName)) {
      throw new IcalParseError(
        "ICAL_PARSE_MALFORMED_PARAMETER",
        "Invalid parameter name",
        { lineNumber },
      );
    }
    if (rawParamName.length > ICAL_PARSE_LIMITS.maxNameUtf16Length) {
      throw new IcalParseError(
        "ICAL_PARSE_LIMIT_EXCEEDED",
        "Parameter name exceeds size limit",
        { lineNumber, limitKey: "maxNameUtf16Length" },
      );
    }
    if (i >= line.length || line[i] !== "=") {
      throw new IcalParseError(
        "ICAL_PARSE_MALFORMED_PARAMETER",
        "Parameter is missing a value",
        { lineNumber },
      );
    }
    i += 1; // skip =
    const parsed = parseParamValues(line, i, lineNumber);
    i = parsed.nextIndex;
    for (const v of parsed.values) {
      aggregateParamUtf16 += v.length;
    }
    if (aggregateParamUtf16 > ICAL_PARSE_LIMITS.maxAggregateParamValuesUtf16Length) {
      throw new IcalParseError(
        "ICAL_PARSE_LIMIT_EXCEEDED",
        "Aggregate parameter value size exceeds limit",
        { lineNumber, limitKey: "maxAggregateParamValuesUtf16Length" },
      );
    }
    parameters.push({
      name: rawParamName.toUpperCase(),
      values: parsed.values,
    });
  }

  if (i >= line.length || line[i] !== ":") {
    throw new IcalParseError(
      "ICAL_PARSE_MALFORMED_PROPERTY",
      "Content line is missing a value separator",
      { lineNumber },
    );
  }
  i += 1; // skip :
  const value = line.slice(i);
  if (value.length > ICAL_PARSE_LIMITS.maxPropertyValueUtf16Length) {
    throw new IcalParseError(
      "ICAL_PARSE_LIMIT_EXCEEDED",
      "Property value exceeds size limit",
      { lineNumber, limitKey: "maxPropertyValueUtf16Length" },
    );
  }

  return { name, parameters, value };
}

export function parseBeginOrEndLine(
  line: string,
  lineNumber?: number,
): { kind: "BEGIN" | "END"; componentName: string } | null {
  const parsed = parseIcalContentLine(line, lineNumber);
  if (parsed.name !== "BEGIN" && parsed.name !== "END") {
    return null;
  }
  if (parsed.parameters.length > 0) {
    throw new IcalParseError(
      "ICAL_PARSE_MALFORMED_BEGIN_END",
      "BEGIN/END must not include parameters",
      { lineNumber },
    );
  }
  if (parsed.value.length === 0 || !NAME_CHAR.test(parsed.value)) {
    throw new IcalParseError(
      "ICAL_PARSE_MALFORMED_BEGIN_END",
      "BEGIN/END component name is invalid",
      { lineNumber },
    );
  }
  // Reject surrounding whitespace by requiring exact token (no WSP in value).
  if (/[\t ]/.test(parsed.value)) {
    throw new IcalParseError(
      "ICAL_PARSE_MALFORMED_BEGIN_END",
      "BEGIN/END component name must not include whitespace",
      { lineNumber },
    );
  }
  return {
    kind: parsed.name,
    componentName: parsed.value.toUpperCase(),
  };
}

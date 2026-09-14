import type { IcalParseIssueCode } from "./icalParseIssueCodes";
import type {
  NormalizedIcalDateTime,
  NormalizedIcalParameter,
  NormalizedIcalProperty,
} from "./icalParseTypes";

export type TemporalPropertyName =
  | "DTSTART"
  | "DTEND"
  | "RECURRENCE-ID"
  | "DTSTAMP"
  | "CREATED"
  | "LAST-MODIFIED";

export type TemporalSchema = {
  defaultType: "DATE" | "DATE-TIME";
  allowDate: boolean;
  dateRequiresExplicitValue: boolean;
  allowDateTime: boolean;
  allowTzId: boolean;
  allowUtc: boolean;
  allowFloating: boolean;
  requireUtc: boolean;
};

export const TEMPORAL_SCHEMAS: Record<TemporalPropertyName, TemporalSchema> = {
  DTSTART: {
    defaultType: "DATE-TIME",
    allowDate: true,
    dateRequiresExplicitValue: true,
    allowDateTime: true,
    allowTzId: true,
    allowUtc: true,
    allowFloating: true,
    requireUtc: false,
  },
  DTEND: {
    defaultType: "DATE-TIME",
    allowDate: true,
    dateRequiresExplicitValue: true,
    allowDateTime: true,
    allowTzId: true,
    allowUtc: true,
    allowFloating: true,
    requireUtc: false,
  },
  "RECURRENCE-ID": {
    defaultType: "DATE-TIME",
    allowDate: true,
    dateRequiresExplicitValue: true,
    allowDateTime: true,
    allowTzId: true,
    allowUtc: true,
    allowFloating: true,
    requireUtc: false,
  },
  DTSTAMP: {
    defaultType: "DATE-TIME",
    allowDate: false,
    dateRequiresExplicitValue: false,
    allowDateTime: true,
    allowTzId: false,
    allowUtc: true,
    allowFloating: false,
    requireUtc: true,
  },
  CREATED: {
    defaultType: "DATE-TIME",
    allowDate: false,
    dateRequiresExplicitValue: false,
    allowDateTime: true,
    allowTzId: false,
    allowUtc: true,
    allowFloating: false,
    requireUtc: true,
  },
  "LAST-MODIFIED": {
    defaultType: "DATE-TIME",
    allowDate: false,
    dateRequiresExplicitValue: false,
    allowDateTime: true,
    allowTzId: false,
    allowUtc: true,
    allowFloating: false,
    requireUtc: true,
  },
};

const DAYS_IN_MONTH = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  return DAYS_IN_MONTH[month] ?? 0;
}

function parseDigits(text: string, start: number, length: number): number | null {
  if (start + length > text.length) {
    return null;
  }
  let value = 0;
  for (let i = 0; i < length; i += 1) {
    const code = text.charCodeAt(start + i);
    if (code < 0x30 || code > 0x39) {
      return null;
    }
    value = value * 10 + (code - 0x30);
  }
  return value;
}

function validateYmd(year: number, month: number, day: number): boolean {
  if (year < 1 || year > 9999) {
    return false;
  }
  if (month < 1 || month > 12) {
    return false;
  }
  if (day < 1 || day > daysInMonth(year, month)) {
    return false;
  }
  return true;
}

function collectParamValues(
  parameters: readonly NormalizedIcalParameter[],
  name: string,
): string[] {
  const out: string[] = [];
  for (const param of parameters) {
    if (param.name === name) {
      for (const v of param.values) {
        out.push(v);
      }
    }
  }
  return out;
}

export type TemporalNormalizeResult =
  | { ok: true; value: NormalizedIcalDateTime }
  | { ok: false; issue: IcalParseIssueCode };

/**
 * Schema-aware temporal normalization. Never uses JavaScript Date.
 */
export function normalizeIcalDateTime(
  propertyName: TemporalPropertyName,
  property: NormalizedIcalProperty,
): TemporalNormalizeResult {
  const schema = TEMPORAL_SCHEMAS[propertyName];
  const valueParams = collectParamValues(property.parameters, "VALUE");
  const tzidParams = collectParamValues(property.parameters, "TZID");

  if (valueParams.length > 1) {
    return { ok: false, issue: "DUPLICATE_VALUE_PARAMETER" };
  }
  if (tzidParams.length > 1) {
    return { ok: false, issue: "DUPLICATE_TZID_PARAMETER" };
  }

  let explicitValue: "DATE" | "DATE-TIME" | null = null;
  if (valueParams.length === 1) {
    const raw = valueParams[0]!.toUpperCase();
    if (raw === "DATE") {
      explicitValue = "DATE";
    } else if (raw === "DATE-TIME") {
      explicitValue = "DATE-TIME";
    } else {
      return { ok: false, issue: "UNSUPPORTED_VALUE_PARAMETER" };
    }
  }

  const intendedType = explicitValue ?? schema.defaultType;

  if (intendedType === "DATE") {
    if (!schema.allowDate) {
      return { ok: false, issue: "DISALLOWED_TEMPORAL_FORM" };
    }
    if (schema.dateRequiresExplicitValue && explicitValue !== "DATE") {
      return { ok: false, issue: "VALUE_TYPE_MISMATCH" };
    }
    if (tzidParams.length === 1) {
      if (tzidParams[0] === "") {
        return { ok: false, issue: "EMPTY_TZID" };
      }
      return { ok: false, issue: "TZID_ON_DATE" };
    }
    return parseDateValue(property.value);
  }

  // DATE-TIME intended
  if (!schema.allowDateTime) {
    return { ok: false, issue: "DISALLOWED_TEMPORAL_FORM" };
  }
  if (explicitValue === "DATE") {
    return { ok: false, issue: "VALUE_TYPE_MISMATCH" };
  }

  // Reject DATE-shaped values when DATE-TIME is intended (no silent DATE inference).
  if (/^\d{8}$/.test(property.value)) {
    return { ok: false, issue: "VALUE_TYPE_MISMATCH" };
  }

  return parseDateTimeValue(property.value, tzidParams, schema);
}

function parseDateValue(raw: string): TemporalNormalizeResult {
  if (!/^\d{8}$/.test(raw)) {
    return { ok: false, issue: "UNSUPPORTED_DATETIME_FORM" };
  }
  const year = parseDigits(raw, 0, 4)!;
  const month = parseDigits(raw, 4, 2)!;
  const day = parseDigits(raw, 6, 2)!;
  if (!validateYmd(year, month, day)) {
    return { ok: false, issue: "UNSUPPORTED_DATETIME_FORM" };
  }
  return {
    ok: true,
    value: { kind: "date", year, month, day, value: raw },
  };
}

function parseDateTimeValue(
  raw: string,
  tzidParams: string[],
  schema: TemporalSchema,
): TemporalNormalizeResult {
  // Reject fractions and numeric offsets early.
  if (raw.includes(".") || /[+-]\d{4}$/.test(raw) || /[+-]\d{2}:\d{2}$/.test(raw)) {
    return { ok: false, issue: "UNSUPPORTED_DATETIME_FORM" };
  }

  const utc = raw.endsWith("Z");
  const body = utc ? raw.slice(0, -1) : raw;
  if (!/^\d{8}T\d{6}$/.test(body)) {
    return { ok: false, issue: "UNSUPPORTED_DATETIME_FORM" };
  }

  const year = parseDigits(body, 0, 4)!;
  const month = parseDigits(body, 4, 2)!;
  const day = parseDigits(body, 6, 2)!;
  const hour = parseDigits(body, 9, 2)!;
  const minute = parseDigits(body, 11, 2)!;
  const second = parseDigits(body, 13, 2)!;

  if (!validateYmd(year, month, day)) {
    return { ok: false, issue: "UNSUPPORTED_DATETIME_FORM" };
  }
  if (hour > 23 || minute > 59) {
    return { ok: false, issue: "UNSUPPORTED_DATETIME_FORM" };
  }
  if (second === 60) {
    return { ok: false, issue: "UNSUPPORTED_LEAP_SECOND" };
  }
  if (second > 59) {
    return { ok: false, issue: "UNSUPPORTED_DATETIME_FORM" };
  }

  if (tzidParams.length === 1 && tzidParams[0] === "") {
    return { ok: false, issue: "EMPTY_TZID" };
  }

  if (utc) {
    if (!schema.allowUtc) {
      return { ok: false, issue: "DISALLOWED_TEMPORAL_FORM" };
    }
    if (tzidParams.length > 0) {
      return { ok: false, issue: "TZID_WITH_UTC" };
    }
    return {
      ok: true,
      value: {
        kind: "dateTimeUtc",
        year,
        month,
        day,
        hour,
        minute,
        second,
        value: raw,
      },
    };
  }

  if (tzidParams.length === 1) {
    if (!schema.allowTzId) {
      return { ok: false, issue: "DISALLOWED_TEMPORAL_FORM" };
    }
    return {
      ok: true,
      value: {
        kind: "dateTimeWithTzId",
        year,
        month,
        day,
        hour,
        minute,
        second,
        tzId: tzidParams[0],
        value: raw,
      },
    };
  }

  // Floating
  if (schema.requireUtc) {
    return { ok: false, issue: "DISALLOWED_TEMPORAL_FORM" };
  }
  if (!schema.allowFloating) {
    return { ok: false, issue: "DISALLOWED_TEMPORAL_FORM" };
  }
  return {
    ok: true,
    value: {
      kind: "dateTimeFloating",
      year,
      month,
      day,
      hour,
      minute,
      second,
      value: raw,
    },
  };
}
